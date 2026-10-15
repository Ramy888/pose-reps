// Records examples/browser/simulate.html to docs/demo.gif with headless Chrome and ffmpeg.
// Usage: npm run build && node scripts/record-demo.mjs
// Needs Google Chrome and ffmpeg on PATH (or CHROME=/path/to/chrome).
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {extname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = {'.html': 'text/html', '.js': 'text/javascript'};

// Static server for the repo, so the page can import ../../dist/index.js.
const server = createServer((req, res) => {
  try {
    const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(ROOT)) throw new Error('outside root');
    const body = readFileSync(path);
    res.writeHead(200, {'content-type': TYPES[extname(path)] ?? 'application/octet-stream'});
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;

const profile = mkdtempSync(join(tmpdir(), 'pose-reps-chrome-'));
const frames = mkdtempSync(join(tmpdir(), 'pose-reps-frames-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=720,440', 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});

try {
  const wsUrl = await new Promise((ok, fail) => {
    chrome.stderr.on('data', (d) => {
      const m = String(d).match(/ws:\/\/\S+/);
      if (m) ok(m[0]);
    });
    setTimeout(() => fail(new Error('Chrome did not start')), 15000);
  });
  const browser = new WebSocket(wsUrl);
  await new Promise((ok) => browser.addEventListener('open', ok, {once: true}));
  let id = 0;
  const pending = new Map();
  browser.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, fail) => {
      const n = ++id;
      pending.set(n, (m) => (m.error ? fail(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
      browser.send(JSON.stringify({id: n, method, params, sessionId}));
    });

  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  const s = (method, params) => send(method, params, sessionId);
  await s('Emulation.setDeviceMetricsOverride', {width: 720, height: 440, deviceScaleFactor: 1, mobile: false});
  await s('Page.navigate', {url: `http://127.0.0.1:${port}/examples/browser/simulate.html?record=1`});
  const evaluate = async (expression) => (await s('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true})).result.value;
  for (let i = 0; i < 100 && !(await evaluate('window.ready === true')); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const total = await evaluate('window.totalFrames');
  mkdirSync(frames, {recursive: true});
  for (let i = 0; i < total; i++) {
    await evaluate(`window.renderFrame(${i})`);
    const {data} = await s('Page.captureScreenshot', {format: 'png', clip: {x: 0, y: 0, width: 720, height: 440, scale: 1}});
    writeFileSync(join(frames, `f${String(i).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
  }
  browser.close();

  mkdirSync(join(ROOT, 'docs'), {recursive: true});
  const out = join(ROOT, 'docs', 'demo.gif');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(frames, 'f%04d.png'),
    '-vf', 'fps=15,scale=600:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none',
    out]);
  console.log(`Wrote ${out} (${total} frames)`);
} finally {
  const exited = new Promise((ok) => chrome.once('exit', ok));
  chrome.kill();
  await exited;
  server.close();
  rmSync(profile, {recursive: true, force: true});
  rmSync(frames, {recursive: true, force: true});
}
