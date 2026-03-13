import type { Transformer } from 'stream/web';

export interface Progress {
  percent: number;
  totalBytes: number;
  transferredBytes: number;
}

// loosely adapted from some code in ky that isn't exported
export class ByteStreamProgress<Chunk extends { byteLength: number } = Uint8Array> implements Transformer<Chunk, Chunk> {
  public totalBytes: number | null;
  public onProgress: (progress: Progress) => void;
  public transferredBytes: number = 0;

  public constructor(totalBytes: number | null, onProgress: ((progress: Progress) => void) | null) {
    this.totalBytes = totalBytes;
    this.onProgress = onProgress;
  }

  public static fromResponse(
    response: Response,
    onProgress: ((progress: Progress) => void) | null,
  ): ByteStreamProgress {
    const totalBytes = Math.max(0, Number(response.headers.get('content-length')) || 0);
    type Chunk = typeof response.body extends ReadableStream<infer C> ? C : never;
    return new ByteStreamProgress<Chunk>(totalBytes, onProgress);
  }

  public static transformStreamFromResponse(
    response: Response,
    onProgress: ((progress: Progress) => void) | null,
  ): TransformStream {
    return new TransformStream(ByteStreamProgress.fromResponse(response, onProgress));
  }

  public currentProgress(finished: boolean = false): Progress {
    let percent = this.totalBytes === null ? 0 : this.transferredBytes / this.totalBytes;
    // Avoid reporting 100% progress before the stream is actually finished (in case totalBytes is inaccurate)
    if (!finished && percent >= 1) {
      // Epsilon is used here to get as close as possible to 100% without reaching it.
      // If we were to use 0.99 here, percent could potentially go backwards.
      percent = 1 - Number.EPSILON;
    }
    return {
      percent: percent,
      totalBytes: Math.max(this.totalBytes, this.transferredBytes),
      transferredBytes: this.transferredBytes,
    };
  }

  public transform(chunk: Chunk, controller: TransformStreamDefaultController): void {
    this.transferredBytes += chunk.byteLength;
    controller.enqueue(chunk);
    // ky's implementation delayed reporting the current chunk's length until the *next* chunk came
    // in (or was flushed). I assume that's an attempt to avoid claiming progress if the writer
    // hasn't actually written the chunks in the queue? But any statements about that kind of thing
    // would have to be aware of the queuing and buffering in the pipeline—so might as well do the
    // straightforward thing and report bytes as we receive them.
    this.onProgress?.(this.currentProgress(false));
  }

  public flush(): void {
    this.onProgress?.(this.currentProgress(true));
  }
}
