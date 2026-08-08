import { describe, expect, it } from "vitest";

import { Playback } from "../src/media/playback.js";
import { Player, type MediaItem } from "../src/media/player.js";

function item(id: string): MediaItem {
  return {
    id,
    title: `Song ${id}`,
    durationSeconds: 123,
    url: `https://example.com/${id}`,
    filePath: `.cache/music/${id}.opus`,
  };
}

describe("Playback", () => {
  it("toggles loop mode", () => {
    const player = new Player();
    player.enqueue(item("a"));
    const playback = new Playback(player);

    expect(playback.toggleLoop()).toBe(true);
    expect(playback.toggleLoop()).toBe(false);
  });

  it("resets loop mode when clearing the playlist", () => {
    const player = new Player();
    player.enqueue(item("a"));
    const playback = new Playback(player);
    playback.toggleLoop();

    playback.clear();
    player.enqueue(item("b"));

    expect(playback.toggleLoop()).toBe(true);
  });

  it("does not enable loop mode for an empty playlist", () => {
    const playback = new Playback(new Player());

    expect(() => playback.toggleLoop()).toThrow("playlist is empty");
  });
});
