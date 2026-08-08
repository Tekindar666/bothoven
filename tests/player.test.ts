import { describe, expect, it, vi } from "vitest";

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

  it("moves backward without passing the beginning", () => {
    const player = new Player();
    player.enqueue(item("a"));
    player.enqueue(item("b"));
    player.next();

    expect(player.previous()?.id).toBe("a");
    expect(player.previous()).toBeUndefined();
    expect(player.current().id).toBe("a");
  });

  it("removes an item before the current item without changing the current song", () => {
    const player = new Player();
    player.enqueue(item("a"));
    player.enqueue(item("b"));
    player.enqueue(item("c"));
    player.next();

    const result = player.removeAt(0);

    expect(result.removed.id).toBe("a");
    expect(result.wasCurrent).toBe(false);
    expect(player.current().id).toBe("b");
    expect(player.currentIndex()).toBe(0);
  });

  it("selects the successor when removing the current item", () => {
    const player = new Player();
    player.enqueue(item("a"));
    player.enqueue(item("b"));
    player.enqueue(item("c"));
    player.next();

    const result = player.removeAt(1);

    expect(result.removed.id).toBe("b");
    expect(result.wasCurrent).toBe(true);
    expect(result.successor?.id).toBe("c");
    expect(player.current().id).toBe("c");
  });

  it("reports no successor when removing the final current item", () => {
    const player = new Player();
    player.enqueue(item("a"));
    player.enqueue(item("b"));
    player.next();

    const result = player.removeAt(1);

    expect(result.wasCurrent).toBe(true);
    expect(result.successor).toBeUndefined();
    expect(player.current().id).toBe("a");
  });

  it("clears every item and resets the current position", () => {
    const player = new Player();
    player.enqueue(item("a"));
    player.enqueue(item("b"));

    expect(player.clear()).toBe(2);
    expect(player.items()).toEqual([]);
    expect(player.currentIndex()).toBeUndefined();
    expect(() => player.current()).toThrow("playlist is empty");
  });

  it("shuffles only upcoming items", () => {
    const player = new Player();
    player.enqueue(item("a"));
    player.enqueue(item("b"));
    player.enqueue(item("c"));
    player.enqueue(item("d"));
    player.next();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    const count = player.shuffleUpcoming();

    expect(count).toBe(2);
    expect(player.items().map((queued) => queued.id)).toEqual([
      "a",
      "b",
      "d",
      "c",
    ]);
    expect(player.current().id).toBe("b");
    expect(player.currentIndex()).toBe(1);
    random.mockRestore();
  });

  it("rejects an invalid removal position", () => {
    const player = new Player();
    player.enqueue(item("a"));

    expect(() => player.removeAt(1)).toThrow("playlist position is out of range");
  });
});
