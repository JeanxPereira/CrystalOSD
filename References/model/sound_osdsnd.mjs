import { makeMemory } from './sound_snapshot.mjs';
import { makeLibsd, makeRegisters, regAddress, write } from './sound_libsd.mjs';
import { makeSequencer } from './sound_osdsnd_sequencer.mjs';
import { effectWrites } from './sound_osdsnd_effects.mjs';
import { initWrites } from './sound_osdsnd_init.mjs';

export function seedRegisters(regs, spustate) {
  const hex = (v) => Number.parseInt(v, 16);
  for (const core of spustate.cores) {
    const c = core.index;
    for (const [name, key] of [['VMIXL', 'vmixl'], ['VMIXR', 'vmixr'], ['VMIXEL', 'vmixel'], ['VMIXER', 'vmixer']]) {
      write(regs, regAddress(c, null, `${name}0`), hex(core.regs[key]) & 0xffff);
      write(regs, regAddress(c, null, `${name}1`), (hex(core.regs[key]) >>> 16) & 0xffff);
    }
    write(regs, regAddress(c, null, 'MMIX'), hex(core.regs.mmix));
    write(regs, regAddress(c, null, 'ATTR'), hex(core.regs.attr));
    write(regs, regAddress(c, null, 'MVOLL'), hex(core.masterVol.left.reg));
    write(regs, regAddress(c, null, 'MVOLR'), hex(core.masterVol.right.reg));
    write(regs, regAddress(c, null, 'EVOLL'), core.fxVol[0] & 0xffff);
    write(regs, regAddress(c, null, 'EVOLR'), core.fxVol[1] & 0xffff);
    write(regs, regAddress(c, null, 'EEA'), (hex(core.effectsEndA) >>> 16) & 0xffff);
    core.voices.forEach((v, i) => {
      write(regs, regAddress(c, i, 'VOLL'), hex(v.volume.left.reg));
      write(regs, regAddress(c, i, 'VOLR'), hex(v.volume.right.reg));
      write(regs, regAddress(c, i, 'PITCH'), hex(v.pitch));
      write(regs, regAddress(c, i, 'ADSR1'), hex(v.adsr.reg1));
      write(regs, regAddress(c, i, 'ADSR2'), hex(v.adsr.reg2));
    });
  }
  regs.log.length = 0;
}

export function makeModel(snapshot, libsdImage, feeds, warm = false) {
  const state = { mem: makeMemory(snapshot), regs: makeRegisters(), lib: makeLibsd(Buffer.from(libsdImage)) };
  if (warm) seedRegisters(state.regs, snapshot.spustate);
  else for (const core of [0, 1]) for (const at of [0x24, 0x2c, 0x30]) state.lib.write32(0x90000 + at + 20 * core, 0);
  const sequencer = makeSequencer(state, { envx: (core, voice) => feeds.tick(voice) });
  return { state, sequencer, feeds };
}

export function runScenario(model, events) {
  const out = [];
  const { state, sequencer, feeds } = model;
  for (const event of events) {
    if (event.kind === 'tick') {
      for (const w of sequencer.tick()) out.push({ source: 'tick', cycle: event.cycle, address: w.address, value: w.value });
    } else {
      const { command } = event;
      const result = command.id === 0x6300 ? effectWrites(state, command, (core, voice) => feeds.allocation(voice)) : initWrites(state, command);
      for (const w of result.writes) out.push({ source: 'rpc', id: command.id, cycle: event.cycle, address: w.address, value: w.value });
    }
  }
  return out;
}
