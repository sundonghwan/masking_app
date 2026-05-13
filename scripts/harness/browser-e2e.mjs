import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

import { createGrayscale8Png } from "../../src/server/maskValidation.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PLAYWRIGHT_CLI = process.env.PLAYWRIGHT_CLI || "playwright-cli";
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "admin123";

const tempRoot = await mkdtemp(path.join(tmpdir(), "masking-app-browser-e2e-"));
const dataRoot = path.join(tempRoot, "data");
const playwrightWorkRoot = path.join(ROOT, ".playwright-cli", "tmp", `browser-e2e-${process.pid}`);
const fixtureDir = path.join(playwrightWorkRoot, "fixtures");
const codeFile = path.join(playwrightWorkRoot, "browser-e2e-code.js");
const imagePath = path.join(fixtureDir, "browser-e2e-frame.png");
const sessionName = `masking-e2e-${process.pid}`;
let serverProcess = null;

try {
  await assertPlaywrightCli();
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(imagePath, createFixtureImagePng());

  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = startServer({ port, dataRoot });
  await waitForHealth(`${baseUrl}/api/health`);

  const projectId = `browser-e2e-${Date.now()}`;
  await writeFile(codeFile, createPlaywrightSmokeCode({ baseUrl, imagePath, projectId }));

  await runPlaywright(["-s", sessionName, "open", baseUrl, "--raw"]);
  const result = await runPlaywright(["-s", sessionName, "run-code", "--filename", codeFile, "--raw"], {
    timeoutMs: 60000,
  });

  await runPlaywright(["-s", sessionName, "close", "--raw"]).catch(() => {});
  console.log(`browser-e2e: ${trimResult(result.stdout)}`);
} finally {
  if (serverProcess) await stopServer(serverProcess);
  await runPlaywright(["-s", sessionName, "close", "--raw"]).catch(() => {});
  await rm(tempRoot, { recursive: true, force: true });
  await rm(playwrightWorkRoot, { recursive: true, force: true });
}

async function assertPlaywrightCli() {
  try {
    await execFilePromise(PLAYWRIGHT_CLI, ["--version"], { timeoutMs: 10000 });
  } catch (error) {
    throw new Error(`browser-e2e requires playwright-cli on PATH. Tried: ${PLAYWRIGHT_CLI}. ${error.message}`);
  }
}

function startServer({ port, dataRoot }) {
  const child = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      MASKING_APP_HOST: "127.0.0.1",
      MASKING_APP_DATA_DIR: dataRoot,
      MASKING_APP_PUBLIC_ROOT: ROOT,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => process.stdout.write(prefixLines("browser-e2e server", chunk)));
  child.stderr.on("data", (chunk) => process.stderr.write(prefixLines("browser-e2e server", chunk)));
  return child;
}

async function waitForHealth(url) {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (serverProcess?.exitCode != null) {
      throw new Error(`server exited before health check with code ${serverProcess.exitCode}`);
    }
    try {
      const response = await fetch(url);
      const body = await response.json();
      if (response.ok && body.ok === true) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`server health check did not pass: ${lastError?.message || "timeout"}`);
}

async function stopServer(child) {
  if (child.exitCode != null || child.signalCode != null) return;
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await once(child, "exit");
  } finally {
    clearTimeout(timeout);
  }
}

async function findFreePort() {
  const server = net.createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function runPlaywright(args, options = {}) {
  const result = await execFilePromise(PLAYWRIGHT_CLI, args, {
    cwd: ROOT,
    timeoutMs: options.timeoutMs || 30000,
  });
  if (/^### Error/m.test(result.stdout)) {
    throw new Error(`playwright-cli command failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function execFilePromise(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd || ROOT,
      timeout: options.timeoutMs || 30000,
      maxBuffer: 1024 * 1024 * 8,
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function createFixtureImagePng() {
  const width = 32;
  const height = 32;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels[(y * width) + x] = x > 8 && x < 24 && y > 8 && y < 24 ? 230 : 32;
    }
  }
  return createGrayscale8Png({ width, height, pixels });
}

function createPlaywrightSmokeCode({ baseUrl, imagePath, projectId }) {
  return `async (page) => {
  const expect = async (condition, message) => {
    const passed = typeof condition === "function" ? await condition() : condition;
    if (!passed) throw new Error(message);
  };
  const waitForText = async (selector, pattern) => {
    await page.waitForFunction(({ selector, source, flags }) => {
      const node = document.querySelector(selector);
      return node && new RegExp(source, flags).test(node.textContent || node.value || "");
    }, { selector, source: pattern.source, flags: pattern.flags });
  };
  await page.goto(${JSON.stringify(baseUrl)}, { waitUntil: "domcontentloaded" });
  await page.locator("#sessionUserId").fill(${JSON.stringify(ADMIN_USER)});
  await page.locator("#sessionPassword").fill(${JSON.stringify(ADMIN_PASSWORD)});
  await page.locator("#loginButton").click();
  await page.waitForSelector("#projectsScreen:not([hidden])");
  await expect(async () => await page.locator("#sessionRoleLabel").inputValue() === "admin", "admin login did not derive role");

  await page.locator("#projectCreateId").fill(${JSON.stringify(projectId)});
  await page.locator("#projectCreateName").fill("Browser E2E Labeling Project");
  await page.locator("#projectCreateLabelSchema").fill("1,crack,#EF4444\\n2,scratch,#22C55E");
  await page.locator("#createProjectButton").click();
  await page.waitForSelector("#dashboardScreen:not([hidden])");
  await page.locator("#dashboardWorkbenchButton").click();
  await page.waitForSelector("#workbenchScreen:not([hidden])");

  await page.locator("#imageInput").setInputFiles(${JSON.stringify(imagePath)});
  await page.waitForFunction(() => {
    return document.querySelector("#emptyState")?.hidden === true
      && document.querySelectorAll("#imageList .image-row").length > 0
      && /browser-e2e-frame\\.png/.test(document.querySelector("#metaFilename")?.textContent || "");
  });

  await page.locator('.label-option[data-class-id="2"]').click();
  await page.waitForFunction(() => {
    const label = document.querySelector("#labelMessage")?.textContent || "";
    return /scratch/.test(label) && /class_id=2/.test(label);
  });
  await expect(async () => {
    const color = await page.locator("#maskColorSwatch").evaluate((node) => getComputedStyle(node).backgroundColor);
    return color === "rgb(34, 197, 94)";
  }, "brush color did not follow selected project label color");

  const canvas = page.locator("#editorCanvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("editor canvas has no bounding box");
  const x = box.x + (box.width / 2);
  const y = box.y + (box.height / 2);
  await page.mouse.move(x - 20, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y, { steps: 6 });
  await page.mouse.up();
  await waitForText("#saveStatus", /수정|저장|로드/);

  await page.locator("#submitButton").click();
  await waitForText("#saveStatus", /제출됨/);
  await waitForText("#metaStatus", /제출/);

  await page.locator("#approveButton").click();
  await page.waitForFunction(() => /승인/.test(document.querySelector("#metaStatus")?.textContent || ""));

  await page.evaluate(() => {
    window.__maskingE2eDownload = null;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patchedDownloadClick() {
      if (this.download) {
        window.__maskingE2eDownload = {
          filename: this.download,
          href: this.href,
        };
        return undefined;
      }
      return originalClick.call(this);
    };
  });
  await page.locator("#approvedOnlyExport").check();
  await page.locator("#exportButton").click();
  await waitForText("#saveStatus", /ZIP|내보냄/);
  await expect(async () => {
    const download = await page.evaluate(() => window.__maskingE2eDownload);
    return download && /export_.*\\.zip/.test(download.filename || "");
  }, "export did not create a ZIP download");

  return {
    projectId: ${JSON.stringify(projectId)},
    status: await page.locator("#metaStatus").textContent(),
    label: await page.locator("#labelMessage").textContent(),
    saveStatus: await page.locator("#saveStatus").textContent(),
  };
}`;
}

function prefixLines(prefix, chunk) {
  return String(chunk)
    .split(/(?<=\n)/)
    .map((line) => line ? `[${prefix}] ${line}` : line)
    .join("");
}

function trimResult(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
