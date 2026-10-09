export type OfflineTtsProgress = { loaded: number; total: number };
type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  onProgress?: (progress: OfflineTtsProgress) => void;
  cleanup?: () => void;
};

class OfflineTtsClient {
  private worker: Worker | null = null;
  private nextJobId = 0;
  private pending = new Map<number, Pending>();

  private getWorker(): Worker {
    if (!this.worker) {
      if (typeof Worker === 'undefined') throw new Error('Trình duyệt không hỗ trợ Web Worker cho giọng ngoại tuyến.');
      this.worker = new Worker(new URL('./jami-tts.worker.ts', import.meta.url), { type: 'module', name: 'jami-tts' });
      this.worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
        const jobId = Number(event.data.jobId);
        const pending = this.pending.get(jobId);
        if (!pending) return;
        if (event.data.type === 'progress') {
          pending.onProgress?.({ loaded: Number(event.data.loaded), total: Number(event.data.total) });
          return;
        }
        if (event.data.type === 'error') {
          this.settle(jobId, false, new Error(String(event.data.message || 'Không thể tạo giọng ngoại tuyến.')));
          return;
        }
        if (event.data.type === 'audio') {
          this.settle(jobId, true, new Blob([event.data.buffer as ArrayBuffer], { type: String(event.data.mime || 'audio/wav') }));
          return;
        }
        if (event.data.type === 'status') this.settle(jobId, true, Boolean(event.data.ready));
        else this.settle(jobId, true, undefined);
      };
      this.worker.onerror = () => this.reset(new Error('Worker giọng ngoại tuyến đã dừng ngoài ý muốn.'));
    }
    return this.worker;
  }

  private settle(jobId: number, ok: boolean, value: unknown) {
    const pending = this.pending.get(jobId);
    if (!pending) return;
    this.pending.delete(jobId);
    pending.cleanup?.();
    if (ok) pending.resolve(value);
    else pending.reject(value);
  }

  private request<T>(
    message: Record<string, unknown>,
    signal?: AbortSignal,
    onProgress?: (progress: OfflineTtsProgress) => void,
  ): Promise<T> {
    const jobId = ++this.nextJobId;
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const onAbort = () => this.reset(new DOMException('Aborted', 'AbortError'));
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(jobId, {
        resolve: (value) => resolve(value as T), reject, onProgress,
        cleanup: () => signal?.removeEventListener('abort', onAbort),
      });
      try {
        this.getWorker().postMessage({ ...message, jobId });
      } catch (error) {
        this.pending.delete(jobId);
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      }
    });
  }

  public status(): Promise<boolean> {
    return this.request<boolean>({ type: 'status' });
  }

  public prepare(onProgress?: (progress: OfflineTtsProgress) => void, signal?: AbortSignal): Promise<void> {
    return this.request<void>({ type: 'prepare' }, signal, onProgress);
  }

  public synthesize(text: string, signal?: AbortSignal, onProgress?: (progress: OfflineTtsProgress) => void): Promise<Blob> {
    return this.request<Blob>({ type: 'synthesize', text }, signal, onProgress);
  }

  public async remove(): Promise<void> {
    await this.request<void>({ type: 'remove' });
    this.reset();
  }

  public cancel(): void {
    this.reset(new DOMException('Aborted', 'AbortError'));
  }

  private reset(error?: Error): void {
    this.worker?.terminate();
    this.worker = null;
    for (const [jobId, pending] of this.pending) {
      this.pending.delete(jobId);
      pending.cleanup?.();
      if (error) pending.reject(error);
    }
  }
}

export const offlineTts = new OfflineTtsClient();
