export const ROLES = {
  WORKER: "worker",
  REVIEWER: "reviewer",
  ADMIN: "admin",
};

export const DEFAULT_PROJECT = {
  id: "mask_project_001",
  name: "Masking Project",
};

export const DEFAULT_ACTORS = {
  admin: "admin",
  worker: "worker",
  reviewer: "reviewer",
};

export const DEFAULT_SESSION = {
  user_id: "admin",
  role: ROLES.ADMIN,
};

export const MVP_USERS = [
  { user_id: "admin", role: ROLES.ADMIN, display_name: "Admin" },
  { user_id: "worker", role: ROLES.WORKER, display_name: "Worker" },
  { user_id: "reviewer", role: ROLES.REVIEWER, display_name: "Reviewer" },
];

export function normalizeActorId(value) {
  return String(value || "").trim();
}

export function normalizeRole(value, fallback = "") {
  const role = String(value || "").trim().toLowerCase();
  return Object.values(ROLES).includes(role) ? role : fallback;
}

export function findMvpUser(userId) {
  const normalized = normalizeActorId(userId);
  return MVP_USERS.find((user) => user.user_id === normalized) || null;
}

export function userHasRole(userId, role) {
  const user = findMvpUser(userId);
  return Boolean(user && user.role === role);
}

export function publicMvpUser(user = {}) {
  if (!user.user_id) return null;
  return {
    user_id: user.user_id,
    userId: user.user_id,
    role: user.role,
    display_name: user.display_name || user.user_id,
  };
}
