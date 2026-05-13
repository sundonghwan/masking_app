import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFilePromise = promisify(execFile);

export async function resolveSourceRevision(cwd = process.cwd(), env = process.env) {
  const configured = String(env.MASKING_APP_SOURCE_REVISION || "").trim();
  if (configured) return configured;
  try {
    const { stdout } = await execFilePromise("git", ["rev-parse", "HEAD"], { cwd });
    return stdout.trim();
  } catch {
    return "";
  }
}
