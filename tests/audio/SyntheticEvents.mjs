export const syntheticEvents = () => {
  const events = [];
  const rpc = (id, ...words) => events.push({ kind: 'rpc', cycle: events.length, command: { id, words: [...words, 0, 0, 0, 0, 0].slice(0, 5) } });
  const ticks = (n) => { for (let k = 0; k < n; k++) events.push({ kind: 'tick', cycle: events.length }); };
  for (const core of [0, 1]) { rpc(0x6120, core, 0x1234 + core, 0x5678); rpc(0x60d0, core, 0x1111, 0x2222 + core); }
  [0, 1, 2, 3, 4, 5, 6, 3, 0, 10, 4].forEach((mode, k) => rpc(0x60c0, k & 1, mode));
  ticks(20);
  rpc(0x60a0, 0x7d);
  for (const entry of [0x0, 0x1, 0x2, 0x41, 0x80, 0x81, 0x1c0]) rpc(0x8010, entry, 0x1234);
  for (let entry = 0; entry < 0x10; entry++) rpc(0x8070, entry, entry === 0xa || entry === 0xb ? 0 : 1);
  rpc(0x8070, 8, 0x3f);
  rpc(0x8070, 9, 0x15);
  for (const slot of [0, 1, 2, 0x20]) rpc(0x6130, slot, 0x20);
  for (const slot of [0, 1, 2, 3]) {
    rpc(0x6140, slot);
    ticks(4);
    for (const [mode, release] of [[0, 0], [1, 0], [2, 0x15], [3, 0], [2, 0], [4, 0], [3, 7]]) { rpc(0x6150, slot, mode, release); ticks(3); }
  }
  for (const effect of [0, 1, 2, 3, 4, 5, 6, 7, 8, 0x7fff]) { rpc(0x6300, 1, effect); ticks(2); }
  rpc(0x6310, 1, 100);
  rpc(0x6010);
  ticks(5);
  return events;
};

export const syntheticFeeds = (events) => {
  const levels = [0x7fff, 2, 3, 0, 0x8002, 0x8003, 10, 1, 4];
  const tickGroups = [];
  const allocationReads = Array.from({ length: 24 }, () => []);
  let tickNumber = 0;
  for (const e of events) {
    if (e.kind === 'tick') { tickGroups.push(Array.from({ length: 24 }, (_, v) => levels[(tickNumber + v) % levels.length])); tickNumber += 1; }
    else if (e.command.id === 0x6300) allocationReads.forEach((list, v) => list.push(levels[(list.length * 5 + v) % levels.length]));
  }
  return { tickGroups, allocationReads };
};
