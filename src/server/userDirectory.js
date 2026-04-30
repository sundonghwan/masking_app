import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeActorId, normalizeRole, publicMvpUser } from "../config/runtimeDefaults.js";
import { LOCAL_MVP_USER_ACCOUNTS } from "./auth.js";

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
    async validateCredentials(input = {}) {
      const userId = normalizeActorId(input.userId || input.user_id);
      const password = String(input.password || "");
      const file = await this.ensureSeeded();
      const user = file.users.find((item) => item.user_id === userId && item.active !== false);
      if (!user || String(user.password || "") !== password) return null;
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
    password: String(user.password || ""),
    active: user.active !== false,
  };
}

function publicUser(user = {}) {
  return publicMvpUser(user);
}
