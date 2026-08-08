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
  #loop = false;

  constructor(private readonly queue: Player) {
    this.#audioPlayer.on(AudioPlayerStatus.Idle, () => {
      if (this.#active) {
        this.handleTrackFinished();
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

  dequeue(index: number): MediaItem {
    const { removed, wasCurrent, successor } = this.queue.removeAt(index);
    console.info(
      `[queue] dequeued position=${index + 1} id=${removed.id} title=${JSON.stringify(removed.title)}`,
    );

    if (this.#active && wasCurrent) {
      if (successor) {
        this.play(successor);
      } else {
        this.disconnect("current item dequeued without a successor");
      }
    }

    return removed;
  }

  togglePause(): "paused" | "resumed" {
    if (!this.#active) {
      throw new Error("nothing is playing");
    }

    if (this.#audioPlayer.state.status === AudioPlayerStatus.Playing) {
      if (!this.#audioPlayer.pause()) {
        throw new Error("could not pause playback");
      }
      console.info("[playback] paused");
      return "paused";
    }

    if (this.#audioPlayer.state.status === AudioPlayerStatus.Paused) {
      if (!this.#audioPlayer.unpause()) {
        throw new Error("could not resume playback");
      }
      console.info("[playback] resumed");
      return "resumed";
    }

    throw new Error(
      `cannot pause playback while it is ${this.#audioPlayer.state.status}`,
    );
  }

  toggleLoop(): boolean {
    this.queue.current();
    this.#loop = !this.#loop;
    console.info(`[playback] loop ${this.#loop ? "enabled" : "disabled"}`);
    return this.#loop;
  }

  shuffle(): number {
    const count = this.queue.shuffleUpcoming();
    console.info(`[queue] shuffled upcoming=${count}`);
    return count;
  }

  next(): MediaItem | undefined {
    if (!this.#active) {
      throw new Error("nothing is playing");
    }

    return this.advance();
  }

  previous(): MediaItem {
    if (!this.#active) {
      throw new Error("nothing is playing");
    }

    const item = this.queue.previous();
    if (!item) {
      throw new Error("already at the beginning of the playlist");
    }

    this.play(item);
    return item;
  }

  clear(): number {
    const count = this.queue.clear();
    this.#loop = false;
    this.disconnect("playlist cleared");
    console.info(`[queue] cleared count=${count}`);
    return count;
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

  private handleTrackFinished(): void {
    if (this.#loop) {
      this.play(this.queue.current());
      return;
    }

    this.advance();
  }

  private advance(): MediaItem | undefined {
    const item = this.queue.next();
    if (!item) {
      this.disconnect("queue exhausted");
      return undefined;
    }

    this.play(item);
    return item;
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
