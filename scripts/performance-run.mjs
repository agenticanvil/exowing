import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [name, value = "true"] = argument.replace(/^--/, "").split("=");
    return [name, value];
  }),
);
const levels = parseLevels(args.get("levels") ?? args.get("level") ?? "1");
const baseUrl = args.get("url") ?? "http://localhost:5173";
const warmupMs = readNumber("warmup", 2_000);
const durationMs = readNumber("duration", 10_000);
const width = readNumber("width", 1_280);
const height = readNumber("height", 720);
const headless = readBoolean("headless", false);
const fire = readBoolean("fire", true);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDirectory = resolve("tmp", "performance", timestamp);

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless });
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
});
const results = [];

try {
  for (const level of levels) results.push(await runLevel(level));
} finally {
  await browser.close();
}

const runSummary = {
  generatedAt: new Date().toISOString(),
  outputDirectory,
  browser: { channel: "chrome", headless, viewport: `${width}x${height}` },
  warmupMs,
  durationMs,
  fire,
  levels: results.map(({ level, url, capture, consoleErrors }) => ({
    level,
    url,
    consoleErrors,
    ...capture.summary,
  })),
};
await writeJson(resolve(outputDirectory, "summary.json"), runSummary);
await writeFile(
  resolve(outputDirectory, "report.md"),
  createMarkdownReport(runSummary),
);

console.log(`Performance run: ${outputDirectory}`);
for (const result of runSummary.levels)
  console.log(
    `Level ${result.level}: ${result.fps.p50.toFixed(1)} FPS p50, ` +
      `${result.frameIntervalMs.p95.toFixed(2)}ms frame p95, ` +
      `${(result.spans["collision.world"]?.p95 ?? 0).toFixed(2)}ms player collision p95, ` +
      `${(result.spans["collision.enemyBroadPhase"]?.p95 ?? 0).toFixed(2)}ms enemy LoF p95`,
  );

async function runLevel(level) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    )
      consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      consoleErrors.push(`${response.status()} ${response.url()}`);
  });
  const url = new URL(baseUrl);
  url.searchParams.set("play", String(level));
  url.searchParams.set("dev", "invulnerable");
  url.searchParams.set("perf", "1");

  try {
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#hud:not([hidden])", { timeout: 30_000 });
    await page.waitForFunction(
      () => window.exowingPerformance?.enabled === true,
      undefined,
      { timeout: 10_000 },
    );
    const invulnerable = await page.evaluate(
      () => window.exowingDev?.settings.invulnerable,
    );
    if (!invulnerable)
      throw new Error(`Level ${level} performance run is not invulnerable.`);

    await page.waitForTimeout(warmupMs);
    await page.evaluate(() => window.exowingPerformance?.reset());
    if (fire) await page.keyboard.down("Space");
    await page.waitForTimeout(durationMs);
    if (fire) await page.keyboard.up("Space");
    const capture = await page.evaluate(() =>
      window.exowingPerformance?.exportData(),
    );
    if (!capture)
      throw new Error(`Level ${level} returned no performance data.`);

    await page.screenshot({
      path: resolve(outputDirectory, `level-${level}.png`),
    });
    const result = { level, url: url.toString(), capture, consoleErrors };
    await writeJson(resolve(outputDirectory, `level-${level}.json`), result);
    return result;
  } finally {
    await page.close();
  }
}

function parseLevels(value) {
  const parsed =
    value === "all"
      ? [1, 2, 3, 4, 5, 6]
      : value.split(",").map((level) => Number(level.trim()));
  if (
    parsed.length === 0 ||
    parsed.some((level) => !Number.isInteger(level) || level < 1 || level > 6)
  )
    throw new Error(
      `Invalid levels "${value}". Use 1-6, a comma list, or all.`,
    );
  return [...new Set(parsed)];
}

function readNumber(name, fallback) {
  const value = Number(args.get(name) ?? fallback);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`--${name} must be a positive number.`);
  return value;
}

function readBoolean(name, fallback) {
  const value = args.get(name);
  if (value === undefined) return fallback;
  if (["true", "1", "yes"].includes(value)) return true;
  if (["false", "0", "no"].includes(value)) return false;
  throw new Error(`--${name} must be true or false.`);
}

function writeJson(path, value) {
  return writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createMarkdownReport(summary) {
  const rows = summary.levels
    .map(
      (level) =>
        `| ${level.level} | ${level.fps.p50.toFixed(1)} | ${level.fps.p95.toFixed(1)} | ${level.frameIntervalMs.p95.toFixed(2)} | ${level.frameCpuMs.p95.toFixed(2)} | ${(level.spans["simulation.step"]?.p95 ?? 0).toFixed(2)} | ${(level.spans["collision.world"]?.p95 ?? 0).toFixed(2)} | ${(level.spans["collision.enemyBroadPhase"]?.p95 ?? 0).toFixed(2)} | ${level.workload.maxProjectiles} |`,
    )
    .join("\n");
  return `# Exowing performance run

- Generated: ${summary.generatedAt}
- Browser: Chrome (${summary.browser.headless ? "headless" : "headed"})
- Viewport: ${summary.browser.viewport}
- Warmup: ${summary.warmupMs}ms
- Sample: ${summary.durationMs}ms per level
- Continuous player fire: ${summary.fire}
- Invulnerability: required and verified for every level

| Level | FPS p50 | FPS p95 | Frame p95 ms | CPU p95 ms | Simulation p95 ms | Player collision p95 ms | Enemy LoF p95 ms | Max shots |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}
`;
}
