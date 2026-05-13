import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeActorId, normalizeRole, publicMvpUser } from "../config/runtimeDefaults.js";
import { LOCAL_MVP_USER_ACCOUNTS } from "./auth.js";
import { hashPassword, isPasswordHash, verifyPassword } from "./passwords.js";

const DEFAULT_ROOT_DIR = process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data";

export function createUserDirectory({ rootDir = DEFAULT_ROOT_DIR } = {}) {
  const absoluteRoot = path.resolve(rootDir);
  const identityDir = path.join(absoluteRoot, "identity");
  const usersFile = path.join(identityDir, "users.json");

  return {
    async ensureSeeded() {
      try {
        return normalizeUsersFile(JSON.parse(await readFile(usersFile, "utf8")));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const seeded = {
        version: 1,
        users: LOCAL_MVP_USER_ACCOUNTS.map((user) => normalizeStoredUser(user)).filter(Boolean),
      };
      await writeUsersFile(seeded);
      return seeded;
    },
    async listUsers(options = {}) {
      const file = await this.ensureSeeded();
      const role = normalizeRole(options.role || "", "");
      return file.users
        .filter((user) => user.active !== false)
        .filter((user) => !role || user.role === role)
        .map(publicUser)
        .sort((left, right) => left.user_id.localeCompare(right.user_id));
    },
    async listUsersByRole(role) {
      return this.listUsers({ role });
    },
    async writeUsers(users = []) {
      const file = {
        version: 1,
        users: users.map((user) => normalizeStoredUser(user)).filter(Boolean),
      };
      await writeUsersFile(file);
      return file.users.map(publicUser);
    },
    async createUser(input = {}) {
      const file = await this.ensureSeeded();
      const userId = normalizeActorId(input.userId || input.user_id);
      const role = normalizeRole(input.role, "");
      if (!userId) throw userDirectoryError("user_id_required", "User ID is required", 400);
      if (!role) throw userDirectoryError("role_required", "A valid role is required", 400);
      if (!String(input.password || input.password_hash || "").trim()) {
        throw userDirectoryError("password_required", "Password is required", 400);
      }
      if (Object.hasOwn(input, "password")) validatePasswordPolicy(input.password);
      const user = normalizeStoredUser({ ...input, user_id: userId, role });
      if (file.users.some((item) => item.user_id === user.user_id)) {
        throw userDirectoryError("user_already_exists", "User already exists", 409);
      }
      const next = {
        version: file.version || 1,
        users: [...file.users, user],
      };
      await writeUsersFile(next);
      return publicUser(user);
    },
    async updateUser(userId, input = {}) {
      const normalizedUserId = normalizeActorId(userId || input.userId || input.user_id);
      if (!normalizedUserId) throw userDirectoryError("user_id_required", "User ID is required", 400);
      const file = await this.ensureSeeded();
      const existing = file.users.find((user) => user.user_id === normalizedUserId);
      if (!existing) throw userDirectoryError("user_not_found", "User not found", 404);
      const updated = normalizeUpdatedUser(existing, input);
      const next = {
        version: file.version || 1,
        users: file.users.map((user) => user.user_id === normalizedUserId ? updated : user),
      };
      await writeUsersFile(next);
      return publicUser(updated);
    },
    async deactivateUser(userId) {
      return this.updateUser(userId, { active: false });
    },
    async reactivateUser(userId) {
      return this.updateUser(userId, { active: true });
    },
    async validateCredentials(input = {}) {
      const userId = normalizeActorId(input.userId || input.user_id);
      const password = String(input.password || "");
      const file = await this.ensureSeeded();
      const user = file.users.find((item) => item.user_id === userId && item.active !== false);
      if (!user || !verifyPassword(password, user)) return null;
      return publicUser(user);
    },
    async userHasRole(userId, role) {
      const normalizedRole = normalizeRole(role, "");
      if (!normalizedRole) return false;
      const file = await this.ensureSeeded();
      return file.users.some((user) => (
        user.active !== false &&
        user.user_id === normalizeActorId(userId) &&
        user.role === normalizedRole
      ));
    },
  };

  async function writeUsersFile(file) {
    await mkdir(identityDir, { recursive: true });
    await writeFile(usersFile, `${JSON.stringify(file, null, 2)}\n`);
  }
}

export const defaultUserDirectory = createUserDirectory();

export function ensureUserDirectorySeeded() {
  return defaultUserDirectory.ensureSeeded();
}

export function listUsers(options = {}) {
  return defaultUserDirectory.listUsers(options);
}

export function listUsersByRole(role) {
  return defaultUserDirectory.listUsersByRole(role);
}

export function validateUserCredentials(input = {}) {
  return defaultUserDirectory.validateCredentials(input);
}

export function directoryUserHasRole(userId, role) {
  return defaultUserDirectory.userHasRole(userId, role);
}

export function createUser(input = {}) {
  return defaultUserDirectory.createUser(input);
}

export function updateUser(userId, input = {}) {
  return defaultUserDirectory.updateUser(userId, input);
}

export function deactivateUser(userId) {
  return defaultUserDirectory.deactivateUser(userId);
}

export function reactivateUser(userId) {
  return defaultUserDirectory.reactivateUser(userId);
}

function normalizeUsersFile(file = {}) {
  return {
    version: Number(file.version || 1),
    users: Array.isArray(file.users)
      ? file.users.map((user) => normalizeStoredUser(user)).filter(Boolean)
      : [],
  };
}

function normalizeStoredUser(user = {}) {
  const userId = normalizeActorId(user.userId || user.user_id);
  const role = normalizeRole(user.role, "");
  if (!userId || !role) return null;
  return {
    user_id: userId,
    role,
    display_name: String(user.display_name || user.displayName || userId).trim(),
    password_hash: normalizePasswordHash(user.password_hash) || hashPassword(user.password),
    active: user.active !== false,
  };
}

function normalizeUpdatedUser(existing, input = {}) {
  const nextRole = Object.hasOwn(input, "role")
    ? normalizeRole(input.role, "")
    : existing.role;
  if (!nextRole) throw userDirectoryError("role_required", "A valid role is required", 400);

  const updated = {
    ...existing,
    role: nextRole,
  };

  if (Object.hasOwn(input, "display_name") || Object.hasOwn(input, "displayName")) {
    updated.display_name = String(input.display_name || input.displayName || existing.user_id).trim();
  }
  if (Object.hasOwn(input, "password")) {
    const password = String(input.password || "");
    if (!password) throw userDirectoryError("password_required", "Password is required", 400);
    validatePasswordPolicy(password);
    updated.password = password;
    updated.password_hash = "";
  }
  if (Object.hasOwn(input, "active")) {
    updated.active = input.active !== false;
  }

  return normalizeStoredUser(updated);
}

function normalizePasswordHash(value) {
  const passwordHash = String(value || "");
  return isPasswordHash(passwordHash) ? passwordHash : "";
}

function validatePasswordPolicy(value) {
  const password = String(value || "");
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumberOrSymbol = /[0-9]/.test(password) || /[^A-Za-z0-9\s]/.test(password);
  if (password.length < 8 || !hasLetter || !hasNumberOrSymbol) {
    throw userDirectoryError(
      "weak_password",
      "Password must be at least 8 characters and include letters plus a number or symbol",
      400,
    );
  }
}

function publicUser(user = {}) {
  const publicRecord = publicMvpUser(user);
  return publicRecord ? { ...publicRecord, active: user.active !== false } : null;
}

function userDirectoryError(code, message, statusCode) {
  return Object.assign(new Error(message), { code, statusCode });
}
