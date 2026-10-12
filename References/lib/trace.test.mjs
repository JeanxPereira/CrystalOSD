// node --test References/lib/
// A capture kept as .trace.jsonl.gz reads like the plain one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readTrace, traceExists } from './trace.mjs';

const records = [
  { type: 'header', version: 1, frame: 7 },
  { type: 'origin', id: 1, channel: 'gif', frame: 7, pc: '0x00201000', ra: '0x00202000', sp: '0x01fff000', stack: [] },
  { type: 'data', path: 3, kind: 'dma', origin: 1, space: 'ee', address: 0x400000, size: 16 },
  { type: 'vsync', frame: 8 },
  { type: 'packet', path: 3, size: 16, pending: 0, hex: '00112233445566778899aabbccddeeff' },
  { type: 'end', packets: 1 },
];

test('a gzip-only trace parses identically to the plain one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-gz-test-'));
  try {
    const file = path.join(dir, 'a.trace.jsonl');
    fs.writeFileSync(file, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
    const plain = readTrace(file);
    assert.equal(plain.complete, true);
    assert.equal(plain.packets.length, 1);
    fs.writeFileSync(`${file}.gz`, zlib.gzipSync(fs.readFileSync(file)));
    fs.rmSync(file);
    assert.equal(traceExists(file), true);
    assert.deepEqual(readTrace(file), plain);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing trace is still reported as unreadable', () => {
  const file = path.join(os.tmpdir(), 'no-such-capture.trace.jsonl');
  assert.equal(traceExists(file), false);
  assert.equal(readTrace(file).complete, false);
});
