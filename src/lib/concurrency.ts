export class QueueFullError extends Error {
  constructor() {
    super("The image queue is full. Retry shortly.");
  }
}

/** A bounded FIFO queue that lets other hosts pass a busy host. */
export function taskPool(maxRunning: number, perKey: number, maxQueued = 128) {
  let running = 0;
  const active = new Map<string, number>();
  type Job = { key: string; start: () => void };
  const queue: Job[] = [];
  function pump() {
    while (running < maxRunning) {
      const index = queue.findIndex(
        (job) => (active.get(job.key) ?? 0) < perKey,
      );
      if (index < 0) return;
      const [job] = queue.splice(index, 1);
      running++;
      active.set(job.key, (active.get(job.key) ?? 0) + 1);
      job.start();
    }
  }
  return <T>(
    key: string,
    fn: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> => {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (
      queue.length >= maxQueued &&
      (running >= maxRunning || (active.get(key) ?? 0) >= perKey)
    )
      return Promise.reject(new QueueFullError());
    return new Promise<T>((resolve, reject) => {
      const cancel = () => {
        const index = queue.indexOf(job);
        if (index < 0) return;
        queue.splice(index, 1);
        signal?.removeEventListener("abort", cancel);
        reject(signal?.reason ?? new Error("Request cancelled."));
        pump();
      };
      const job: Job = {
        key,
        start: () => {
          signal?.removeEventListener("abort", cancel);
          const finish = () => {
            running--;
            const count = (active.get(key) ?? 1) - 1;
            if (count) active.set(key, count);
            else active.delete(key);
            pump();
          };
          void Promise.resolve()
            .then(fn)
            .then(
              (value) => {
                finish();
                resolve(value);
              },
              (error) => {
                finish();
                reject(error);
              },
            );
        },
      };
      queue.push(job);
      signal?.addEventListener("abort", cancel, { once: true });
      pump();
    });
  };
}
