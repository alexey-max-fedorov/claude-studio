/** Unbounded async queue usable as an AsyncIterable (the SDK's streaming input). */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = []
  private waiters: ((r: IteratorResult<T>) => void)[] = []
  private ended = false

  push(item: T): void {
    if (this.ended) throw new Error("queue has ended")
    const w = this.waiters.shift()
    if (w) w({ value: item, done: false })
    else this.items.push(item)
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    for (const w of this.waiters.splice(0)) w({ value: undefined as never, done: true })
  }

  get isEnded(): boolean {
    return this.ended
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) return Promise.resolve({ value: this.items.shift() as T, done: false })
        if (this.ended) return Promise.resolve({ value: undefined as never, done: true })
        return new Promise((resolve) => this.waiters.push(resolve))
      },
      return: () => {
        this.end()
        return Promise.resolve({ value: undefined as never, done: true })
      },
    }
  }
}
