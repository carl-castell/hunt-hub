import { workerData, parentPort } from 'worker_threads';
import { createParser, ParseError } from '@/utils/geofile-parsers';

type WorkerInput  = { buffer: Buffer; filename: string };
type WorkerResult = { ok: true; geometryCollection: string } | { ok: false; status: number; message: string };

async function run(): Promise<void> {
  const { buffer, filename }: WorkerInput = workerData;
  const buf = Buffer.from(buffer);

  try {
    const parser = createParser(filename);
    const geometryCollection = await parser.parse(buf);
    const result: WorkerResult = { ok: true, geometryCollection };
    parentPort!.postMessage(result);
  } catch (err) {
    if (err instanceof ParseError) {
      const result: WorkerResult = { ok: false, status: err.status, message: err.message };
      parentPort!.postMessage(result);
    } else {
      throw err;
    }
  }
}

// Only execute when loaded as a worker thread, not when imported in tests
if (workerData !== null) run().catch(err => { throw err; });
