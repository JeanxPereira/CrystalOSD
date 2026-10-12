// Record the writes to chosen words of HDD OSD 1.10U over a cold-boot session: every store that hits a
// write watchpoint, with its pc, address, value and the return address, per frame, and a checkpoint of
// the menu state after each pad step.
//
//   node with_emulator.mjs node cold_record.mjs --name <capture> --watch name=0x409130:4,... [--route boot|session|<file.json>]
//        [--frames 330] [--args "SkipSearchLater"] [--build hddosd-1.10U-host] [--state <name>]
//
// A route is a list of [buttons, framesHeld, framesWaited] steps run after --frames (a pad route file:
// { "steps": [["down",6,30], ...] }). The log is <captures>/<name>.writes.json.
import fs from 'node:fs';
import path from 'node:path';
import { openSession, watch, watchWindows, runTo, pressActions, hex, save, shot } from './cold_session.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : fallback; };
const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const name = option('name');
if (!name) throw new Error('--name is required');

export const ROUTES = {
  boot: [],
  session: [
    ['down', 6, 30], ['cross', 6, 130],
    ['cross', 6, 40], ['up', 6, 30], ['right', 6, 20], ['up', 6, 20], ['cross', 6, 60],
    ...[1, 2, 3, 4, 5, 6].flatMap(() => [['down', 6, 30], ['cross', 6, 30], ['right', 6, 30], ['cross', 6, 60]]),
    ['circle', 6, 130], ['square', 6, 120],
  ],
  session2: [
    ['down', 6, 30], ['cross', 6, 130],
    ['cross', 6, 40], ['up', 6, 30], ['right', 6, 20], ['up', 6, 20], ['cross', 6, 60],
    ...[1, 2, 3, 4, 5, 6].flatMap(() => [['down', 6, 30], ['cross', 6, 30], ['right', 6, 30], ['cross', 6, 60]]),
    ['up', 6, 30], ['left', 6, 30], ['triangle', 6, 150], ['circle', 6, 150],
    ['circle', 6, 130], ['up', 6, 30], ['down', 6, 30], ['square', 6, 120],
  ],
};

const watched = option('watch', '').split(',').filter(Boolean).map((spec) => {
  const [label, range] = spec.split('=');
  const [start, length] = range.split(':').map(Number);
  return { name: label, start, end: start + length };
});
const images = option('image', '').split(',').filter(Boolean).map((spec) => {
  const [label, range] = spec.split('=');
  const [start, length] = range.split(':').map(Number);
  return { name: label, start, length };
});
const routeName = option('route', 'boot');
const steps = ROUTES[routeName] ?? JSON.parse(fs.readFileSync(routeName, 'utf8')).steps;
const baseFrames = Number(option('frames', 330));

const session = await openSession({ build: option('build'), state: option('state'), args: option('args', 'SkipSearchLater') });
const log = { images: {}, capture: name, build: option('build', 'hddosd-1.10U-host'), args: option('args', 'SkipSearchLater'), route: routeName, watch: watched, checkpoints: [], hits: [] };
const word = (address) => session.word(address);
const checkpoint = async (tag) => log.checkpoints.push({
  tag, frame: await session.frame(), counter: await word(0x3702D4), mode: await word(0x370AB4), screenCode: await word(0x370A7C),
  mainMenuSelected: await word(0x2B2E70), configPageSelected: await word(0x2B2DF8), rtcMirror: hex(await word(0x1F0D1C)),
});
try {
  const windows = option('windows', '').split(',').filter(Boolean).map((w) => { const [from, to] = w.split(':').map(Number); return { from, to }; });
  if (windows.length) watchWindows(session, watched, windows); else await watch(session, watched);
  await runTo(session, baseFrames, 'boot');
  await checkpoint('boot');
  for (const image of images) log.images[image.name] = { start: image.start, boot: (await session.bytes(image.start, image.length)).toString('hex') };
  for (const [buttons, held, waited] of steps) {
    const now = await session.frame();
    await runTo(session, now + held + waited, `${buttons}@${now}`, pressActions([buttons], now, held));
    await checkpoint(`${buttons}@${now}`);
  }
  log.hits = session.hits;
  log.stopsWithoutStore = { count: session.spurious ?? 0, samples: session.spuriousSamples ?? [] };
  log.windows = { opened: session.windowOpened ?? [], closed: session.windowClosed ?? [] };
  log.frames = await session.frame();
  for (const image of images) log.images[image.name].end = (await session.bytes(image.start, image.length)).toString('hex');
  if (option('shot')) await shot(session, path.join(CAPTURES, `${name}.png`));
  save(path.join(CAPTURES, `${name}.writes.json`), log);
  console.log(`${name}: ${session.hits.length} writes, ${log.frames} frames, ${log.checkpoints.length} checkpoints`);
} catch (error) {
  log.hits = session.hits;
  log.error = error.message;
  save(path.join(CAPTURES, `${name}.writes.partial.json`), log);
  throw error;
} finally {
  await session.close();
}
