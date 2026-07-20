export interface MediaItem {
  id: string;
  title: string;
  durationSeconds: number;
  url: string;
  filePath: string;
}

export class Player {
  readonly #items: MediaItem[] = [];
  #currentIndex: number | undefined;

  enqueue(item: MediaItem): void {
    this.#items.push(item);
    this.#currentIndex ??= 0;
  }

  current(): MediaItem {
    if (this.#currentIndex === undefined) {
      throw new Error("playlist is empty");
    }

    const item = this.#items[this.#currentIndex];
    if (!item) {
      throw new Error("current position is invalid");
    }

    return item;
  }

  next(): MediaItem | undefined {
    if (this.#currentIndex === undefined) {
      return undefined;
    }

    const nextIndex = this.#currentIndex + 1;
    if (nextIndex >= this.#items.length) {
      return undefined;
    }

    this.#currentIndex = nextIndex;
    return this.current();
  }

  items(): readonly MediaItem[] {
    return this.#items;
  }

  currentIndex(): number | undefined {
    return this.#currentIndex;
  }
}
