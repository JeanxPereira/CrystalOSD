export const RING_ENTRIES = 128;
export const RAMP_STEPS = 15;

export const makeRing = () => ({ head: 0, tail: 0, slots: Array.from({ length: RING_ENTRIES }, () => [0, 0, 0, 0]) });

export function enqueue(ring, cmd, a1, a2, a3) {
  if (ring.head - ring.tail >= RING_ENTRIES) return false;
  ring.slots[ring.head & (RING_ENTRIES - 1)] = [cmd & 0xffff, a1 & 0xffff, a2 & 0xffff, a3 & 0xffff];
  ring.head += 1;
  return true;
}

export function drain(ring, dedupCmd = 0x6300) {
  const sends = [];
  const head = ring.head;
  let lastCommandSeen = false;
  let previous = 0;
  for (let at = ring.tail; at < head; at++) {
    const slot = ring.slots[at & (RING_ENTRIES - 1)];
    const [cmd, a1, a2, a3] = slot;
    if (cmd === 0) continue;
    let send = true;
    if (dedupCmd !== null && cmd === dedupCmd && lastCommandSeen && previous === a2) send = false;
    else previous = a2;
    lastCommandSeen = true;
    if (send) sends.push([1, cmd, a1, a2, a3]);
    ring.slots[at & (RING_ENTRIES - 1)] = [0, 0, 0, 0];
  }
  ring.tail = head;
  return sends;
}

export const rampStep = (counter, steps = RAMP_STEPS, cmd = 0x60d0) => {
  const v = Math.trunc(Math.trunc((0x9ffec * counter) / 0x7f) / steps);
  return { cmd, args: [1, v, v] };
};
