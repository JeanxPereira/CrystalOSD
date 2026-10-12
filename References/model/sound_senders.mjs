// Who queues which 0x6300 sound command in the HDD OSD 1.10U menus, from the state words the senders read.
//
// Every sender is read from the disassembly (the HDD OSD disassembly (CRYSTALOSD_ASM)) and checked against the enqueue
// (sound_handler_queue_cmd 0x00200C00) by verify_sound_menu_senders.mjs. A sender function takes the words it reads
// and returns the commands it queues, in queue order: { a2, ra, a3 }. a0 is 0x6300 and a1 is 1 at every site.
// ra is the return address the enqueue sees (jal pc + 8; a tail j keeps the ra of the caller of the site).
// a3 is never loaded at the send sites: 'free' = whatever the register held (recorded, not predicted); 'ring' = the second
// call of a pair keeps the address temporary of the first, 0x1F0658 + 8 * (head & 127) of that call (low 16 bits);
// 'row' = the Version page moves, a3 set earlier in func_0022A7A8 from the selected row (rowTemporary).
//
// Show second: func_00230CE8 is called by jal 0x00230DD4 from func_00230D58, so its tail j keeps ra 0x00230DDC.
// Frame order, module_clock_232458 0x00232458: 230C00, 230DF0 (Square show), 229828, 22A990 (Version page),
// 231E48 (System Configuration dispatcher 0x00231C50), 232408 (main menu, menupos 0x002322E0); the entry frame
// callbacks are called from the list drawing.
export const CMD = 0x6300;
export const PAD = { Up: 0x1000, Down: 0x4000, Left: 0x8000, Right: 0x2000, Cross: 0x20, Circle: 0x40, Triangle: 0x10, Square: 0x80 };
const has = (word, bit) => (word & bit) === bit;
const send = (a2, ra, a3 = 'free') => ({ a2, ra, a3 });

// func_00234A98(ramp, n): the ramp's state word (+0xC) equals n.
export const rampIs = (state, n) => state === n;

// menupos_p3_p8_tgt 0x002322E0. s: edge, selected, count, rampState (D_002B2E78 +0xC), gate (func_00232020 return,
// undefined when not called), flag (D_002B2174), mode (D_00370AB4),
// submit (callback_queue_submit return in func_0022A298, undefined when not called). func_00232020 returns 0 unless
// D_002B2E04 (System Configuration) and D_002B3000 (Version page) are in state 0 (the verifier checks that), so StartSysConfig's
// own state 0 test and func_0022A298's are implied by the gate.
export function mainMenu(s) {
  if (!rampIs(s.rampState, 2)) return [];
  if (!s.gate) return [];
  if (s.flag !== 0) return [];
  if (has(s.edge, PAD.Up)) return s.selected - 1 >= 0 ? [send(6, 0x00232388)] : [];
  if (has(s.edge, PAD.Down)) return s.selected + 1 < s.count ? [send(6, 0x00232388)] : [];
  if (has(s.edge, PAD.Cross)) {
    if (s.selected === 0 && s.mode === 0) return [send(4, 0x002323bc)];
    if (s.selected === 1) return [send(4, 0x002323dc)];
    return [];
  }
  if (has(s.edge, PAD.Triangle)) return s.submit ? [send(4, 0x002323f4)] : [];
  return [];
}

// func_00230D58 0x00230D58 (Square show, after the menu ramp tick). s: edge, menuState (D_002B5780 +0xC).
export function squareShow(s) {
  if (!rampIs(s.menuState, 2) || !has(s.edge, PAD.Square)) return [];
  return [send(0, 0x00230d30), send(1, 0x00230ddc, 'ring')];
}

// module_clock_231E48 -> func_00231C50 0x00231C50 -> func_002316B8 (list) or func_00231B38 (inside an entry).
// s: edge, listState (D_002B2E04 +0xC), menuState (D_002B5780 +0xC), level (D_002B2E00).
export function sysConfig(s) {
  if (!rampIs(s.listState, 2) || !rampIs(s.menuState, 0)) return [];
  if (s.level === 0) {
    if (has(s.edge, PAD.Up)) return [send(5, 0x00232490)];
    if (has(s.edge, PAD.Down)) return [send(5, 0x00232490)];
    if (has(s.edge, PAD.Cross)) return [send(4, 0x00232490)];
    if (has(s.edge, PAD.Square)) return [send(2, 0x00230cc0), send(3, 0x00232490, 'ring')];
    if (has(s.edge, PAD.Circle)) return [send(0xa, 0x00232490)];
    return [];
  }
  if (s.level === 1) {
    if (has(s.edge, PAD.Cross)) return [send(4, 0x00231bdc)];
    if (has(s.edge, PAD.Circle)) return [send(0xa, 0x00231c38)];
  }
  return [];
}

// func_0022A7A8 0x0022A7A8 (Version page). s: edge, state (D_002B3000 +0xC), early (func_0022A1D8() < func_00228F40()),
// rowFree (func_00234A98(D_003701C0 + 0x1C, 0)), selected, count, subRows (the sub-row count of the selected row, read at
// 0x0022A940; undefined when not read). Triangle on a row with sub-rows enters it (func_00228F68, tail j from func_0022A7A8).
export function versionPage(s) {
  if (!rampIs(s.state, 2) || s.early || !s.rowFree) return [];
  if (has(s.edge, PAD.Up)) return s.selected - 1 >= 0 ? [send(6, 0x0022a8a4, 'row')] : [];
  if (has(s.edge, PAD.Down)) return s.selected + 1 < s.count ? [send(6, 0x0022a8fc, 'row')] : [];
  if (has(s.edge, PAD.Triangle)) return s.subRows ? [send(4, 0x00232488)] : [];
  if (has(s.edge, PAD.Circle)) return [send(0xa, 0x00232488)];
  return [];
}

// func_00229520 0x00229520 (the sub-page of a Version row, called every frame while it is open). s: edge, listTwo (func_00234A98(row + 0x1C, 2),
// the return at 0x002295A0), backTwo (the same call in func_00228FD8, the return at 0x00228FF0), selected (row +0x10), count (row +8).
// Up and Down store the index and queue (1, 6) when the new index is in range; Circle is a tail j to func_00228FD8, which queues (1, 0xA)
// from its own tail j, so the ra is the caller's. Cross runs the sub-row's callback and queues (1, 4) with the caller's ra; the callback is
// not probed, so a Cross edge is reported as unmodelled.
export function versionSubPage(s) {
  if (!s.listTwo) return [];
  if (has(s.edge, PAD.Up)) return s.selected - 1 >= 0 ? [send(6, 0x002295dc)] : [];
  if (has(s.edge, PAD.Down)) return s.selected + 1 < s.count ? [send(6, 0x00229634)] : [];
  if (has(s.edge, PAD.Cross)) return [{ unmodelled: 'sub-row callback' }];
  if (has(s.edge, PAD.Circle)) return s.backTwo ? [send(0xa, 0x00232480)] : [];
  return [];
}

// func_00227940 0x00227940 (Clock Adjustment, entry callback). s: edge, repeat (D_0037033C).
export function clockAdjustment(s) {
  const out = [];
  if (has(s.edge, PAD.Left)) out.push(send(6, 0x00227994));
  if (has(s.edge, PAD.Right)) out.push(send(6, 0x002279c0));
  if (has(s.repeat, PAD.Up)) out.push(send(6, 0x00227a30));
  else if (has(s.repeat, PAD.Down)) out.push(send(6, 0x00227b14));
  return out;
}

// D_00228660 0x00228660 (entries with 2 or 3 values, entry callback). s: edge, menuState (D_002B5780 +0xC).
export function valueList(s) {
  if (!rampIs(s.menuState, 0)) return [];
  const out = [];
  if (has(s.edge, PAD.Left)) out.push(send(6, 0x002286c4));
  if (has(s.edge, PAD.Right)) out.push(send(6, 0x002286fc));
  return out;
}

// Version page moves: a3 = 0x57 or 1, set at 0x0022A7FC / 0x0022A820 (movz a3, t0, v0) from the sub-row count of the selected
// row at entry (0x0022A818); the callees (func_002266E0, func_002266D0, func_00234A98) do not write a3.
export const rowTemporary = (subRows) => (subRows !== 0 ? 0x57 : 1);

// The address temporary the enqueue leaves in a3 for the next call: 0x1F0658 + 8 * (head & 127), low 16 bits.
export const ringTemporary = (headBeforeCall) => (0x0658 + 8 * (headBeforeCall & 127)) & 0xffff;

// ---- Clock thread start, clock set-up and disc state (HDD OSD 1.10U) ----
// Commands here carry all four arguments: { a0, a1, a2, a3, ra }. a2 and a3 are literals, or 'ring' for the second call of the
// set-up pair, which keeps the address temporaries the first call left (a2 = 0x1F065C + 8s, a3 = 0x1F0658 + 8s, s = head & 127).
const command = (a0, a1, a2, a3, ra) => ({ a0, a1, a2, a3, ra });
export const ringTemporaryA2 = (headBeforeCall) => (0x065c + 8 * (headBeforeCall & 127)) & 0xffff;

// module_clock_thread_proc 0x00225D30: jal 0x00225D50 once per thread creation, after the first SleepThread.
export const clockStart = () => [command(0x6150, 1, 0, 0, 0x00225d58)];

// func_002324C8 0x002324C8 (from module_clock_init_resources, jal 0x00225E48, ra 0x00225E50): enter_clock_module_208378 returns
// (word 0x002AD22C == 0); the sounds are queued when it returns 0, i.e. the word is nonzero. The second is a tail j (ra of the caller).
export function clockSetup(s) {
  if (s.word === 0) return [];
  return [command(0x6150, 6, 0, 0xf, 0x00232620), command(0x6140, 2, 'ring', 'ring', 0x00225e50)];
}

// clock_input_check_handler_p6_p7_tgt 0x002259B8, loop 0x00225A28 (once per frame). The jump tables at 0x00365500 (compare) and
// 0x00365530 (sound) are read from memory: a compare target is 0x00225A78 (the 0x72 test), 0x00225A88 (the generic change);
// a state outside 0x6A..0x74 has no entry (the default path, flag cleared); a sound target is the block that queues 0xE (0x00225B34), 0xF (0x00225B50) or 0 (0x00225B6C).
export const DISC = { first: 0x6a, count: 0xb, soundCount: 0xa, noSound: 0x270f, illegal: 0x74 };
const COMPARE_TARGET = { 0x00225a78: 'disc72', 0x00225a88: 'change' };
const SOUND_BLOCK = { 0x00225b34: [0xe, 0x00225b48], 0x00225b50: [0xf, 0x00225b64], 0x00225b6c: [0, 0x00225b80] };

export function discSound(last, soundTable) {
  const index = (last - DISC.first) >>> 0;
  const target = index < DISC.soundCount ? soundTable[index] : 0x00225b6c;
  const block = SOUND_BLOCK[target];
  if (!block) throw new Error(`sound target 0x${target.toString(16)} not modelled`);
  return command(0x6150, 2, 0, block[0], block[1]);
}

// One loop iteration. s: disc (word 0x1F000C), last (D_00370A7C), flag (D_002B2174), d58 (word 0x1F0D58), compareTable, soundTable,
// mode (D_00370AB4, the return of func_00234B80), and the returns of the calls the iteration makes: fef8 (func_0022FEF8, called
// when flag != 0), ff28 (func_0022FF28), fef8b (func_0022FEF8 after ff28 != 0), ff98 (func_0022FF98).
// Returns { soundBranch, sounds, mode3, last, flag, calls } where calls lists the callees the iteration must have made.
export function discLoop(s) {
  const calls = [];
  let { last, flag } = s;
  if (flag !== 0) {
    calls.push('fef8');
    if (s.fef8 === 0) {
      if (s.mode !== 0) return { soundBranch: true, sounds: [], mode3: false, last, flag, calls };
      return { soundBranch: true, sounds: [discSound(last, s.soundTable)], mode3: true, last, flag, calls };
    }
  }
  if (last !== s.disc) {
    const index = (s.disc - DISC.first) >>> 0;
    const target = index < DISC.count ? COMPARE_TARGET[s.compareTable[index]] : 'other';
    if (!target) throw new Error(`compare target 0x${s.compareTable[index].toString(16)} not modelled`);
    if (target === 'other') { last = s.disc; flag = 0; }
    else if (target === 'disc72' && !(s.d58 > 0)) { /* no update */ }
    else {
      calls.push('ff28');
      if (s.ff28 === 0) flag = 1;
      else { calls.push('fef8b'); if (s.fef8b !== 0) flag = 1; }
      last = s.disc;
    }
  }
  calls.push('ff98');
  if (s.ff98 !== 0) { if (last !== DISC.illegal) last = DISC.noSound; flag = 1; }
  return { soundBranch: false, sounds: [], mode3: false, last, flag, calls };
}

// ---- Opening (HDD OSD 1.10U): thread start and stage 2 of OpeningProcessInner ----
// Arguments are { a0, a1, a2, a3, ra } as in the clock section. a2 / a3 may be 'ring' (the address temporaries the enqueue left in the
// registers after the call before), 'entry' (the register the function was entered with: neither opening_thread_set_vars_2 path
// writes a2 or a3 before its tail j) or 'carried' (the register at the entry of the stage-2 handler 0x0021F0F8: its callees
// is_pal_vmode_p9_tgt, enter_clock_module_208378, is_hdd_boot_ready and get_hddboot_exec_2083B8 write neither; handle_get_vidmode
// returns at 0x0020824C once var_curvidmode is set). What the register held at the entry is left to earlier code: recorded, not predicted.

// opening_thread_set_vars_2 0x0021AE78, called by jal 0x0021ABF0 (ra 0x0021ABF8) from module_opening_thread_proc, before OpeningInit.
// module = word 0x001F0648: 4 = BootIllegal / BootWarning, 1 = BootOpening, any other value queues nothing.
export function openingStart(module) {
  if (module === 4) return [command(0x6150, 2, 0, 0, 0x0021aeb0), command(0x6140, 6, 'ring', 'ring', 0x0021abf8)];
  if (module === 1) return [command(0x6140, 0, 'entry', 'entry', 0x0021abf8)];
  return [];
}

// OpeningProcessInner stage 2, handler 0x0021F0F8. s: counter (D_00370000 at the entry of the call), pending (D_00370090), go (D_00370094),
// fps (60, 50 in PAL), forcedWord (word 0x002AD22C: enter_clock_module_208378 returns word == 0), ready, exec (0x002AD230, 0x002AD234),
// disc (word 0x001F000C), discTable (jtbl_00365470, 10 words). The commands go out once, in the call that finds pending == 1 and go set.
// A 6140 carries a2 = low 16 bits of D_003DB800 (addiu a2,s1,%lo at 0x0021EF44, not reloaded) and a3 'carried'.
const STAGE2_SITE = { forced: 0x0021f158, before: 0x0021f1bc, after: 0x0021f1d0, ready: 0x0021f1ec, other: 0x0021f200 };
const carried = (a1, ra) => command(0x6140, a1, 0xb800, 'carried', ra);
export function openingStage2(s) {
  const go = s.go !== 0 || s.fps * 10 < s.counter;
  if (!go || s.pending !== 1) return { sounds: [], branch: go ? 'sent already' : 'waiting for go' };
  if (s.forcedWord === 0) return { sounds: [carried(1, STAGE2_SITE.forced)], branch: 'clock forced' };
  if (s.ready !== 0 && s.exec === 1) return { sounds: [command(0x6150, 0, 0, 0xf, STAGE2_SITE.ready)], branch: 'hard-disk ready, exec 1' };
  const index = (s.disc - 0x6a) >>> 0;
  const target = index < 10 ? s.discTable[index] : 0x0021f1f4;
  if (target === 0x0021f1b0) return { sounds: [carried(7, STAGE2_SITE.before), command(0x6150, 0, 0, 0x11, STAGE2_SITE.after)], branch: 'disc 6C..6E' };
  if (target === 0x0021f1d8) return { sounds: [command(0x6150, 0, 0, 0xf, STAGE2_SITE.ready)], branch: 'disc 6A, 6B, 72, 73' };
  if (target === 0x0021f1f4) return { sounds: [carried(1, STAGE2_SITE.other)], branch: 'default' };
  throw new Error(`stage 2 table target 0x${target.toString(16)} not modelled`);
}
