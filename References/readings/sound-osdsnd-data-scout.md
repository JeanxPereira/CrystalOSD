# Sound: how OSDSND reads HD / BD / SQ, and SNDCLOKS (scout reading, 2026-10-03)

Reading, not fact. HDD OSD 1.10U's OSDSND; addresses are module-relative (vaddr = IRX file offset − 0xA0). Tools and
outputs in `lab/scout/` (`hd.mjs`, `sq.mjs`, `fx.mjs`, `adpcm.mjs`, `m_*.bin`, `ev_SNDCLOKS.json`).

## Handlers and state
6060 open bank 0x63B8 · 6090 load sequence 0x66B8 · 6150 sequence state 0x7298 · 6300 effect 0x7AD8 · 6310 effect
volume 0x80B8 · 6130 sequence volume 0x6EF0 · 6010 reset 0x5EF8 · 60A0 tick rate 0x6D1C · tick 0x2470 (thread
0x2224, woken by an HLINE hard timer at 0x2274; compare 0x100 INFERRED → ≈61.5 Hz NTSC). Note-on 0x2A04, note-off
0x3F50, pitch 0x4304, voice alloc 0x3D34, program change 0x4A94, CC7 0x4F10, loops CC99 0x5604.
Globals: bank table 0x98D0 (128 × 12), voices 0x9330 (24 × 0x3C), sequence slots 0x9ED0 (24 × 0x44), ctx 0xA530.
Find the IOP base by scanning IOP RAM for "SDR driver version 2.0.0" (vaddr 0x86FC).

## HD (READ)
- 12-byte prefix (unread by OSDSND), "SShd" at +0xC. BOOT: program table P at +0x80 (via +0x10), velocity table
  V at +0x448. OSDD: +0x10 = −1 (no sequences), effect table E at +0x80 (via +0x2C).
- Programs: P[0] = highest program; offset of program p at P+2+2p (0xFFFF absent); tones at program+8. Header
  byte 0 = tone count / layering mode (0xFF = key map).
- Tone (16 bytes): key low/high, root key, fine tune, sample start (u16, 8-byte units, + bank SPU base), ADSR1,
  ADSR2, pan (0x40 centre), bend range, flags (bit7 reverb, bit5 LFO).
- Effects: record N = E + 0x20 + 64N (N ≤ 13): L/R volume × E[0] >> 7 (E[0] = 0x1C after 6310), pitch =
  44100·u16/48000, ADSR1/2, reverb bit, BD byte offset. Effects use core 0; sequence voices core 1.

## BD (READ by decoding)
PS-ADPCM, 16-byte frames; 0 bad frames in BOOTB (22257) and OSDDB (3400). BOOT BD at SPU 0x5010, OSDD at 0x85010.

## SQ (READ)
- "SSsq" at +0xC; +0 volume (6130 overrides), +2 resolution, +4 tempo; channel records at +0x10 (16 × 16:
  program, volume, pan); events from +0x110.
- MIDI-like: VLQ deltas (<<12), running status, 0x80/0x90/0xB0/0xC0/0xE0, FF 2F end (restart), FF 51 tempo.
  Step per tick = ((res·tempo) << 12) / ctx.tickHz(60) / 60. Loops: CC99 20 = start, CC99 30 = end, CC6 = count
  (127 infinite).
- 6150 does not play: it rewinds / stops (modes 0/1) or pauses/resumes (2/3, INFERRED).

## SNDCLOKS (decoded)
Bank BOOT. Volume 45 (6130 0x2D), 480 ppqn, 120 BPM. Seven channels: programs 60, 70, 42, 40, 50, 51, 52.
278 events, 126 notes. Loop start at tick 18240, end at 288000 (infinite): ~300 s, ~281 s looped at 960 ticks/s
(the real rate depends on the timer).

## Effects (READ, direct index)
N 0/1: stereo pair, BD 0x3C60 · N 2: BD 0x9D0 · N 3: BD 0x9D0, no reverb · N 4: BD 0x81D0 (confirm) ·
N 5: BD 0xA890 · N 6: BD 0x7DC0 (move) · N 0xA: BD 0x81D0 at lower pitch (cancel).

## Open
Timer compare value and the tick rate per video mode; CC1/CC2/CC10/pitch-bend handlers; the KON helper; the EE call
that starts CLOKS; ROM 2.30's libsnd reading of the same data.
