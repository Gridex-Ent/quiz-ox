import { randomBytes, randomInt } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createFromEnv } from '../cloud/server.mjs';

// Explicit localhost development only. Production requires GCS and configured secrets.
execFileSync(process.execPath, ['tools/build-cloud.mjs'], { stdio: 'inherit' });
await mkdir('data/development', { recursive: true });
const credentialPath = 'data/development/access.json';
let access;
try { access = JSON.parse(await readFile(credentialPath, 'utf8')); }
catch { access = { hostPin: String(randomInt(10000000, 100000000)), screenKey: randomBytes(32).toString('base64url') }; await writeFile(credentialPath, JSON.stringify(access, null, 2), { mode: 0o600 }); }
const { server, port } = await createFromEnv({ NODE_ENV: 'development', PORT: process.env.PORT || '4190', MANUAL_HOST_PIN: access.hostPin, MANUAL_SCREEN_KEY: access.screenKey, MANUAL_STATE_PATH: 'data/development/state.json' });
server.listen(port, '127.0.0.1', () => console.log(`개발 진행실: http://127.0.0.1:${port}/ · 접속 정보: ${credentialPath}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void server.closeGracefully().then(() => process.exit(0)); });
