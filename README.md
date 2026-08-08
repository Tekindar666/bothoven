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
MUSIC_CACHE_MAX_MB=2048
```

`MUSIC_CACHE_MAX_MB` caps the size of the audio cache (default 2 GB, roughly
400–500 tracks). After each download the least-recently-used `.opus` files are
evicted until the cache is under the cap. Files for tracks still in the queue are
never evicted. Replaying a cached track refreshes its recency so it survives
longer.

The Discord bot needs the `GUILD_VOICE_STATES` intent and permissions to use application commands, connect, speak, and use voice activity.

## Run

```sh
pnpm dev
```

Guild slash commands are registered on startup. The prototype supports:

- `/enqueue <query>` — resolve and cache a YouTube track
- `/dequeue <index>` — remove a track by its displayed playlist position
- `/playlist <query>` — add a Spotify playlist (URL, URI, or id) to the queue; see the limit below
- `/play` — join your current voice channel and play the queue with auto-next
- `/pause` — toggle pause and resume
- `/next` — play the next track
- `/prev` — play the previous track
- `/clear` — clear the playlist and disconnect
- `/loop` — toggle looping the current track
- `/shuffle` — shuffle tracks after the current position

The queue is in memory and is lost when the process exits. Downloaded audio remains in `MUSIC_CACHE_DIR`.

## Roadmap

### 1. Playlist controls

- [x] Enqueue and dequeue tracks
- [x] Play, pause, resume, next, and previous
- [x] Clear the playlist and disconnect
- [x] Loop the current track
- [x] Shuffle upcoming tracks

### 2. Spotify playlists

- [x] Accept a Spotify playlist URL
- [x] Resolve each Spotify track through its song and artist names
- [x] Enqueue all resolved tracks
- [ ] Support playlists longer than 100 tracks (pagination)

> [!NOTE]
> The Spotify Web API returns at most **100 tracks** per playlist request, so
> `/playlist` currently enqueues only the first 100 tracks. Longer playlists are
> silently truncated. Supporting the full playlist means following the
> `tracks.next` cursor and requesting each subsequent page until it is `null`.

### 3. Multiple voice channels

- [ ] Isolate queue and playback state per voice channel
- [ ] Support parallel playback through multiple bot accounts or instances

## Verify

```sh
pnpm typecheck
pnpm test
pnpm build
```

> [!IMPORTANT]
> Spotify-owned editorial/algorithmic playlists (ids starting `37i9dQZF`) return
> `404 Not Found` under the Client Credentials flow since 2024-11-27. Use a
> playlist created by a normal user account with `/playlist`.
