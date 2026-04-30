import { ROLES, normalizeActorId, publicMvpUser } from "../config/runtimeDefaults.js";

export const LOCAL_MVP_USER_ACCOUNTS = [
  { user_id: "admin", role: ROLES.ADMIN, display_name: "Admin", password: "admin123", active: true },
  { user_id: "worker", role: ROLES.WORKER, display_name: "Worker", password: "worker123", active: true },
  { user_id: "reviewer", role: ROLES.REVIEWER, display_name: "Reviewer", password: "reviewer123", active: true },
];

export function validateMvpCredentials(input = {}) {
  const user = findLocalMvpUserAccount(input.userId || input.user_id);
  if (!user) return null;
  return user.active !== false && String(input.password || "") === String(user.password || "")
    ? publicMvpUser(user)
    : null;
}

export async function validateDirectoryCredentials(userDirectory, input = {}) {
  if (!userDirectory?.validateCredentials) return validateMvpCredentials(input);
  return userDirectory.validateCredentials(input);
}

function findLocalMvpUserAccount(userId) {
  const normalized = normalizeActorId(userId);
  return LOCAL_MVP_USER_ACCOUNTS.find((user) => user.user_id === normalized) || null;
}
