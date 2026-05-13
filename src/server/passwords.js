import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const HASH_ALGORITHM = "pbkdf2_sha256";
const DEFAULT_ITERATIONS = 64_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export function hashPassword(password, options = {}) {
  const secret = String(password || "");
  if (!secret) return "";
  const iterations = normalizeIterations(options.iterations);
  const salt = options.salt || randomBytes(SALT_BYTES).toString("hex");
  const hash = pbkdf2Sync(secret, salt, iterations, KEY_BYTES, "sha256").toString("hex");
  return `${HASH_ALGORITHM}$${iterations}$${salt}$${hash}`;
}

export function verifyPassword(password, user = {}) {
  const secret = String(password || "");
  if (!secret) return false;
  if (user.password_hash) return verifyPasswordHash(secret, user.password_hash);
  return String(user.password || "") === secret;
}

export function isPasswordHash(value) {
  return parsePasswordHash(value) !== null;
}

function verifyPasswordHash(password, encoded) {
  const parsed = parsePasswordHash(encoded);
  if (!parsed) return false;
  const candidate = pbkdf2Sync(password, parsed.salt, parsed.iterations, KEY_BYTES, "sha256");
  const expected = Buffer.from(parsed.hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function parsePasswordHash(value) {
  const [algorithm, iterationsText, salt, hash] = String(value || "").split("$");
  if (algorithm !== HASH_ALGORITHM) return null;
  const iterations = normalizeIterations(iterationsText);
  if (!salt || !/^[a-f0-9]+$/i.test(salt)) return null;
  if (!hash || !/^[a-f0-9]+$/i.test(hash)) return null;
  return { iterations, salt, hash };
}

function normalizeIterations(value) {
  const iterations = Number(value || DEFAULT_ITERATIONS);
  return Number.isInteger(iterations) && iterations > 0 ? iterations : DEFAULT_ITERATIONS;
}
