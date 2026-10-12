// Reading Watson captures: the trace reader, GIF decoding, and the probes of one verifier.
//
// WATSON_DIST points at another Watson server build (a worktree); by default the main checkout's.
// A capture kept as `<name>.trace.jsonl.gz` reads like the plain file: the lib unpacks it beside the
// build's own reader, so a build without gzip support reads it too.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const DIST = (process.env.WATSON_DIST ?? 'D:/CodingProjects/Watson/Server/dist').replace(/\\/g, '/').replace(/\/$/, '');
const gsTrace = await import(`file:///${DIST.replace(/^\//, '')}/gs/trace.js`);
const readPlainTrace = gsTrace.readTrace;
const { GifPath } = await import(`file:///${DIST.replace(/^\//, '')}/gs/gif.js`);
export { GifPath };

/** Whether a trace is on disk, plain or gzipped. */
export const traceExists = (file) => fs.existsSync(file) || fs.existsSync(`${file}.gz`);

/** `readTrace` of Watson's build, reading `<file>.gz` when only that exists. */
export function readTrace(file) {
  if (fs.existsSync(file) || !fs.existsSync(`${file}.gz`) || gsTrace.readTraceBytes) return readPlainTrace(file);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-gz-'));
  try {
    const plain = path.join(dir, path.basename(file));
    fs.writeFileSync(plain, zlib.gunzipSync(fs.readFileSync(`${file}.gz`)));
    return readPlainTrace(plain);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A trace, refusing an incomplete one. */
export function loadTrace(file) {
  const trace = readTrace(file);
  if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
  return trace;
}

/** The register writes of one packet, in order: [{ reg, value }] with value a BigInt. */
export const writesOf = (packet) => [...new GifPath().feed(packet.bytes)].filter((event) => event.kind === 'write');

const normalize = (pc) => parseInt(String(pc), 16) >>> 0;
const sameRanges = (a, b) => a.length === b.length && a.every((range, i) => range === b[i]);
/** A probe's frame window as the trace header writes it: `@from-until`, or '' for none. */
const windowOf = (probe) => (probe.fromFrame !== undefined || probe.untilFrame !== undefined ? `@${probe.fromFrame ?? ''}-${probe.untilFrame ?? ''}` : '');

/**
 * The probe records that belong to each of a verifier's PROBES, in file order: an array parallel
 * to `probes`. A capture may carry the probes of several verifiers, several at one program
 * counter: each record names its probe by index, and the trace's header lists the probes, so a
 * record is matched to the entry with the same program counter and the same ranges. An older
 * capture (no index) matches by program counter alone, as the verifiers always did.
 */
export function probesOf(trace, probes) {
  const wanted = probes.map((probe) => ({ pc: normalize(probe.pc), ranges: probe.ranges ?? [], window: windowOf(probe) }));
  if (!trace.probeSpec) return wanted.map((want) => trace.probes.filter((record) => record.pc === want.pc));
  const spec = trace.probeSpec.split(';').map((part) => {
    const [head, ranges] = part.split('=');
    const at = head.indexOf('@');
    return { pc: normalize(at < 0 ? head : head.slice(0, at)), ranges: ranges ? ranges.split(',') : [], window: at < 0 ? '' : head.slice(at) };
  });
  return wanted.map((want) => {
    const indices = new Set(spec.flatMap((entry, i) => (entry.pc === want.pc && entry.window === want.window && sameRanges(entry.ranges, want.ranges) ? [i] : [])));
    if (indices.size === 0) return [];
    // Two identical entries record the same thing twice: keep the first.
    const first = Math.min(...indices);
    return trace.probes.filter((record) => record.index === first);
  });
}

/**
 * The capture's probe records narrowed to a verifier's PROBES, as one list in file order, so a
 * verifier written for a capture of its own reads a shared one unchanged: `trace.probes = only(...)`.
 */
export function only(trace, probes) {
  const keep = new Set(probesOf(trace, probes).flat());
  return trace.probes.filter((record) => keep.has(record));
}

/**
 * readTrace for a verifier: on a capture shared by several verifiers (one whose header lists its
 * probes), `probes` holds only this verifier's records, so it reads the capture as if it were
 * its own. An older capture is returned as it is.
 */
export function readTraceFor(file, probes) {
  const trace = readTrace(file);
  if (trace.complete && trace.probeSpec && probes) trace.probes = only(trace, probes);
  return trace;
}

/** A verifier's PROBES merged with others' into one list for a single capture. */
export function mergeProbes(...lists) {
  const seen = new Set();
  const out = [];
  for (const probe of lists.flat()) {
    const key = `${normalize(probe.pc)}${windowOf(probe)}=${(probe.ranges ?? []).join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(probe);
  }
  return out;
}
