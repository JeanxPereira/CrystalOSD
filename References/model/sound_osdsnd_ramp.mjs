import { setParam, getEffectAttr, setEffectAttr } from './sound_libsd.mjs';

export const RAMP_FIELDS = { 0x60d0: ['core', 'depthL', 'depthR'], 0x6120: ['core', 'left', 'right'] };

const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xffff;

export function rampWrites(state, command) {
  const first = state.regs.log.length;
  const events = [];
  const [core, a, b] = command.words;
  if (command.id === 0x6120) {
    setParam(state.regs, s16(core), null, 'MVOLL', u16(a));
    setParam(state.regs, s16(core), null, 'MVOLR', u16(b));
  } else if (command.id === 0x60d0) {
    const c = s16(core);
    const attr = getEffectAttr(state.lib, state.regs, c);
    attr.depthL = u16(a);
    attr.depthR = u16(b);
    attr.mode |= 0x100;
    const result = setEffectAttr(state.lib, state.regs, c, attr);
    events.push(...result.events);
  }
  return { writes: state.regs.log.slice(first), events };
}
