# Bothoven

Discord music bot template in Rust.

## Stack

- `serenity`: Discord API and slash commands
- `songbird`: Discord voice/audio
- `yt-dlp`: resolves YouTube URLs/searches into playable audio
- `ffmpeg`: audio conversion used by `yt-dlp`/voice playback
- `uv`: project-local Python tool environment for `yt-dlp`

## Why no Docker yet?

Get local playback working first. Docker is useful after the runtime shape is known; before that it mostly hides setup problems behind image rebuilds.

## Local setup

Install Rust and `uv`, and make sure you have an FFmpeg binary available somewhere on your machine.

On macOS, one option for `uv` is:

```sh
brew install uv
```

If you do not use Homebrew, use any `uv` install method from <https://docs.astral.sh/uv/>. `uv` is the only Python tool expected to be installed outside this repo; `yt-dlp` stays project-local.

```sh
uv sync
cp .env.example .env
```

`uv sync` creates `.venv/` and installs the project-local `yt-dlp` binary at:

```sh
.venv/bin/yt-dlp
```

FFmpeg does not need to be globally installed. If you have a project-specific or hand-tweaked FFmpeg binary, set its exact path in `.env`:

```env
FFMPEG_BINARY=/absolute/path/to/ffmpeg
```

Later bot logic should pass that path to `yt-dlp --ffmpeg-location` or prepend the containing directory to the child process `PATH`.

## Environment

```env
DISCORD_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_GUILD_ID=

YTDL_BINARY=.venv/bin/yt-dlp
FFMPEG_BINARY=/absolute/path/to/ffmpeg
MUSIC_CACHE_DIR=.cache/music
```

`DISCORD_GUILD_ID` is optional but useful for faster slash-command registration while developing.

## Discord setup

In the Discord developer portal:

1. Create an application and bot.
2. Copy the bot token into `DISCORD_TOKEN`.
3. Enable the `GUILD_VOICE_STATES` intent.
4. Invite the bot with permissions for slash commands, connecting, speaking, and using voice activity.

## Planned commands

- `/playlist` show queued songs
- `/enqueue <url-or-search>` add a song
- `/dequeue <url-or-search>` remove a song
- `/repeat` repeat current song
- `/shuffle` shuffle queue
- `/next` skip forward
- `/prev` go back
- `/stop` stop playback
- `/help` show command list

## Playback flow

```text
Discord command
  -> resolve metadata with yt-dlp
  -> check .cache/music/{youtube-id}.opus
  -> download only when missing
  -> enqueue MediaItem in Player
  -> stream MediaItem.file_path through Songbird
```

`utils/music_download.rs` owns cache lookup/download. It always fetches metadata first, then skips the audio download when the expected `.opus` file already exists.

Current module split:

```text
discord/message_handler.rs  DiscordHandler and slash-command routing
media/client.rs             Serenity client setup + Songbird registration
media/player.rs             MediaItem type, playlist state, and controls
media/media_streamer.rs     planned Songbird File::new(...) playback bridge
utils/music_download.rs     yt-dlp metadata/cache/download wrapper
```

Song end handling will use a Songbird `TrackEvent::End` handler after manual playback works. Command parsing stays in `discord/`; media source swaps stay in `media/`.

## Development

```sh
cargo check
cargo run
```

The current runtime behavior is intentionally minimal while player/downloader pieces are built separately.
