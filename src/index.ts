import { Bot } from "./discord/bot.js";
import { config } from "./config.js";
import { YtDlp } from "./media/downloader.js";

const downloader = new YtDlp({
  binary: config.YTDL_BINARY,
  cacheDir: config.MUSIC_CACHE_DIR,
  maxBytes: config.MUSIC_CACHE_MAX_MB * 1024 * 1024,
  ...(config.FFMPEG_BINARY ? { ffmpeg: config.FFMPEG_BINARY } : {}),
});

const bot = new Bot({
  token: config.DISCORD_TOKEN,
  applicationId: config.DISCORD_APPLICATION_ID,
  guildId: config.DISCORD_GUILD_ID,
  downloader,
});

// protect queued/playing tracks from cache eviction
downloader.setPinnedProvider(() => bot.queuedFilePaths());

bot.start().catch((error: unknown) => {
  console.error("failed to start bot", error);
  process.exitCode = 1;
});
