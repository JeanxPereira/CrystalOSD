export const MULT_EXTRA = 7;
export const VBLANK_CYCLES = 8431;
export const CYCLES_PER_SAMPLE = 768;
export const MEMSET_ENTRY = 0x98754;
export const MEMSET_TICK_LENGTH = 0x3c;
export const MEMSET_TICK_CYCLES = 67;
export const WAIT_EVENT_FLAG = 0xe090;
export const DMA_RESUME_CYCLES = 793;
export const INIT_STUB_WINDOWS = new Map([[5, 2159], [10, 540], [16, 371], [22, 409]]);

export function stubCost(call, event, ordinal) {
  if (call.target === MEMSET_ENTRY && call.args[2] === MEMSET_TICK_LENGTH) return MEMSET_TICK_CYCLES;
  if (event.kind === 'rpc' && event.id === 0x6010) return INIT_STUB_WINDOWS.get(ordinal) ?? 0;
  return 0;
}

export function eventsOf(g) {
  const byEvent = new Map();
  g.predicted.forEach((p, i) => {
    const list = byEvent.get(p.event.index) ?? [];
    list.push(i);
    byEvent.set(p.event.index, list);
  });
  return byEvent;
}

export function modelOffsets(g, withDma = true) {
  const offsets = new Array(g.predicted.length).fill(0);
  resumes.set(offsets, new Array(g.predicted.length).fill(0));
  for (const [, indices] of eventsOf(g)) {
    const event = g.predicted[indices[0]].event;
    const done = withDma ? event.dmaDone ?? [] : [];
    let stubs = 0;
    let from = 0;
    let wait = 0;
    let resume = 0;
    for (const i of indices) {
      for (const [ordinal, call] of (event.calls ?? []).entries()) {
        if (call.at < from || call.at > i) continue;
        if (call.target === WAIT_EVENT_FLAG && wait < done.length) {
          const now = call.insn + MULT_EXTRA * call.mult + stubs;
          const target = done[wait++] + DMA_RESUME_CYCLES;
          if (target > now) stubs += target - now;
          resume = Math.max(target, now);
        } else stubs += stubCost(call, event, ordinal);
      }
      from = i + 1;
      offsets[i] = g.predicted[i].seen.insn + MULT_EXTRA * g.predicted[i].seen.mult + stubs;
      resumes.get(offsets)[i] = resume;
    }
  }
  return offsets;
}

const resumes = new WeakMap();

export function withVblank(entry, offsets, frames, resumeOf = []) {
  const used = new Set();
  let shift = 0;
  let segment = 0;
  return offsets.map((offset, k) => {
    const resume = resumeOf[k] ?? 0;
    if (resume !== segment) {
      segment = resume;
      shift = 0;
      for (const f of frames) if (f >= entry && f - entry <= segment) used.add(f);
    }
    let t = offset + shift;
    for (const f of frames) {
      if (f >= entry && f - entry <= t && !used.has(f)) { used.add(f); shift += VBLANK_CYCLES; t += VBLANK_CYCLES; }
    }
    return t;
  });
}

export function classify(g) {
  const frames = g.trace.frames.map((f) => f.cycle);
  const offsets = modelOffsets(g);
  const resumeAt = resumes.get(offsets);
  const rows = [];
  for (const [index, indices] of eventsOf(g)) {
    const event = g.predicted[indices[0]].event;
    const label = event.kind === 'tick' ? 'tick' : `rpc${event.id.toString(16)}`;
    const times = withVblank(event.cycle, indices.map((i) => offsets[i]), frames, indices.map((i) => resumeAt[i]));
    const errors = indices.map((i, k) => g.observed[i].cycle - event.cycle - times[k]);
    const distinct = [...new Set(errors.filter((e) => e !== 0))];
    indices.forEach((i, k) => {
      const withVbl = times[k] - offsets[i];
      let status = 'exact';
      if (errors[k] !== 0) {
        if (event.kind === 'rpc' && (event.id === 0x60c0 || event.id === 0x60d0) && Math.abs(errors[k]) > 100000) status = 'ramp-sleep';
        else if (distinct.length === 1) status = 'interrupt-lump';
        else status = 'unexplained';
      } else if (withVbl !== 0) status = 'exact-vblank';
      rows.push({ index: i, event: index, label, status, error: errors[k], offset: offsets[i] });
    });
  }
  return rows;
}

export function summary(rows) {
  const out = new Map();
  for (const r of rows) {
    const e = out.get(r.label) ?? new Map();
    e.set(r.status, (e.get(r.status) ?? 0) + 1);
    out.set(r.label, e);
  }
  return out;
}
