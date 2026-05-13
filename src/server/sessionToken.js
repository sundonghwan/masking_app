import { randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function createSessionToken() {
  return `sess_${randomBytes(TOKEN_BYTES).toString("hex")}`;
}
