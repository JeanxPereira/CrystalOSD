import { readTraceFor } from '../lib/trace.mjs';
process.env.CLOCK_BUILD ??= 'hdd';
const { PROBES } = await import('./verify_text2.mjs');
const t = readTraceFor(process.argv[2], PROBES);
const seen = new Set();
for (const p of t.probes) for (const m of p.mem) if (m.address === 0x371818 && m.bytes) seen.add(m.bytes.readUInt32LE(0).toString(16));
console.log([...seen].join(' '));
