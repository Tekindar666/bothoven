import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  type ChatInputCommandInteraction,
} from "discord.js";

import { commands } from "./commands.js";
import { Playback } from "../media/playback.js";
import { Player } from "../media/player.js";
import { YtDlp } from "../media/downloader.js";

interface BotOptions {
  token: string;
  applicationId: string;
  guildId: string;
  downloader: YtDlp;
}

export class Bot {
  readonly #client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  readonly #queue = new Player();
  readonly #playback = new Playback(this.#queue);

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
