import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

import type { MediaItem } from "./player.js";

const execFileAsync = promisify(execFile);

const infoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  duration: z.number().nonnegative(),
  webpage_url: z.url(),
});

// yt-dlp could potentially return an info schema or an array of infoSchema
const dumpSchema = z.union([
  infoSchema,
  z.object({ entries: z.array(infoSchema).min(1) }),
]);

export interface DownloaderOptions {
  binary: string;
  ffmpeg?: string;
  cacheDir: string;
}

export class YtDlp {
  constructor(private readonly options: DownloaderOptions) {}

  async downloadAudio(query: string): Promise<MediaItem> {
    await mkdir(this.options.cacheDir, { recursive: true });

    const input = isUrl(query) ? query : `ytsearch1:${query}`;
    const info = await this.fetchInfo(input);
    const filePath = path.join(this.options.cacheDir, `${info.id}.opus`);

    const cacheHit = await exists(filePath);
    if (cacheHit) {
      console.info(`[media] cache hit id=${info.id} path=${filePath}`);
    } else {
      console.info(
        `[media] downloading id=${info.id} title=${JSON.stringify(info.title)}`,
      );
      await this.downloadFile(info.webpage_url);
    }

    if (!(await exists(filePath))) {
      throw new Error(`yt-dlp did not create expected cache file: ${filePath}`);
    }

    if (!cacheHit) {
      console.info(`[media] cached id=${info.id} path=${filePath}`);
    }

    return {
      id: info.id,
      title: info.title,
      durationSeconds: info.duration,
      url: info.webpage_url,
      filePath,
    };
  }

  private async fetchInfo(input: string): Promise<z.infer<typeof infoSchema>> {
    const { stdout } = await this.run([
      "--no-playlist",
      "--dump-single-json",
      input,
    ]);
    const dump = dumpSchema.parse(JSON.parse(stdout));

    if ("entries" in dump) {
      const first = dump.entries[0];
      if (!first) {
        throw new Error("yt-dlp search returned no entries");
      }
      return first;
    }

    return dump;
  }

  private async downloadFile(url: string): Promise<void> {
    const args = [
      "--no-playlist",
      "--extract-audio",
      "--audio-format",
      "opus",
      "--audio-quality",
      "0",
      "--output",
      path.join(this.options.cacheDir, "%(id)s.%(ext)s"),
    ];

    if (this.options.ffmpeg) {
      args.push("--ffmpeg-location", this.options.ffmpeg);
    }

    args.push(url);
    await this.run(args);
  }

  private async run(
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync(this.options.binary, args, {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      if (error instanceof Error && "stderr" in error) {
        const stderr = String(error.stderr).trim();
        throw new Error(stderr || error.message, { cause: error });
      }
      throw error;
    }
  }
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
