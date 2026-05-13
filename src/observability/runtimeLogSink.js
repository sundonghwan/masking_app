import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export function createJsonlFileSink(options = {}) {
  if (!options.logFile) {
    throw new TypeError("logFile is required");
  }
  const logFile = path.resolve(options.logFile);
  const mirrorSink = typeof options.mirrorSink === "function" ? options.mirrorSink : null;
  mkdirSync(path.dirname(logFile), { recursive: true });

  return (entry) => {
    appendFileSync(logFile, `${JSON.stringify(entry)}\n`, "utf8");
    if (mirrorSink) mirrorSink(entry);
  };
}
