import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { YtDlp } from "../src/media/downloader.js";

const roots: string[] = [];
const videoUrl = "https://www.youtube.com/watch?v=93-L8MzQaZM&list=RD93-L8MzQaZM&start_radio=1";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("YtDlp", () => {
  it("resolves searches and URLs, downloads Opus, and reuses the cache", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bothoven-"));
    roots.push(root);
    const binary = path.join(root, "fake-yt-dlp");
    const cacheDir = path.join(root, "cache");
    const logFile = path.join(root, "calls.log");

    await writeFile(
      binary,
      `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const input = args.at(-1);
if (args.includes("--dump-single-json")) {
  fs.appendFileSync(${JSON.stringify(logFile)}, \`metadata: \${input}\\n\`);
  const info = input === ${JSON.stringify(videoUrl)}
    ? { id: "url-id", title: "URL Song", duration: 234, webpage_url: input }
    : { id: "fake-id", title: "Fake Song", duration: 123, webpage_url: "https://youtu.be/fake-id" };
  console.log(JSON.stringify(input === ${JSON.stringify(videoUrl)} ? info : { entries: [info] }));
  process.exit(0);
}
fs.appendFileSync(${JSON.stringify(logFile)}, \`download: \${input}\\n\`);
const template = args[args.indexOf("--output") + 1];
const id = input === ${JSON.stringify(videoUrl)} ? "url-id" : "fake-id";
const output = template.replace("%(id)s", id).replace("%(ext)s", "opus");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, "fake opus");
`,
    );
    await chmod(binary, 0o755);

    const downloader = new YtDlp({
      binary,
      cacheDir,
      maxBytes: 2 * 1024 * 1024 * 1024,
    });
    const first = await downloader.downloadAudio("lofi beats");
    const second = await downloader.downloadAudio("lofi beats");
    const fromUrl = await downloader.downloadAudio(videoUrl);

    expect(first).toEqual(second);
    expect(first.title).toBe("Fake Song");
    expect(fromUrl.title).toBe("URL Song");
    expect(await readFile(first.filePath, "utf8")).toBe("fake opus");
    expect(await readFile(fromUrl.filePath, "utf8")).toBe("fake opus");
    expect(await readFile(logFile, "utf8")).toBe(
      `metadata: ytsearch1:lofi beats\ndownload: https://youtu.be/fake-id\nmetadata: ytsearch1:lofi beats\nmetadata: ${videoUrl}\ndownload: ${videoUrl}\n`,
    );
  });
});
