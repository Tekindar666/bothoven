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
        case "play":
          await this.play(interaction);
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
        await interaction.reply({ content: `Command failed: ${message}`, ephemeral: true });
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
        const current = index === this.#queue.currentIndex() ? " ← current" : "";
        return `${index + 1}. ${queued.title}${current}`;
      })
      .join("\n");

    await interaction.editReply(`Queued: ${item.title}\n\n${playlist}`);
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
}
