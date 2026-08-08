import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  readdir,
  stat,
  unlink,
  utimes,
} from "node:fs/promises";
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
  maxBytes: number;
}

export class YtDlp {
  // files that must never be evicted (e.g. currently queued/playing)
  #pinned: () => Iterable<string> = () => [];

  constructor(private readonly options: DownloaderOptions) {}

  // Register a provider for paths that must survive eviction.
  setPinnedProvider(provider: () => Iterable<string>): void {
    this.#pinned = provider;
  }

  async downloadAudio(query: string): Promise<MediaItem> {
    await mkdir(this.options.cacheDir, { recursive: true });

    const input = isUrl(query) ? query : `ytsearch1:${query}`;
    const info = await this.fetchInfo(input);
    const filePath = path.join(this.options.cacheDir, `${info.id}.opus`);

    const cacheHit = await exists(filePath);
    if (cacheHit) {
      console.info(`[media] cache hit id=${info.id} path=${filePath}`);
      // mark as recently used so replays are not evicted first
      await touch(filePath);
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

    await this.enforceCacheLimit(filePath);

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

  // Evict least-recently-used cache files until under the size cap.
  // Never removes the just-downloaded file or any pinned (queued) file.
  private async enforceCacheLimit(justDownloaded: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(this.options.cacheDir);
    } catch {
      return;
    }

    const stats = await Promise.all(
      entries
        .filter((name) => name.endsWith(".opus"))
        .map(async (name) => {
          const fp = path.join(this.options.cacheDir, name);
          try {
            const s = await stat(fp);
            return { fp, size: s.size, mtime: s.mtimeMs };
          } catch {
            return undefined;
          }
        }),
    );

    const files = stats.filter(
      (s): s is { fp: string; size: number; mtime: number } => s !== undefined,
    );

    let total = files.reduce((sum, s) => sum + s.size, 0);
    if (total <= this.options.maxBytes) {
      return;
    }

    const pinned = new Set<string>([
      path.resolve(justDownloaded),
      ...[...this.#pinned()].map((p) => path.resolve(p)),
    ]);

    const evictable = files
      .filter((s) => !pinned.has(path.resolve(s.fp)))
      .sort((a, b) => a.mtime - b.mtime); // oldest use first

    for (const entry of evictable) {
      if (total <= this.options.maxBytes) {
        break;
      }
      try {
        await unlink(entry.fp);
        total -= entry.size;
        console.info(`[media] evicted path=${entry.fp} size=${entry.size}`);
      } catch (error) {
        console.warn(`[media] eviction failed path=${entry.fp}`, error);
      }
    }
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

async function touch(filePath: string): Promise<void> {
  const now = new Date();
  try {
    await utimes(filePath, now, now);
  } catch {
    // best effort — a failed touch only affects eviction ordering
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
