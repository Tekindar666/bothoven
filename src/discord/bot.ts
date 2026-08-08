import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  type ChatInputCommandInteraction,
} from "discord.js";

import { commands } from "./commands.js";
import { getPlaylist } from "../spotify/getPlaylist.js";
import { parsePlaylistId } from "../spotify/parsePlaylistId.js";
import { Playback } from "../media/playback.js";
import { Player } from "../media/player.js";
import { YtDlp } from "../media/downloader.js";

interface BotOptions {
  token: string;
  applicationId: string;
  guildId: string;
  downloader: YtDlp;
}

// number of downloaded tracks to keep queued ahead of the current one
const PREFETCH_AHEAD = 5;
// how often to re-check buffer space while the fill is paused
const BUFFER_POLL_MS = 750;
// max tracks listed in the reply before truncating
const MAX_LISTED = 20;

export class Bot {
  readonly #client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  readonly #queue = new Player();
  readonly #playback = new Playback(this.#queue);
  // bumped to cancel an in-flight background playlist fill
  #playlistFillId = 0;

  constructor(private readonly options: BotOptions) {
    this.#client.on("interactionCreate", (interaction) => {
      if (interaction.isChatInputCommand()) {
        void this.handleCommand(interaction);
      }
    });

    this.#client.once("ready", (client) => {
      console.info(
        `[discord] connected user=${client.user.tag} guild=${this.options.guildId}`,
      );
    });

    this.#client.on("voiceStateUpdate", () => {
      this.#playback.disconnectIfAlone();
    });
  }

  // File paths currently referenced by the queue — must not be evicted.
  queuedFilePaths(): string[] {
    return this.#queue.items().map((item) => item.filePath);
  }

  async start(): Promise<void> {
    console.info(
      `[discord] registering commands guild=${this.options.guildId}`,
    );
    const rest = new REST().setToken(this.options.token);
    await rest.put(
      Routes.applicationGuildCommands(
        this.options.applicationId,
        this.options.guildId,
      ),
      { body: commands },
    );

    console.info("[discord] connecting");
    await this.#client.login(this.options.token);
  }

  private async handleCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    try {
      switch (interaction.commandName) {
        case "enqueue":
          await this.enqueue(interaction);
          return;
        case "dequeue":
          await this.dequeue(interaction);
          return;
        case "playlist":
          await this.playlist(interaction);
          return;
        case "play":
          await this.play(interaction);
          return;
        case "pause":
          await this.pause(interaction);
          return;
        case "next":
          await this.next(interaction);
          return;
        case "prev":
          await this.previous(interaction);
          return;
        case "clear":
          await this.clear(interaction);
          return;
        case "loop":
          await this.loop(interaction);
          return;
        case "shuffle":
          await this.shuffle(interaction);
          return;
      }
    } catch (error) {
      console.error(
        `[command] failed command=/${interaction.commandName} user=${interaction.user.id} guild=${interaction.guildId ?? "none"}`,
        error,
      );
      const message = error instanceof Error ? error.message : "unknown error";

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(`Command failed: ${message}`);
      } else {
        await interaction.reply({
          content: `Command failed: ${message}`,
          ephemeral: true,
        });
      }
    }
  }

  private async enqueue(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply();
    const query = interaction.options.getString("query", true);
    console.info(
      `[enqueue] requested user=${interaction.user.id} query=${JSON.stringify(query)}`,
    );

    const item = await this.options.downloader.downloadAudio(query);
    this.#queue.enqueue(item);
    console.info(
      `[enqueue] queued id=${item.id} title=${JSON.stringify(item.title)} position=${this.#queue.items().length}`,
    );

    const playlist = this.#queue
      .items()
      .map((queued, index) => {
        const current =
          index === this.#queue.currentIndex() ? " ← current" : "";
        return `${index + 1}. ${queued.title}${current}`;
      })
      .join("\n");

    await interaction.editReply(`Queued: ${item.title}\n\n${playlist}`);
  }

  private async dequeue(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const position = interaction.options.getInteger("index", true);
    const item = this.#playback.dequeue(position - 1);
    await interaction.reply(`Dequeued ${position}. ${item.title}`);
  }

  private async playlist(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply();
    const query = interaction.options.getString("query", true);
    const playlistId = parsePlaylistId(query);
    if (!playlistId) {
      throw new Error("invalid spotify playlist link or id");
    }

    console.info(
      `[playlist] requested user=${interaction.user.id} id=${playlistId}`,
    );

    const data = await getPlaylist({
      playlistId,
      // only pull what we need to display and build a search query
      fields: "name,owner(display_name),tracks.items(track(name,artists(name)))",
    });

    // ordered playable tracks (skip null tracks): display title + search terms
    const tracks = data.tracks.items
      .map((entry) => entry.track)
      .filter((track): track is NonNullable<typeof track> => track !== null)
      .map((track) => {
        const artists = track.artists.map((a) => a.name);
        return {
          title: `${track.name} — ${artists.join(", ")}`,
          terms: `${track.name} ${artists.join(" ")}`,
        };
      });

    if (tracks.length === 0) {
      await interaction.editReply(
        `No playable tracks found in ${JSON.stringify(data.name)}.`,
      );
      return;
    }

    // Reply immediately with the tracklist from metadata (no downloads yet).
    console.info(
      `[playlist] listing id=${playlistId} name=${JSON.stringify(
        data.name,
      )} tracks=${tracks.length}`,
    );
    await interaction.editReply(renderPlaylistReply(data.name, tracks));

    // Start a cancellable background fill that keeps a rolling buffer of
    // downloaded tracks ahead of the play head.
    const fillId = ++this.#playlistFillId;
    void this.fillQueue(
      fillId,
      tracks.map((t) => t.terms),
      data.name,
      playlistId,
    ).catch((error: unknown) => {
      console.error(`[playlist] background failed id=${playlistId}`, error);
    });
  }

  // Download and enqueue playlist tracks in order, pausing whenever the queue
  // already holds PREFETCH_AHEAD tracks beyond the current play position.
  // Individual download failures are skipped; a newer fill cancels this one.
  private async fillQueue(
    fillId: number,
    terms: string[],
    playlistName: string,
    playlistId: string,
  ): Promise<void> {
    let added = 0;
    let skipped = 0;
    for (const term of terms) {
      // wait until the buffer has room (or this fill is cancelled)
      if (!(await this.waitForBufferSpace(fillId))) return;
      try {
        const item = await this.options.downloader.downloadAudio(term);
        if (fillId !== this.#playlistFillId) return; // cancelled mid-download
        this.#queue.enqueue(item);
        added += 1;
      } catch (error) {
        skipped += 1;
        console.warn(
          `[playlist] skipped track terms=${JSON.stringify(term)}`,
          error,
        );
      }
    }

    console.info(
      `[playlist] background done id=${playlistId} name=${JSON.stringify(
        playlistName,
      )} added=${added} skipped=${skipped}`,
    );
  }

  // Resolve true when fewer than PREFETCH_AHEAD tracks are queued after the
  // current one; resolve false if this fill has been cancelled/superseded.
  private async waitForBufferSpace(fillId: number): Promise<boolean> {
    while (fillId === this.#playlistFillId) {
      const length = this.#queue.items().length;
      const current = this.#queue.currentIndex() ?? 0;
      const ahead = length === 0 ? 0 : length - 1 - current;
      if (ahead < PREFETCH_AHEAD) return true;
      await sleep(BUFFER_POLL_MS);
    }
    return false;
  }

  private async play(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.guildId !== this.options.guildId || !interaction.guild) {
      throw new Error("this command only works in the configured server");
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const channel = member.voice.channel;
    if (!channel) {
      throw new Error("join a voice channel first");
    }

    await interaction.deferReply();
    const item = await this.#playback.start(interaction.guild, channel.id);
    await interaction.editReply(`Playing: ${item.title}`);
  }

  private async pause(interaction: ChatInputCommandInteraction): Promise<void> {
    const state = this.#playback.togglePause();
    await interaction.reply(`Playback ${state}.`);
  }

  private async next(interaction: ChatInputCommandInteraction): Promise<void> {
    const item = this.#playback.next();
    const message = item
      ? `Playing next: ${item.title}`
      : "Reached the end of the playlist and disconnected.";
    await interaction.reply(message);
  }

  private async previous(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const item = this.#playback.previous();
    await interaction.reply(`Playing previous: ${item.title}`);
  }

  private async clear(interaction: ChatInputCommandInteraction): Promise<void> {
    // cancel any background playlist fill before clearing the queue
    this.#playlistFillId += 1;
    const count = this.#playback.clear();
    await interaction.reply(`Cleared ${count} song${count === 1 ? "" : "s"}.`);
  }
  private async loop(interaction: ChatInputCommandInteraction): Promise<void> {
    const enabled = this.#playback.toggleLoop();
    await interaction.reply(`Loop ${enabled ? "enabled" : "disabled"}.`);
  }

  private async shuffle(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const count = this.#playback.shuffle();
    await interaction.reply(
      `Shuffled ${count} upcoming song${count === 1 ? "" : "s"}.`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Build the initial playlist reply from Spotify metadata, truncated to fit
// Discord's 2000-character message limit.
function renderPlaylistReply(
  name: string,
  tracks: { title: string }[],
): string {
  const header = `**${name}** — ${tracks.length} track${
    tracks.length === 1 ? "" : "s"
  } (downloading…)`;
  const lines = tracks
    .slice(0, MAX_LISTED)
    .map((track, index) => `${index + 1}. ${track.title}`);
  const more =
    tracks.length > MAX_LISTED
      ? `\n…and ${tracks.length - MAX_LISTED} more`
      : "";
  return `${header}\n${lines.join("\n")}${more}`;
}
