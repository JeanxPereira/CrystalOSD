// The clock thread's exits for the drive's codes 0x6A..0x75 and the Browser's 9999: what the
// thread writes when the weight reaches 0 (HDD OSD clock_input_check_handler_p6_p7_tgt
// 0x00225BCC..0x00225CD8, ROM 2.30 0x002212A0..0x002213AC), against sessions where the code was
// put in s0 at the decision (HDD 0x00225A4C, ROM 0x002210D4) and the thread stopped at the end
// (HDD 0x00225CD4, ROM 0x002213AC). The logs are written by the flow capture helper.
//
// HDD OSD writes execute_app_type at 0x1F0010 and module / previous module at 0x1F0648 / 0x1F064C;
// ROM 2.30 at 0x1F0014 and 0x1F05E8 / 0x1F05EC.
// node verify_exits.mjs <log>...   (a log named hddosd-* is HDD OSD, rom-* is ROM 2.30)
// A run of 0x72 reads the gate word after the writes: 0 must not exit, above 0 must exit as the others.
import fs from 'node:fs';
import path from 'node:path';

/** What the exit writes for a code: { app } (execute_app_type only) or { module } (module, previous 2). */
export function exit(code, build) {
  if (code === 0x6a || code === 0x6b) return { app: 2 };
  if (code === 0x6c || code === 0x6d) return { app: 1 };
  if (code === 0x6e) return { app: 0 };
  if (code === 0x6f || code === 0x70) return { module: 3 };
  if (code === 0x71) return { app: 5 };
  if (code === 0x72) return { module: 5 };
  if (code === 0x73) return { app: 3 };
  if (code === 0x74) return { module: 4 };
  if (code === 0x75 && build === 'rom') return { app: 3 };
  return { module: 3 };                                  // 9999 (the Browser) and anything else
}
/** 0x72 is only taken while the word at HDD 0x1F0D58 / ROM 0x1F0CF8 is above 0 (blez at HDD 0x00225A80). */
const GATED = 0x72;
const GATE_WORD = { hdd: 0x1f0d58, rom: 0x1f0cf8 };

function parse(file) {
  const runs = [];
  let run = null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    let m;
    if ((m = /write_register: Set cat=0 reg=16 = ([0-9a-f]+)/.exec(line))) { run = { code: parseInt(m[1], 16), words: {} }; runs.push(run); }
    else if (run && (m = /stopped after (\d+) of 400 frames at pc (0x[0-9a-f]+)/.exec(line))) run.stop = { frames: Number(m[1]), pc: parseInt(m[2], 16) };
    else if (run && (m = /Memory at (0x[0-9a-f]+) \((\d+)B\): \| [0-9a-f]+  ([0-9a-f ]+?)\s+\|/.exec(line))) {
      const bytes = Buffer.from(m[3].replace(/ /g, ''), 'hex');
      for (let i = 0; i + 4 <= bytes.length; i += 4) run.words[parseInt(m[1], 16) + i] = bytes.readInt32LE(i);
    }
  }
  return runs;
}

const builds = { hdd: { app: 0x1f0010, module: 0x1f0648, previous: 0x1f064c, end: 0x225cd4 }, rom: { app: 0x1f0014, module: 0x1f05e8, previous: 0x1f05ec, end: 0x2213ac } };
let all = true;
let compared = 0;
for (const file of process.argv.slice(2)) {
  const build = path.basename(file).startsWith('rom') ? 'rom' : 'hdd';
  const B = builds[build];
  for (const run of parse(file)) {
    const want = exit(run.code, build);
    const gate = run.code === GATED ? run.words[GATE_WORD[build]] : undefined;
    let ok, text;
    if (run.code === GATED && !(gate > 0)) { ok = !run.stop; text = `no exit within 400 frames (gate word ${gate ?? "not read"})`; }
    else {
      const appOk = want.app !== undefined ? run.words[B.app] === want.app : run.words[B.app] === -1;
      const moduleOk = want.module !== undefined ? run.words[B.module] === want.module && run.words[B.previous] === 2 : run.words[B.module] === 2;
      ok = run.stop && run.stop.pc === B.end && run.stop.frames === 128 && appOk && moduleOk;
      text = `${gate === undefined ? '' : `gate word ${gate}, `}after ${run.stop?.frames} frames: app ${run.words[B.app]}, module ${run.words[B.module]}, previous ${run.words[B.previous]}; computed ${JSON.stringify(want)}`;
    }
    all &&= ok;
    compared++;
    console.log(`${build} 0x${run.code.toString(16)}: ${ok ? 'equal' : 'DIFFERENT'}  ${text}`);
  }
}
console.log(`verdict: ${all && compared ? 'FOUND every exit as the code says' : 'PARTIAL see the lines marked DIFFERENT'}`);
