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

export async function hasReleaseRelevantChanges(fromRevision, toRevision, cwd = process.cwd()) {
  if (!fromRevision || !toRevision || fromRevision === toRevision) return false;
  try {
    await execFilePromise(
      "git",
      [
        "diff",
        "--quiet",
        fromRevision,
        toRevision,
        "--",
        "server.js",
        "src",
        "scripts",
        "package.json",
        "package-lock.json",
        "Dockerfile",
        "docker-compose.yml",
      ],
      { cwd },
    );
    return false;
  } catch (error) {
    return Number(error.code) === 1 ? true : true;
  }
}
