// The sequencer model against OSDSND's own code, tick by tick, for far longer than a capture.
//
// The tick function (OSDSND 0x2470, in the module image the start capture dumped) is run by the R3000A interpreter
// (../lib/iop_cpu.mjs) on a copy of the module's memory; the libsd calls it makes (sceSdSetParam, GetParam, SetSwitch, GetSwitch,
// SetAddr: module stubs 0x844C..0x846C) are answered by the register model and sysclib's memset and memcpy by the host. The
// model (../model/sound_osdsnd_sequencer.mjs) runs on the same snapshot. Each tick, both must write the same SPU2 registers in
// the same order and leave the same bytes in the slot, voice and context tables and the globals. ENVX is answered by one
// deterministic function for both; in "stress" runs every voice the snapshot leaves free is first made busy, so that the
// allocator finds no free voice and steals or gives up. 40,000 ticks cover the loop restart of SNDCLOKS (tick 288000 of its clock,
// about 18,000 OSDSND ticks) which a 60 s capture does not reach.
// node verify_sound_sequencer_code.mjs <capture>.start.osdsnd.bin [stress]
import { IopCpu } from '../lib/iop_cpu.mjs';
import { loadSnapshot, OSDSND_BASE } from '../model/sound_snapshot.mjs';
import { makeRegisters, setParam, setAddr, setSwitch, getSwitch } from '../model/sound_libsd.mjs';
import { makeSequencer } from '../model/sound_osdsnd_sequencer.mjs';

const [file, mode] = process.argv.slice(2);
const stem = file.replace(/.start.osdsnd.bin$/, "");
const stress = mode === 'stress';
const TICKS = 40000;
const snap = loadSnapshot(stem);
const M = (o) => OSDSND_BASE + o;

let tickNumber = 0;
const envx = (voice) => (stress ? (voice % 3 === 0 && tickNumber % 50 === 0 ? 1 : 0x4000) : ((tickNumber * 7 + voice * 13) % 5 === 0 ? 1 : 0x4000));
const model = makeSequencer(snap, { envx: (core, voice) => envx(voice) });

const cpu = new IopCpu();
cpu.load(OSDSND_BASE, snap.osdsnd);
cpu.load(0xeb000, snap.iop);
const regs = makeRegisters();
for (const core of snap.spustate.cores) {
  setSwitch(regs, core.index, 'VMIXEL', Number.parseInt(core.regs.vmixel, 16));
  setSwitch(regs, core.index, 'VMIXER', Number.parseInt(core.regs.vmixer, 16));
}
regs.log.length = 0;
const SWITCH = { 0x14: 'NON', 0x15: 'KON', 0x16: 'KOFF', 0x18: 'VMIXL', 0x19: 'VMIXEL', 0x1a: 'VMIXR', 0x1b: 'VMIXER' };
const PARAM = ['VOLL', 'VOLR', 'PITCH', 'ADSR1', 'ADSR2', 'ENVX', 'VOLXL', 'VOLXR'];
cpu.hook(M(0x844c), (c) => { const e = c.r[4]; setParam(regs, e & 1, (e >> 1) & 31, PARAM[(e >> 8) & 7], c.r[5]); return 0; });
cpu.hook(M(0x8454), (c) => envx((c.r[4] >> 1) & 31));
cpu.hook(M(0x845c), (c) => { const e = c.r[4]; setSwitch(regs, e & 1, SWITCH[e >> 8], c.r[5] >>> 0); return 0; });
cpu.hook(M(0x8464), (c) => getSwitch(regs, c.r[4] & 1, SWITCH[c.r[4] >> 8]) | 0);
cpu.hook(M(0x846c), (c) => { setAddr(regs, c.r[4] & 1, (c.r[4] >> 1) & 31, c.r[5] >>> 0); return 0; });
cpu.hook(M(0x8624), (c) => { for (let k = 0; k < c.r[6]; k++) c.w8(c.r[4] + k, c.r[5]); return c.r[4]; });
cpu.hook(M(0x861c), (c) => { for (let k = 0; k < c.r[6]; k++) c.w8(c.r[4] + k, c.u8(c.r[5] + k)); return c.r[4]; });

if (stress) {
  for (const ram of [model.mem.ram, cpu.ram]) {
    for (let j = 0; j < 24; j++) {
      const at = M(0x9330) + 0x3c * j;
      if (ram.readUInt16LE(at) === 0 && ram.readUInt16LE(at + 2) === 0) {
        ram.writeUInt16LE(1, at);
        ram.writeUInt16LE(0x7f, at + 2);
        ram.writeUInt16LE(15, at + 4);
        ram.writeUInt16LE(0x17, at + 6);
        ram.writeUInt16LE(j % 2, at + 8);
        ram.writeUInt16LE(j, at + 0xa);
        ram.writeUInt16LE(0xffff, at + 0x1c);
      }
    }
  }
}

const watched = [[M(0x9330), 24 * 0x3c], [M(0x9ed0), 24 * 0x44], [M(0xa530), 0x40], [M(0x9200), 0xa0]];
let compared = 0;
const failures = [];
let writes = 0;
let notes = 0;
for (let t = 0; t < TICKS && failures.length === 0; t++) {
  tickNumber = t;
  const before = regs.log.length;
  cpu.call(M(0x2470), []);
  const fromCode = regs.log.slice(before);
  const fromModel = model.tick();
  compared += 1;
  if (JSON.stringify(fromCode) !== JSON.stringify(fromModel)) { failures.push({ why: 'writes', tick: t, code: fromCode.slice(0, 3), model: fromModel.slice(0, 3) }); break; }
  writes += fromCode.length;
  notes += model.state.notes.filter((n) => n.on !== undefined).length;
  for (const [base, length] of watched) {
    compared += 1;
    if (Buffer.compare(cpu.ram.subarray(base, base + length), model.mem.ram.subarray(base, base + length)) !== 0) {
      let k = 0;
      while (cpu.ram[base + k] === model.mem.ram[base + k]) k += 1;
      failures.push({ why: 'memory', tick: t, offset: `0x${(base + k - OSDSND_BASE).toString(16)}`, code: cpu.ram[base + k], model: model.mem.ram[base + k] });
      break;
    }
  }
}
console.log(`${mode ?? 'plain'} run from ${stem}: ${TICKS} ticks, ${writes} SPU2 writes, ${notes} note-ons`);
if (compared === 0) throw new Error('compared nothing: not a verifier');
console.log(`compared ${compared} items, ${failures.length} differ`);
for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f));
console.log(failures.length === 0 ? `verdict: FOUND ${compared} items equal` : `verdict: PARTIAL ${failures.length} of ${compared} differ`);
process.exit(failures.length === 0 ? 0 : 1);
