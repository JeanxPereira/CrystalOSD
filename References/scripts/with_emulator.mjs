// node with_emulator.mjs <command> [arguments...]
// Runs one emulator session (launch to kill) in one of the slots, so that several workers share
// the machine without starting more emulators than watson.json allows. Waiters are served in the
// order they arrived. Watson gives each session its own emulator instance; this only limits how
// many run at once.
//
// WITH_EMULATOR_SLOTS and WITH_EMULATOR_DIR override the slot count and the lock directory (tests).
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DIR = process.env.WITH_EMULATOR_DIR ?? 'D:/CodingProjects/Watson/Runtime';
const SLOTS = Number(process.env.WITH_EMULATOR_SLOTS)
  || JSON.parse(fs.readFileSync(new URL('../../watson.json', import.meta.url), 'utf8')).instances || 1;
const WAIT_MS = 60 * 60 * 1000;
const QUEUE = path.join(DIR, 'emulator.queue');

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/** The pid in a lock or ticket file; 0 when it cannot be read (being written, or gone). */
const ownerOf = (file) => { try { return Number(fs.readFileSync(file, 'utf8').trim()) || 0; } catch { return 0; } };
const ageOf = (file) => { try { return Date.now() - fs.statSync(file).mtimeMs; } catch { return Infinity; } };
/** A file that holds a pid, created whole or not at all: written aside, then linked into place. */
function createWith(file, pid) {
  const temp = `${file}.${pid}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(temp, String(pid));
  try { fs.linkSync(temp, file); return true; } catch { return false; } finally { try { fs.unlinkSync(temp); } catch { /* gone */ } }
}
/** A lock or ticket whose owner is gone (or that never got an owner) is removed. */
function stale(file) {
  const owner = ownerOf(file);
  if (owner) return !alive(owner);
  return ageOf(file) > 5000;
}
const remove = (file) => { try { fs.unlinkSync(file); } catch { /* another waiter removed it */ } };

fs.mkdirSync(QUEUE, { recursive: true });
const ticket = path.join(QUEUE, `${String(Date.now()).padStart(15, '0')}-${String(process.pid).padStart(8, '0')}`);
createWith(ticket, process.pid);

/** How many live tickets came before this one. */
function ahead() {
  let count = 0;
  let names;
  try { names = fs.readdirSync(QUEUE); } catch { return 0; }
  for (const name of names.sort()) {
    const file = path.join(QUEUE, name);
    if (file === ticket) break;
    if (name.includes('.')) continue;
    if (stale(file)) { remove(file); continue; }
    count += 1;
  }
  return count;
}

function freeSlots() {
  const free = [];
  for (let slot = 0; slot < SLOTS; slot++) {
    const lock = path.join(DIR, `emulator.slot-${slot}.lock`);
    // A session started by the earlier wrapper holds a directory of that name.
    const legacy = ownerOf(path.join(DIR, `emulator.slot-${slot}`, 'owner'));
    if (legacy && alive(legacy)) continue;
    if (!fs.existsSync(lock)) { free.push(lock); continue; }
    if (stale(lock)) { remove(lock); free.push(lock); }
  }
  return free;
}

function acquire() {
  const free = freeSlots();
  if (ahead() >= free.length) return null;
  for (const lock of free) if (createWith(lock, process.pid)) return lock;
  return null;
}

const started = Date.now();
let lock;
while (!(lock = acquire())) {
  if (Date.now() - started > WAIT_MS) { remove(ticket); console.error('with_emulator: gave up waiting for a slot'); process.exit(75); }
  sleep(500 + Math.floor(Math.random() * 200));
}
remove(ticket);
let status = 1;
try {
  const [command, ...rest] = process.argv.slice(2);
  status = spawnSync(command, rest, { stdio: 'inherit' }).status ?? 1;
} finally {
  if (ownerOf(lock) === process.pid) remove(lock);
}
process.exit(status);
