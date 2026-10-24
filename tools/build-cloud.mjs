import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { validateQuestions } from '../web/src/quiz/manual-model.js';
import { refreshQuestionImages } from '../web/src/quiz/question-assets.js';

const root = new URL('../', import.meta.url), out = new URL('dist/cloud/', root);
const read = path => readFileSync(new URL(path, root), 'utf8');
const defaults = validateQuestions(JSON.parse(read('questions/default.json')));
const mascot = defaults.find(q => q.topic === '한국전력 마스코트');
if (!mascot?.imageData) throw Error('Missing verified mascot image.');
const assetUpdates = [{ fromImageData: `data:image/gif;base64,${readFileSync(new URL('questions/assets/kepco-happy.gif', root)).toString('base64')}`, image: Object.fromEntries(['imageData', 'imageAlt', 'imageSource', 'imageCredit', 'imageLicense', 'imageLicenseUrl', 'imageReveal'].filter(key => mascot[key] !== undefined).map(key => [key, mascot[key]])) }];
const cloudSeed = new URL('questions/default.json', root);
const source = process.env.MANUAL_SEED_FILE ? JSON.parse(readFileSync(resolve(process.env.MANUAL_SEED_FILE), 'utf8')) : existsSync(cloudSeed) ? JSON.parse(readFileSync(cloudSeed, 'utf8')) : defaults;
const questions = validateQuestions(refreshQuestionImages(Array.isArray(source) ? source : source.questions, assetUpdates));
const prizeImage = { imageData: `data:image/png;base64,${readFileSync(new URL('questions/assets/quiz-prizes.png', root)).toString('base64')}`, imageAlt: '호텔 숙박권, 상품권, 제주 기념품을 소개하는 일러스트' };
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const bundle = entry => buildSync({ entryPoints: [fileURLToPath(new URL(entry, root))], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', write: false }).outputFiles[0].text;
const shell = read('web/host-shell.html');
const style = shell.match(/<style>([\s\S]*?)<\/style>/)[1];
const panel = `<section class="panel cloud-panel" id="cloud-panel"><p id="cloud-status" role="status" aria-live="polite">클라우드에 연결하는 중…</p><p id="cloud-error" class="cloud-error" role="status"></p><a id="cloud-login" href="/" hidden>진행자 다시 로그인</a><details><summary>노트북 스크린 연결</summary><p class="hint">노트북에서 아래 주소를 열고 전체화면을 켜세요. 스크린에서 소리 켜기를 한 번 누르면 음악과 효과음도 함께 제어할 수 있습니다.</p><label>스크린 주소<input id="cloud-screen-url" readonly aria-label="노트북 스크린 주소"></label><div class="buttons"><a class="file-label" id="cloud-screen-link" href="/screen" target="_blank" rel="noopener">스크린 열기 ↗</a><button id="cloud-copy-link">스크린 링크 복사</button></div></details><button id="cloud-logout">로그아웃</button></section>`;
const cloudStyle = `body[data-cloud=presenter] .cloud-panel{display:flex;align-items:center;gap:12px;flex-wrap:wrap}body[data-cloud=presenter] .cloud-panel>p{flex:1;margin:0;color:#b9eac7;font-size:14px}body[data-cloud=presenter] .cloud-panel details{flex-basis:100%;order:3}body[data-cloud=presenter] .cloud-panel summary{font-size:15px}body[data-cloud=presenter] .cloud-panel a{color:#c7c2ff}body[data-cloud=presenter] #cloud-logout{padding:8px 12px;font-size:13px}#cloud-recipient-recovery[hidden]{display:none}.cloud-error{flex-basis:100%;color:#ffdf93!important}.cloud-error:empty{display:none}.cloud-current{white-space:pre-wrap;line-height:1.5;color:#dce6ff;font-weight:700}body[data-cloud=presenter] #controls .action{min-height:54px}body[data-cloud=presenter] input,body[data-cloud=presenter] textarea,body[data-cloud=presenter] select{font-size:16px}@media(max-width:650px){body[data-cloud=presenter] main{padding:12px}body[data-cloud=presenter] header{gap:10px}body[data-cloud=presenter] header h1{font-size:26px}body[data-cloud=presenter] header>button{font-size:14px;padding:10px}body[data-cloud=presenter] .page-nav{position:static;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:8px 0}body[data-cloud=presenter] .page-nav button{font-size:12px;padding:10px 5px;min-height:42px}body[data-cloud=presenter] .page-nav small{grid-column:1/-1;font-size:11px}body[data-cloud=presenter] .cloud-panel{padding:12px;margin:8px 0}body[data-cloud=presenter] .cloud-panel>p{font-size:12px}body[data-cloud=presenter] .cloud-panel summary{font-size:14px}body[data-cloud=presenter] .cloud-current{font-size:15px;margin:6px 0 12px}body[data-cloud=presenter] #controls{padding:14px}body[data-cloud=presenter] #controls .action{font-size:20px;min-height:55px}body[data-cloud=presenter] .stage{min-height:360px}.cloud-panel details input{word-break:break-all}}`;
const host = shell.replace('<body>', '<body data-cloud="presenter">')
  .replace('</style>', `${cloudStyle}</style>`)
  .replace('</header>', `</header>${panel}`)
  .replace('<div id="recipients-book"></div>', '<div id="cloud-recipient-recovery" hidden><p class="hint">이 기기에 전송하지 못한 명단이 있고 서버의 명단도 바뀌었습니다. 보관된 입력을 백업하거나, 확인 후 복원할 수 있습니다.</p><div class="buttons"><button id="cloud-recipient-draft-backup">보관된 명단 JSON 백업</button><button id="cloud-recipient-draft-restore">보관된 명단으로 복원하여 저장</button></div></div><div id="recipients-book"></div>')
  .replace('<h2>진행 제어</h2>', '<h2>진행 제어</h2><p id="cloud-current" class="cloud-current"></p>')
  .replace(/<p class="note">Windows[\s\S]*?<\/p>/, '<p class="note">핸드폰에서 제어하면 연결한 노트북 스크린이 함께 바뀝니다. 소리는 노트북 스크린에서 재생합니다.</p>')
  .replace('직접 읽고, 직접 공개하고, 원하는 속도로 진행하세요.', '핸드폰으로 제어하고, 노트북 스크린에 함께 표시하세요.')
  .replace('진행자 전용 명단입니다. 이 브라우저에 저장되며 프로젝션에는 표시되지 않습니다.', '진행자 전용 명단입니다. 클라우드에 저장되며 공개 스크린에는 표시되지 않습니다.')
  .replace('/*__QUIZ_DATA__*/', () => json(questions))
  .replace('/*__QUIZ_PRIZES__*/', () => json(prizeImage))
  .replace('/*__QUIZ_ASSETS__*/', () => json(assetUpdates))
  .replace('/*__QUIZ_APP__*/', () => bundle('web/src/quiz/presenter.js').replaceAll('</script', '<\\/script'));
const screen = read('web/cloud-screen.html').replace('/*__CLOUD_STYLE__*/', () => style).replace('/*__CLOUD_PRIZES__*/', () => json(prizeImage));
if (/\/\*__QUIZ_|\/\*__CLOUD_/.test(host + screen)) throw Error('Unresolved cloud placeholder.');
mkdirSync(out, { recursive: true });
for (const [name, value] of Object.entries({ 'host.html': host, 'screen.html': screen, 'screen.js': bundle('web/src/cloud/screen.js'), 'login.html': read('web/cloud-login.html'), 'seed.json': json(questions), 'asset-updates.json': json(assetUpdates), 'prize-data.json': json(prizeImage) })) writeFileSync(new URL(name, out), value);
console.log(`Cloud presenter + isolated screen built: ${questions.length} questions; ${fileURLToPath(out)}`);
