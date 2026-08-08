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

  previous(): MediaItem | undefined {
    if (this.#currentIndex === undefined || this.#currentIndex === 0) {
      return undefined;
    }

    this.#currentIndex -= 1;
    return this.current();
  }

  removeAt(index: number): {
    removed: MediaItem;
    wasCurrent: boolean;
    successor: MediaItem | undefined;
  } {
    if (!Number.isInteger(index) || index < 0 || index >= this.#items.length) {
      throw new Error("playlist position is out of range");
    }

    const currentIndex = this.#currentIndex;
    const wasCurrent = index === currentIndex;
    const [removed] = this.#items.splice(index, 1);
    if (!removed) {
      throw new Error("playlist position is out of range");
    }

    const successor = wasCurrent ? this.#items[index] : undefined;

    if (this.#items.length === 0) {
      this.#currentIndex = undefined;
    } else if (currentIndex !== undefined && index < currentIndex) {
      this.#currentIndex = currentIndex - 1;
    } else if (wasCurrent && !successor) {
      this.#currentIndex = this.#items.length - 1;
    }

    return { removed, wasCurrent, successor };
  }

  clear(): number {
    const count = this.#items.length;
    this.#items.length = 0;
    this.#currentIndex = undefined;
    return count;
  }

  shuffleUpcoming(): number {
    if (this.#currentIndex === undefined) {
      return 0;
    }

    const firstUpcomingIndex = this.#currentIndex + 1;
    const count = this.#items.length - firstUpcomingIndex;

    for (let index = this.#items.length - 1; index > firstUpcomingIndex; index -= 1) {
      const randomIndex =
        firstUpcomingIndex +
        Math.floor(Math.random() * (index - firstUpcomingIndex + 1));
      const item = this.#items[index];
      const randomItem = this.#items[randomIndex];
      if (!item || !randomItem) {
        throw new Error("playlist position is invalid");
      }

      this.#items[index] = randomItem;
      this.#items[randomIndex] = item;
    }

    return count;
  }

  items(): readonly MediaItem[] {
    return this.#items;
  }

  currentIndex(): number | undefined {
    return this.#currentIndex;
  }
}
