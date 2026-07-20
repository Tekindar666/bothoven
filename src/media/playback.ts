import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type VoiceConnection,
} from "@discordjs/voice";
import type { Guild, Snowflake } from "discord.js";

import { Player, type MediaItem } from "./player.js";

export class Playback {
  readonly #audioPlayer = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });
  #connection: VoiceConnection | undefined;
  #guild: Guild | undefined;
  #active = false;

  constructor(private readonly queue: Player) {
    this.#audioPlayer.on(AudioPlayerStatus.Idle, () => {
      if (this.#active) {
        this.playNext();
      }
    });
    this.#audioPlayer.on("error", (error) => {
      console.error("[playback] audio player error", error);
    });
  }

  async start(guild: Guild, channelId: Snowflake): Promise<MediaItem> {
    const item = this.queue.current();

    this.disconnect("starting new connection");
    console.info(`[voice] connecting guild=${guild.id} channel=${channelId}`);

    this.#guild = guild;
    this.#connection = joinVoiceChannel({
      guildId: guild.id,
      channelId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    const connection = this.#connection;

    connection.on("stateChange", (oldState, newState) => {
      console.info(
        `[voice] state ${oldState.status} -> ${newState.status} guild=${guild.id} channel=${channelId}`,
      );
    });
    connection.on("error", (error) => {
      console.error(
        `[voice] connection error guild=${guild.id} channel=${channelId} status=${connection.state.status}`,
        error,
      );
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
      console.error(
        `[voice] failed to become ready guild=${guild.id} channel=${channelId} status=${connection.state.status} rejoinAttempts=${connection.rejoinAttempts}`,
        error,
      );
      this.disconnect("connection failed");
      throw error;
    }

    console.info(`[voice] ready guild=${guild.id} channel=${channelId}`);
    connection.subscribe(this.#audioPlayer);
    this.#active = true;
    this.play(item);
    return item;
  }

  disconnectIfAlone(): void {
    const channelId = this.#connection?.joinConfig.channelId;
    const channel = channelId
      ? this.#guild?.channels.cache.get(channelId)
      : undefined;

    if (!channel?.isVoiceBased()) {
      return;
    }

    const hasHumanMember = channel.members.some((member) => !member.user.bot);
    if (!hasHumanMember) {
      this.disconnect("channel has no human members");
    }
  }

  private playNext(): void {
    const item = this.queue.next();
    if (!item) {
      this.disconnect("queue exhausted");
      return;
    }

    this.play(item);
  }

  private disconnect(reason: string): void {
    this.#active = false;
    this.#audioPlayer.stop(true);

    if (this.#connection) {
      console.info(`[voice] disconnecting reason=${JSON.stringify(reason)}`);
      this.#connection.destroy();
    }

    this.#connection = undefined;
    this.#guild = undefined;
  }

  private play(item: MediaItem): void {
    console.info(
      `[playback] playing id=${item.id} title=${JSON.stringify(item.title)} path=${item.filePath}`,
    );
    const resource = createAudioResource(item.filePath, {
      inputType: StreamType.OggOpus,
      metadata: item,
    });
    this.#audioPlayer.play(resource);
  }
}
