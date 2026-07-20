import { z } from "zod";

const configSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_APPLICATION_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),
  YTDL_BINARY: z.string().min(1).default(".venv/bin/yt-dlp"),
  FFMPEG_BINARY: z.string().min(1).optional(),
  MUSIC_CACHE_DIR: z.string().min(1).default(".cache/music"),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(z.prettifyError(parsed.error));
  throw new Error("invalid environment configuration");
}

export const config = parsed.data;
