import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_ACTORS, ROLES, normalizeActorId, normalizeRole } from "../config/runtimeDefaults.js";
import { createSessionToken } from "./sessionToken.js";

const DEFAULT_ROOT_DIR = process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function createSessionStore({ rootDir = DEFAULT_ROOT_DIR, defaultTtlMs = process.env.MASKING_APP_SESSION_TTL_MS } = {}) {
  const sessionsDir = path.join(path.resolve(rootDir), "identity", "sessions");
  const configuredTtlMs = normalizeSessionTtlMs(defaultTtlMs, DEFAULT_TTL_MS);

  return {
    async createSession(input = {}) {
      const now = input.now instanceof Date ? input.now : new Date();
      const ttlMs = Number.isFinite(Number(input.ttlMs)) ? Number(input.ttlMs) : configuredTtlMs;
      const userId = normalizeActorId(input.userId || input.user_id || DEFAULT_ACTORS.admin);
      const role = normalizeRole(input.role, ROLES.WORKER);
      const session = {
        token: input.token || createSessionToken(),
        user_id: userId,
        userId,
        role,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttlMs).toISOString(),
      };
      await mkdir(sessionsDir, { recursive: true });
      await writeFile(sessionPath(session.token), `${JSON.stringify(session, null, 2)}\n`);
      return session;
    },
    async readSession(token) {
      const safeToken = sanitizeToken(token);
      if (!safeToken) return null;
      try {
        const session = normalizeSession(JSON.parse(await readFile(sessionPath(safeToken), "utf8")));
        if (isExpired(session, new Date())) {
          await this.deleteSession(safeToken);
          return null;
        }
        return session;
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async deleteSession(token) {
      const safeToken = sanitizeToken(token);
      if (!safeToken) return false;
      try {
        await rm(sessionPath(safeToken), { force: false });
        return true;
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    },
    async deleteSessionsForUser(userId) {
      const normalizedUserId = normalizeActorId(userId);
      if (!normalizedUserId) return { deleted: 0 };
      let entries = [];
      try {
        entries = await readdir(sessionsDir, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return { deleted: 0 };
        throw error;
      }
      let deleted = 0;
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const token = entry.name.slice(0, -5);
        try {
          const session = normalizeSession(JSON.parse(await readFile(sessionPath(token), "utf8")));
          if (session.user_id === normalizedUserId) {
            await rm(sessionPath(token), { force: true });
            deleted += 1;
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      return { deleted };
    },
    async cleanupExpiredSessions(options = {}) {
      const now = options.now instanceof Date ? options.now : new Date();
      let entries = [];
      try {
        entries = await readdir(sessionsDir, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return { deleted: 0 };
        throw error;
      }
      let deleted = 0;
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const token = entry.name.slice(0, -5);
        try {
          const session = normalizeSession(JSON.parse(await readFile(sessionPath(token), "utf8")));
          if (isExpired(session, now)) {
            await rm(sessionPath(token), { force: true });
            deleted += 1;
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      return { deleted };
    },
  };

  function sessionPath(token) {
    return path.join(sessionsDir, `${sanitizeToken(token)}.json`);
  }
}

export const defaultSessionStore = createSessionStore();

export function createSession(input = {}) {
  return defaultSessionStore.createSession(input);
}

export function readSession(token) {
  return defaultSessionStore.readSession(token);
}

export function deleteSession(token) {
  return defaultSessionStore.deleteSession(token);
}

export function deleteSessionsForUser(userId) {
  return defaultSessionStore.deleteSessionsForUser(userId);
}

export function cleanupExpiredSessions(options = {}) {
  return defaultSessionStore.cleanupExpiredSessions(options);
}

function sanitizeToken(token) {
  return String(token || "").trim().replace(/[^a-zA-Z0-9._-]/g, "");
}

function normalizeSession(session = {}) {
  const userId = normalizeActorId(session.userId || session.user_id);
  return {
    token: sanitizeToken(session.token),
    user_id: userId,
    userId,
    role: normalizeRole(session.role, ""),
    created_at: session.created_at || "",
    expires_at: session.expires_at || "",
  };
}

function isExpired(session, now) {
  const expires = Date.parse(session.expires_at);
  return Number.isFinite(expires) && expires <= now.getTime();
}

function normalizeSessionTtlMs(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const ttlMs = Number(value);
  return Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : fallback;
}
