import { findMvpUser, publicMvpUser } from "../config/runtimeDefaults.js";

const MVP_PASSWORDS = new Map([
  ["admin", "admin123"],
  ["worker", "worker123"],
  ["reviewer", "reviewer123"],
]);

export function validateMvpCredentials(input = {}) {
  const user = findMvpUser(input.userId || input.user_id);
  if (!user) return null;
  return String(input.password || "") === MVP_PASSWORDS.get(user.user_id) ? publicMvpUser(user) : null;
}
