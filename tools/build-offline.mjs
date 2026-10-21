import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const questions = JSON.parse(read('questions/kiee-a-2026-offline.json'));
const html = read('web/offline-shell.html')
  .replace('/*__QUIZ_DATA__*/', () => JSON.stringify(questions).replaceAll('<', '\\u003c'))
  .replace('/*__QUIZ_MEDIA__*/', () => read('tools/offline-media.js'))
  .replace('/*__QUIZ_APP__*/', () => read('web/src/offline/standalone.js'));
if (/\/\*__QUIZ_/.test(html)) throw new Error('Unresolved standalone placeholder');
const output = new URL('OX퀴즈.html', root);
writeFileSync(output, html, 'utf8');
console.log(`${questions.length} questions embedded: ${fileURLToPath(output)}`);
