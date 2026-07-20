import { describe, expect, it } from "vitest";

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

describe("Player", () => {
  it("sets the first queued item as current", () => {
    const player = new Player();
    player.enqueue(item("a"));

    expect(player.current().id).toBe("a");
    expect(player.currentIndex()).toBe(0);
  });

  it("advances through the queue and stops at the end", () => {
    const player = new Player();
    player.enqueue(item("a"));
    player.enqueue(item("b"));

    expect(player.next()?.id).toBe("b");
    expect(player.next()).toBeUndefined();
    expect(player.current().id).toBe("b");
  });
});
