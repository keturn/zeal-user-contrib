export interface Progress {
  percent: number;
  totalBytes: number;
  transferredBytes: number;
}

// loosely adapted from some code in ky that isn't exported
export class ProgressByteStream<Chunk = Uint8Array> extends TransformStream<Chunk, Chunk> {
  totalBytes: number | null;
  onProgress: (progress: Progress) => void;
  transferredBytes: number = 0;

  constructor(totalBytes: number | null, onProgress: ((progress: Progress) => void) | null) {
    super();
    this.totalBytes = totalBytes;
    this.onProgress = onProgress;
  }

  static fromResponse(response: Response, onProgress: ((progress: Progress) => void) | null) {
    const totalBytes = Math.max(0, Number(response.headers.get('content-length')) || 0);
    type Chunk = typeof response.body extends ReadableStream<infer C> ? C : never;
    return new ProgressByteStream<Chunk>(totalBytes, onProgress);
  }

  get percent(): number {
    let percent = this.totalBytes === null ? 0 : this.transferredBytes / this.totalBytes;
    // Avoid reporting 100% progress before the stream is actually finished (in case totalBytes is inaccurate)
    if (percent >= 1) {
      // Epsilon is used here to get as close as possible to 100% without reaching it.
      // If we were to use 0.99 here, percent could potentially go backwards.
      percent = 1 - Number.EPSILON;
    }
    return percent;
  }

  currentProgress(): Progress {
    return {
      percent: this.percent,
      totalBytes: Math.max(this.totalBytes, this.transferredBytes),
      transferredBytes: this.transferredBytes,
    };
  }

  transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
    controller.enqueue(chunk);
    this.transferredBytes += chunk.byteLength;
    // ky's implementation delayed reporting the current chunk's length until the *next* chunk came
    // in (or was flushed). I assume that's an attempt to avoid claiming progress if the writer
    // hasn't actually written the chunks in the queue? But any statements about that kind of thing
    // would have to be aware of the queuing and buffering in the pipeline—so might as well do the
    // straightforward thing and report bytes as we receive them.
    this.onProgress?.(this.currentProgress());
  }

  flush() {
    this.onProgress?.(this.currentProgress());
  }
}
