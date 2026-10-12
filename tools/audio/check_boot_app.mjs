import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [app, resources, scratch, soak = '15'] = process.argv.slice(2);
if (!app || !resources || !scratch) { console.error('usage: node check_boot_app.mjs <CrystalClock.exe> <resources> <scratch dir> [seconds]'); process.exit(2); }
if (!fs.existsSync(app) || !fs.existsSync(path.join(resources, 'hddosd.elf'))) { console.log(`SKIPPED: no ${app} or no resources in ${resources}`); process.exit(77); }
fs.mkdirSync(scratch, { recursive: true });
const env = { ...process.env, SDL_AUDIODRIVER: 'dummy' };
const run = (args) => { const r = spawnSync(app, args, { encoding: 'utf8', env, maxBuffer: 1 << 26 }); return { status: r.status, text: r.stdout + r.stderr }; };

const wav = path.join(scratch, 'boot.wav'), trace = path.join(scratch, 'boot.jsonl'), log = path.join(scratch, 'boot.log');
const boot = run(['--soak', soak, '--mute', '--resources', resources, '--audio-wav', wav, '--trace', trace, '--log', log]);
const fail = (why) => { console.log(`FAIL ${why}`); console.log(boot.text.split('\n').slice(-8).join('\n')); process.exit(1); };
if (boot.status !== 0) fail(`status ${boot.status}`);
if (/^usage:/m.test(boot.text)) { console.log('SKIPPED: the app predates the flags'); process.exit(77); }
if (/audio: .*off|\[[^\]]*error\]/.test(boot.text) || /\berror\]/.test(fs.readFileSync(log, 'utf8'))) fail('audio off or an error logged');
const audio = boot.text.match(/^audio: .*$/m)?.[0] ?? '';
if (!audio || /FAILED/.test(audio)) fail('no audio summary or FAILED');

const rows = fs.readFileSync(trace, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const clock = rows.filter((r) => r.phase === 'clock');
if (clock.length < 60) fail(`the chain reached the clock for ${clock.length} frames`);
const drawn = clock.filter((r) => r.vertices > 0).length;
if (drawn < clock.length * 0.99) fail(`${clock.length - drawn} of ${clock.length} clock frames drew nothing`);
if (clock.at(-1).counter <= clock[1].counter + 30) fail('the clock counter does not advance');
if (!rows.some((r) => r.sent.length > 0)) fail('the opening sent no sound command');
if (!/phase black gap -> clock/.test(fs.readFileSync(log, 'utf8'))) fail('no hand-off in the log');

const samples = new Int16Array(fs.readFileSync(wav).buffer.slice(44, 44 + (fs.statSync(wav).size - 44) / 2 * 2));
const frame = 801 * 2;
const peakOf = (from, to) => { let p = 0; for (let i = from * frame; i < Math.min(to * frame, samples.length); ++i) p = Math.max(p, Math.abs(samples[i])); return p; };
const opening = peakOf(121, 280), afterHandOff = peakOf(281, 600);
if (!(opening > 0)) fail('the WAV is silent during the opening');
if (!(afterHandOff > 0)) fail('the WAV is silent after the hand-off');
console.log(`PASS: boot from the raw folder: ${clock.length} clock frames, ${drawn} drawn, WAV peak ${opening} in the opening and ${afterHandOff} after the hand-off`);
