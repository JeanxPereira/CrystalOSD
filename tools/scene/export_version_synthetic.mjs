// Scripted pad words through References/model/clock_version.mjs (the Version page, verified bit for bit by verify_version.mjs):
// a page of a given number of rows and shown rows is opened, walked up and down, and closed. Each frame records the page the
// native port must hold after it. The job answers on its second poll and the sub-rows come from the scenario, as in the captures.
//   CLOCK_BUILD=hdd node tools/scene/export_version_synthetic.mjs [out.json]
//   default out: <CRYSTALOSD_DATA>/fixtures/synthetic-version/scenarios.json
import fs from 'node:fs';
import { dataPath } from '../../References/lib/data.mjs';
process.env.CLOCK_BUILD ??= 'hdd';
const { REFERENCES } = await import('./instrument.mjs');
const { Memory } = await import(new URL('model/clock_memory.mjs', REFERENCES));
const { V, STACK_RECORD, ROWS, ROW, LIST_ROW, versionPage, triangle, frontTick } = await import(new URL('model/clock_version.mjs', REFERENCES));

const B = { up: 0x1000, down: 0x4000, cross: 0x20, circle: 0x40, triangle: 0x10 };
const ROWS_AT = 0x00404d48;
const ELF_ROWS = [
  { label: 0x62, value: 'Unknown', subRows: 1, id: 0 }, { label: 0x65, value: '2.00', subRows: 0, id: 3 }, { label: 0x66, value: '1.30', subRows: 0, id: 5 },
  { label: 0x70, value: '1.00', subRows: 0, id: 6 }, { label: 0x71, value: '3.10', subRows: 0, id: 7 }, { label: 0x72, value: '0.50', subRows: 2, id: 8 },
  { label: 0x73, value: '9.99', subRows: 0, id: 9 }, { label: 0x74, value: '4.20', subRows: 0, id: 10 },
];
const walk = (n) => [...Array(n)].flatMap(() => ['down', null]);
const SCENARIOS = {
  'three-rows-shown-6': { rows: ELF_ROWS.slice(0, 3), shown: 6, script: [null, null, 'triangle', ...Array(14).fill(null), 'down', null, 'down', null, 'down', null, 'up', null, 'up', null, 'up', null, 'up', null, 'circle', ...Array(14).fill(null)] },
  'eight-rows-shown-3': { rows: ELF_ROWS, shown: 3, script: [null, 'triangle', ...Array(14).fill(null), ...walk(9), ...[...Array(9)].flatMap(() => ['up', null]), 'circle', ...Array(14).fill(null)] },
  'eight-rows-shown-1': { rows: ELF_ROWS, shown: 1, script: [null, 'triangle', ...Array(14).fill(null), ...walk(8), ...[...Array(3)].flatMap(() => ['up', null]), 'circle', ...Array(14).fill(null)] },
  'close-while-rising': { rows: ELF_ROWS.slice(0, 3), shown: 6, script: [null, 'triangle', ...Array(5).fill(null), 'circle', 'down', ...Array(6).fill(null), 'circle', ...Array(14).fill(null)] },
};

const word = (b, address) => b.view(address, 4).readInt32LE(0);
function run(scenario) {
  const blocks = [[V.record, 0x28], [ROWS_AT, ROWS * ROW], [0x00370130, 0x20], [V.hints, 0x14], [V.job, 4], [V.front, 0x14], [V.stack, 30 * STACK_RECORD], [V.pad, 0x10],
    [V.videoMode, 4], [V.tail, 4], [V.list, ROWS * LIST_ROW], [V.menu, 0x28], [V.configRamp, 0x10], [V.dialogRamp, 0x10], [V.firstRunRamp, 0x10], [V.scene, 0xc], [V.page, 4]];
  const m = new Memory('hdd', blocks.map(([address, length]) => ({ address, bytes: Buffer.alloc(length) })));
  const record = m.view(V.record, 0x28);
  record.writeInt32LE(0x59, 0); record.writeUInt32LE(ROWS_AT, 4); record.writeInt32LE(3, 8); record.writeInt32LE(scenario.shown, 0xc); record.writeInt32LE(10, 0x18);
  m.view(V.front, 4).writeUInt32LE(V.stack, 0);
  m.view(V.stack + 0x1c, 4).writeInt32LE(10, 0);
  m.view(V.videoMode, 4).writeInt32LE(1, 0);
  for (const o of [0, 4, 8, 12]) m.view(V.hints + o, 4).writeInt32LE(1, 0);
  m.view(V.menu + 0x18, 16).writeInt32LE(10, 0);
  m.view(V.menu + 0x18 + 12, 4).writeInt32LE(2, 0);
  scenario.rows.forEach((row, k) => {
    const entry = m.view(V.list + k * LIST_ROW, LIST_ROW);
    entry.writeUInt32LE(row.label, 0); entry.writeUInt32LE(0x100 + k, 4); entry.writeInt32LE(row.id, 8);
  });
  const frames = [];
  let polls = 0;
  const notes = [];
  for (const press of scenario.script) {
    m.view(V.pad + 4, 4).writeInt32LE(press ? B[press] : 0, 0);
    const io = {
      poll: () => polls++ >= 1,
      subRows: (k) => scenario.rows[k].subRows,
      submit: () => { polls = 0; return true; },
    };
    versionPage(m, io, notes);
    triangle(m, io);
    frontTick(m, notes);
    const rows = Array.from({ length: ROWS }, (_, k) => {
      const row = m.view(ROWS_AT + k * ROW, ROW);
      const source = scenario.rows[k];
      return { label: row.readUInt32LE(0), value: row.readUInt32LE(4) === 0 ? '' : source?.value ?? '?', subRows: row.readInt32LE(8), id: row.readInt32LE(0xc) };
    });
    frames.push({
      pressed: press ? B[press] : 0,
      count: record.readInt32LE(8), selected: record.readInt32LE(0x10), first: record.readInt32LE(0x14),
      ramp: { length: record.readInt32LE(0x18), counter: record.readInt32LE(0x1c), changed: record.readInt32LE(0x20), state: record.readInt32LE(0x24) },
      rows, job: word(m, V.job), panelOn: word(m, 0x00370140), panelAlpha: word(m, 0x0037013c),
      hints: [0, 4, 8, 12].map((o) => word(m, V.hints + o)), arrows: word(m, V.arrows),
    });
  }
  const unmodelled = notes.filter((n) => !n.startsWith('row '));
  if (unmodelled.length) throw new Error(`a front page was asked for: ${unmodelled[0]}`);
  return { shown: scenario.shown, list: scenario.rows, frames };
}

const out = process.argv[2] ?? dataPath('fixtures/synthetic-version/scenarios.json');
const path = await import('node:path');
const outPath = out.href ? new URL(out).pathname.slice(1) : out;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(Object.fromEntries(Object.entries(SCENARIOS).map(([name, scenario]) => [name, run(scenario)])))}\n`);
console.log(`${outPath}: ${Object.keys(SCENARIOS).length} scenarios`);
