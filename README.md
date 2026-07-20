# Bothoven

A private, single-guild Discord music bot written in TypeScript.

## Stack

- Node.js 22.12 or newer
- `discord.js` for slash commands
- `@discordjs/voice` for voice playback
- `yt-dlp` for YouTube search and downloads
- FFmpeg for conversion to cached Opus audio
- `uv` for the project-local `yt-dlp` installation

## Setup

Install Node.js, pnpm, uv, and FFmpeg. Then:

```sh
pnpm install
uv sync
cp .env.example .env
```

Configure `.env`:

```env
DISCORD_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_GUILD_ID=
YTDL_BINARY=.venv/bin/yt-dlp
FFMPEG_BINARY=/absolute/path/to/ffmpeg
MUSIC_CACHE_DIR=.cache/music
```

The Discord bot needs the `GUILD_VOICE_STATES` intent and permissions to use application commands, connect, speak, and use voice activity.

## Run

```sh
pnpm dev
```

Guild slash commands are registered on startup. The prototype supports:

- `/enqueue <query>` — resolve and cache a YouTube track
- `/play` — join your current voice channel and play the queue with auto-next

The queue is in memory and is lost when the process exits. Downloaded audio remains in `MUSIC_CACHE_DIR`.

## Verify

```sh
pnpm typecheck
pnpm test
pnpm build
```
