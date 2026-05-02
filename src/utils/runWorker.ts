import { Worker } from 'worker_threads';

export function runWorker<T>(workerPath: string, data: unknown): Promise<T> {
  // In dev (tsx), inherit the parent's execArgv so the worker can load TypeScript.
  // In production the worker is compiled JS and needs no special loader.
  const execArgv = __filename.endsWith('.ts') ? process.execArgv : undefined;

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: data, execArgv });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}
