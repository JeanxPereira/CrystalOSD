// The cause of each budget entry of a textured pass: PCSX2's software texture cache converts only the draw's texture rectangle (the
// vertices' texel range, -0.5 and +0.5 for bilinear, floor and ceil) and reads zero outside it. An entry is explained when the draw is
// bilinear and an edge event at its pixel samples a tap outside that rectangle by one texel.
//   node tools/parity/budget_cause.mjs <ParityTool.exe> <shaders> <fixture f0> <budget.json> <sidecar.json> [--check]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function rectangleOf(pass) {
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (const v of pass.vertices) {
    const u = v[7] / v[9] * pass.texture.width, w = v[8] / v[9] * pass.texture.height;
    umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, w); vmax = Math.max(vmax, w);
  }
  return { u: [Math.floor(umin - 0.5), Math.ceil(umax + 0.5) - 1], v: [Math.floor(vmin - 0.5), Math.ceil(vmax + 0.5) - 1] };
}

/** Events are the renderer's edge trace lines "pass x y u v coverage" with u and v in 1/65536 texel; only a pass's first run counts (the isolated one). */
export function parseTrace(text) {
  const events = new Map(), done = new Set();
  let current = null;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [pass, x, y, u, v, coverage] = line.split(' ');
    if (pass !== current) { if (current) done.add(current); current = pass; if (done.has(pass)) current = null; }
    if (current === null) continue;
    const key = `${pass} ${x} ${y}`;
    if (!events.has(key)) events.set(key, []);
    events.get(key).push({ u: Number(u) / 65536, v: Number(v) / 65536, coverage: Number(coverage) });
  }
  return events;
}

export function causes(frame, observed, events) {
  return observed.filter((o) => o.scope !== 'chained').map((o) => {
    const pass = frame.passes.find((p) => p.name === o.scope);
    const rectangle = rectangleOf(pass);
    const list = (events.get(`${o.scope} ${o.x} ${o.y}`) ?? []).map((e) => {
      const taps = { u: [Math.floor(e.u), Math.floor(e.u) + 1], v: [Math.floor(e.v), Math.floor(e.v) + 1] };
      const outside = Math.max(rectangle.u[0] - taps.u[0], taps.u[1] - rectangle.u[1], rectangle.v[0] - taps.v[0], taps.v[1] - rectangle.v[1], 0);
      return { u: Number(e.u.toFixed(3)), v: Number(e.v.toFixed(3)), coverage: e.coverage, tapsU: taps.u, tapsV: taps.v, outsideBy: outside };
    });
    const explained = pass.texture.filter === 'Bilinear' && list.some((e) => e.outsideBy === 1);
    return { scope: o.scope, target: o.target, x: o.x, y: o.y, delta: o.delta, bilinear: pass.texture.filter === 'Bilinear', rectangle, events: list, explained };
  }).sort((a, b) => a.scope.localeCompare(b.scope) || a.target.localeCompare(b.target) || a.x - b.x || a.y - b.y);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [tool, shaders, fixture, budgetFile, sidecar, mode] = process.argv.slice(2);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cause-'));
  const trace = path.join(work, 'edges.txt');
  const run = spawnSync(tool, [fixture, path.join(work, 'out'), shaders], { env: { ...process.env, CLOCK_EDGE_TRACE: trace }, stdio: 'ignore' });
  if (run.status !== 0) { console.error('ParityTool failed'); process.exit(1); }
  const frame = JSON.parse(fs.readFileSync(path.join(fixture, 'frame.json'), 'utf8'));
  const observed = JSON.parse(fs.readFileSync(path.join(work, 'out', 'observed.json'), 'utf8')).differences;
  const result = causes(frame, observed, parseTrace(fs.readFileSync(trace, 'utf8')));
  fs.rmSync(work, { recursive: true, force: true });
  const budget = JSON.parse(fs.readFileSync(budgetFile, 'utf8')).differences;
  const key = (e) => `${e.scope} ${e.target} ${e.x} ${e.y}`;
  const budgeted = new Set(budget.map(key));
  let bad = 0;
  for (const r of result) if (!r.explained || !budgeted.has(key(r))) { console.error(`unexplained or unbudgeted: ${key(r)}`); bad++; }
  for (const b of budget) if (b.scope !== 'chained' && !result.some((r) => key(r) === key(b))) { console.error(`budget entry with no observed difference: ${key(b)}`); bad++; }
  const text = `${JSON.stringify({ rule: 'bilinear tap one texel outside the draw texture rectangle (PCSX2 software texture cache reads zero there)', entries: result }, null, 1)}\n`;
  if (mode === '--check') {
    if (fs.readFileSync(sidecar, 'utf8').replace(/\r\n/g, '\n') !== text) { console.error(`${sidecar} is stale`); bad++; }
  } else fs.writeFileSync(sidecar, text);
  console.log(`${result.length} entries, ${bad} problems`);
  process.exit(bad ? 1 : 0);
}
