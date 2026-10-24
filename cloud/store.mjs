import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export class StoreConflictError extends Error {
  constructor() { super('다른 서버에서 저장값이 변경되었습니다. 최신 상태를 다시 확인해 주세요.'); this.name = 'StoreConflictError'; this.statusCode = 409; }
}

const generationOf = bytes => createHash('sha256').update(bytes).digest('hex');

export function createLocalStore(path) {
  const target = resolve(path);
  const load = async () => {
    try {
      const bytes = await readFile(target);
      return { value: JSON.parse(bytes.toString('utf8')), generation: generationOf(bytes) };
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  return {
    kind: 'local', path: target, load,
    async save(value, expectedGeneration = null) {
      await mkdir(dirname(target), { recursive: true });
      const current = await load();
      if ((current?.generation ?? null) !== expectedGeneration) throw new StoreConflictError();
      const bytes = Buffer.from(JSON.stringify(value));
      const temporary = `${target}.${randomUUID()}.tmp`;
      let handle;
      try {
        handle = await open(temporary, 'wx', 0o600);
        await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
        // Compare again immediately before the atomic replacement. The local development server has one writer.
        if (((await load())?.generation ?? null) !== expectedGeneration) throw new StoreConflictError();
        await rename(temporary, target);
        return { generation: generationOf(bytes) };
      } finally {
        await handle?.close();
        await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    },
  };
}

export async function createGcsStore({ bucket, objectName = 'manual/state-v1.json', storage } = {}) {
  if (!bucket || typeof bucket !== 'string' || !objectName || objectName === 'ox.sqlite') throw Error('수동 퀴즈용 별도 GCS 버킷·객체 설정이 필요합니다.');
  // SDK timeout is milliseconds; retry budget is seconds. Keep a stalled upload
  // below the Cloud Run request budget while retaining the generation precondition.
  const client = storage ?? new (await import('@google-cloud/storage')).Storage({
    timeout: 5000,
    retryOptions: { totalTimeout: 10, maxRetries: 1, maxRetryDelay: 1 },
  });
  const file = client.bucket(bucket).file(objectName);
  return {
    kind: 'gcs', bucket, objectName,
    async load() {
      for (let attempt = 0; attempt < 3; attempt++) {
        let metadata;
        try { [metadata] = await file.getMetadata(); }
        catch (error) { if (Number(error.code) === 404) return null; throw error; }
        try {
          // Pin the downloaded version. A concurrently replaced old generation may no longer exist.
          const version = String(metadata.generation);
          const [bytes] = await client.bucket(bucket).file(objectName, { generation: version }).download({ validation: 'crc32c' });
          return { value: JSON.parse(bytes.toString('utf8')), generation: version };
        } catch (error) { if (Number(error.code) !== 404 || attempt === 2) throw error; }
      }
    },
    async save(value, expectedGeneration = null) {
      try {
        const writeFile = client.bucket(bucket).file(objectName);
        await writeFile.save(JSON.stringify(value), {
          resumable: false,
          contentType: 'application/json; charset=utf-8',
          metadata: { cacheControl: 'no-store' },
          preconditionOpts: { ifGenerationMatch: expectedGeneration ?? 0 },
        });
        // save() populates this File's metadata from its own upload response. A fresh GET could belong to another writer.
        if (!writeFile.metadata?.generation) throw Error('저장 응답의 GCS generation이 없습니다.');
        return { generation: String(writeFile.metadata.generation) };
      } catch (error) { if ([409, 412].includes(Number(error.code))) throw new StoreConflictError(); throw error; }
    },
  };
}
