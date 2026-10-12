import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [app, lab, resources, scratch, soak = '20'] = process.argv.slice(2);
if (!app || !lab || !resources || !scratch) { console.error('usage: node check_app.mjs <CrystalClock.exe> <SoundLab.exe> <resources> <scratch dir> [seconds]'); process.exit(2); }
if (!fs.existsSync(app) || !fs.existsSync(path.join(resources, 'hddosd.elf'))) { console.log(`SKIPPED: no ${app} or no resources in ${resources}`); process.exit(77); }
fs.mkdirSync(scratch, { recursive: true });
const wav = path.join(scratch, 'app.wav');
const replay = path.join(scratch, 'replay.wav');
const env = { ...process.env, SDL_AUDIODRIVER: 'dummy' };
const run = spawnSync(app, ['--soak', soak, '--mute', '--audio-wav', wav, '--resources', resources], { encoding: 'utf8', env, maxBuffer: 1 << 26 });
const text = run.stdout + run.stderr;
if (/^usage:/m.test(text) && !text.includes('--audio-wav')) { console.log(`SKIPPED: ${app} predates the audio flags`); process.exit(77); }
const audio = text.match(/^audio: .*$/m)?.[0] ?? '';
console.log(audio);
const errors = Number(text.match(/(\d+) validation errors/)?.[1] ?? NaN);
if (run.status !== 0 || errors !== 0 || !audio || /FAILED/.test(audio)) { console.log(`FAIL app run (status ${run.status}, validation errors ${errors})`); console.log(text.split('\n').slice(-8).join('\n')); process.exit(1); }
const peak = Number(audio.match(/peak (\d+)/)?.[1]);
const clipped = Number(audio.match(/(\d+) clipped/)?.[1]);
if (!(peak > 0) || clipped !== 0) { console.log(`FAIL wav: peak ${peak}, clipped ${clipped}`); process.exit(1); }
const rendered = spawnSync(lab, ['replay', resources, `${wav}.commands.txt`, replay], { encoding: 'utf8' });
if (rendered.status !== 0) { console.log(`FAIL replay: ${rendered.stdout}${rendered.stderr}`); process.exit(1); }
const cmp = spawnSync(lab, ['compare', wav, replay], { encoding: 'utf8' }).stdout;
const differ = Number(cmp.match(/^differ (\d+)/m)?.[1]);
const samples = cmp.match(/^samples (\d+) and (\d+)/m);
if (differ !== 0 || samples[1] !== samples[2]) { console.log(`FAIL: the app WAV and the SoundLab replay differ (${differ}; ${samples?.[0]})`); process.exit(1); }
console.log(`PASS: app WAV equals the SoundLab replay of its command log (${samples[1]} samples, peak ${peak})`);
