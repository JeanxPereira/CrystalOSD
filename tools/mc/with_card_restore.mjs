// node References/scripts/with_emulator.mjs node tools/mc/with_card_restore.mjs <command> [arguments...]
// Runs a command that may change the Watson instances' memory card files (the OSD's Format does) and
// puts every card file back as it was, whichever instance the session ran on.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RUNTIME = process.env.WATSON_RUNTIME ?? 'D:/CodingProjects/Watson/Runtime';
const cards = [1, 2, 3, 4].flatMap((i) => [1, 2].map((s) => `${RUNTIME}/instance-${i}/PCSX2/memcards/Mcd00${s}.ps2`)).filter((f) => fs.existsSync(f));
const keep = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-restore-'));
const saved = cards.map((file, n) => ({ file, copy: path.join(keep, String(n)) }));
for (const card of saved) fs.copyFileSync(card.file, card.copy);
const [command, ...rest] = process.argv.slice(2);
let status = 1;
try {
  status = spawnSync(command, rest, { stdio: 'inherit' }).status ?? 1;
} finally {
  for (const card of saved) {
    if (fs.readFileSync(card.file).equals(fs.readFileSync(card.copy))) continue;
    for (let attempt = 0; ; attempt++) {
      try { fs.copyFileSync(card.copy, card.file); console.log(`restored ${card.file}`); break; } catch (error) {
        if (attempt === 60) { console.error(`could not restore ${card.file}: ${error.code}; the original is ${card.copy}`); process.exitCode = 1; break; }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
      }
    }
  }
  if (!process.exitCode) fs.rmSync(keep, { recursive: true, force: true });
}
process.exit(process.exitCode || status);
