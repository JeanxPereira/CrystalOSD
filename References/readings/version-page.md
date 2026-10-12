# Version page (HDD OSD 1.10U): reading for the facts writer

This page holds what was read and what was measured. It is not a facts page. Measured on
2026-10-03, HDD OSD 1.10U NTSC only.

## Read (CrystalOSD/asm, HDD OSD 1.10U)

**Open.** `menupos_p3_p8_tgt` (0x002322E0) reads the pressed word `D_00370334` and checks the
buttons in this order: up 0x1000, down 0x4000, cross 0x20, triangle 0x10. Triangle calls
`func_0022A298`. It first passes the main menu's own gate: main menu ramp full (`D_002B2E78`
state 2), `func_00232020` "nothing in front", and `D_002B2174 == 0`. `func_0022A298` acts only
when the page ramp `D_002B3000` is hidden. It queues the job `D_0020AAD8` with
`callback_queue_submit` and stores the handle in `D_00370A84`. When the job is queued it shows
the ramp (`func_00234AC0`) and plays sound 0x6300/1/4.

**Ramp.** The ramp is `D_002B3000`, at +0x18 of the page record `D_002B2FE8`. The record holds
the title (+0), the rows (+4), the row count (+8), the number of rows shown (+0xC, from the
program's data; 6 in the capture), the selected row (+0x10) and the first row shown (+0x14).
`func_0022A9C0` writes the ramp's length from `D_003702D0` (the tail length, 10). The same
function writes it into the page-stack template `D_002B2F90+0x1C`. It copies that template 30
times into `D_00404370` (0x54 bytes each) and sets `D_003701C0 = D_00404370`.

**Every frame.** The pages function `module_clock_232458` calls `module_clock_229828`, then
`module_clock_22A990`, then System Configuration, then the main menu (`func_00232408` →
`menupos`).
- `module_clock_229828` ticks the front page's ramp (`*D_003701C0 + 0x1C`) and runs that page's
  own code (`func_00229028`, `func_00229080`, `func_002297D0`).
- `module_clock_22A990` runs four steps:
  1. The ramp ticks (`func_00234B10`).
  2. `func_0022A360`. When the ramp is rising at counter 1, it polls the job
     (`func_00212448(1, job, 0)`, a `PollSema`). If the job is not done, the counter goes back
     to 0, so the ramp waits. If it is done, `do_show_version_info` fills the rows from the
     job's list at `0x001F1298` (label, value, id: 12 bytes each, ended by a null label, at most
     0x20). Row k gets the label, the value, `func_002086A8(id,-1,0,0)` (the sub-row count) and
     the id. The selected row is the row with id 6, or row 0 when no row has id 6. The first
     row shown is `top < sel-shown+1 ? sel-shown+1 : min(top, sel)`, with top reset to 0 first.
     The title is language string 0x59. Rows that have sub-rows also get their sub-page built in
     the page stack. When the ramp has just become hidden (state 0, changed), `D_00370140 = 0`.
  3. `func_0022A410` draws the page. It runs when the ramp is not hidden and the front ramp is
     not full. It sets `D_00370140 = 1` and `D_0037013C = max(alpha, front alpha)`, then draws
     the title (centred on 404) and the rows (labels right-aligned on 391, values at 417) with
     alpha `func_0022A1D8`. That alpha is
     `trunc((ramp·128/len) · (128 − front·128/len) / 128)`, all in C integer division.
  4. `func_0022A7A8` handles the input. It returns when the ramp is hidden or when
     alpha < front alpha. Otherwise it writes the hints `func_002266E0(1, 0x55, 1, row has
     sub-rows ? 0x57 : 1)`. When `var_curvidmode > 0` (any region but Japan), the two slots swap
     and 0x55 and 0x56 are exchanged. It writes the arrows `D_002B2310` = 0x1000 when sel > 0,
     and 0x4000 when sel + 1 < count. Then, only when the ramp is full and the front ramp is
     hidden, it reads the pad:
     - up: sel − 1, clamped at 0; the first row shown drops by 1 when sel < top.
     - down: sel + 1, clamped at count − 1; the first row shown rises by 1 when
       sel ≥ top + shown.
     - **triangle**: on a row with sub-rows, `func_00228F68(sel)` sets
       `D_003701C0 = D_00404370 + sel·0x54` and shows that record's ramp. This is the front page,
       the row's detail page.
     - circle: `func_0022A308` hides the ramp, with sound 0x6300/1/0xA.
     - **Cross does nothing.** Watch the delay slot at 0x0022A8C8 (`andi v0, v1, 0x10`). A first
       reading took it for cross; the verifier refuted that.

**Effect on the clock.** Not read anywhere else: the page does not change the menu ramp, the
overlay mode, the rods or the orbs. Its ramp closes the main menu's gate (`func_00232020`), and
`func_00231E78` multiplies the main menu items' alpha by `(128 − page alpha)`, so the menu text
fades out under the page. While the page is shown, `func_002269E0` draws the button panel from
`D_00370140`, `D_0037013C`, `D_002B2300..` and `D_002B2310`. No panel and no background change
was found in this code: the draw environment calls `func_002341C8` and `func_00233E70(1,2)` set
up the text pass only. No cubes.

## Model and verifier

- `References/model/clock_version.mjs`: `frontTick` (229828's tick), `versionPage` (22A990),
  `triangle` (menupos's triangle with its gate), and `alphaOf` / `frontAlpha`. It works on a
  `Memory` view at HDD addresses (table `V`). It uses the clock's ramp object (`tickRamp`,
  `show`, `hide`). The console's answers come through `io`: `poll()` (the job poll),
  `submit()` (the job queued) and `subRows(k, id)` (`func_002086A8`).
- `References/scripts/verify_version.mjs` carries the state from the first frame. The model
  owns the ramp, the record, the rows' label/value/id, the job handle and the front ramp. Taken
  from outside: the pad, the main menu, the other ramps, the title pointer, the shown-row count,
  the sub-row counts, the page stack and any memory writes a capture makes. A write recorded at
  frame F reaches the pages call of frame F+1.
- What it compares, at the page's start, after the page, and at menupos: count, selected, first
  shown, the ramp, all 32 rows (label, value, sub-rows, id), the job handle, the front-page
  pointer and the front ramp; the panel enable and alpha (while the front ramp is not full);
  the hints and arrows (while the front ramp is hidden, or when the page wrote them). It also
  checks that the poll, the fill and the queue happen on the same frames as on the console.

Verdicts (`CLOCK_BUILD=hdd`). Captures are in `D:/CodingProjects/Watson/Runtime/captures/`.

| Capture | What happens | Result |
|---|---|---|
| `hddosd-110U-whole3-version` | whole-frame probes (verify_frame + verify_text2 + verify_version); triangle at frame 3, circle at frame 75, 120 frames | FOUND 126 frames, 9 288 comparisons equal: open, 1 frame held for the job, fill, 10 rising, 61 shown, circle, 10 falling |
| `hddosd-110U-version-nav` | rows shown written to 1 (stimulus); down ×3 (the last is clamped), cross (does nothing), triangle on a row without sub-rows (does nothing), up ×3, triangle on row 0 (front page pushed) | FOUND 131 frames, 9 614 equal |
| `hddosd-110U-version-stim` | stimuli: rows shown 1, selected 2, top 1, `var_curvidmode` 0 (Japan hint order), id 6 written into list row 2 at the fill frame | FOUND 106 frames, 7 768 equal |
| `hddosd-110U-version-stim2` | stimuli: selected 1, top 1, panel enable 1 before open, id 6 in row 2; triangle on row 2 (front = record 2), up while the front page rises | FOUND 87 frames, 6 364 equal |
| `hddosd-110U-version-stim3` | stimulus: selected 1, top 1, no id 6 (selected reset to 0); circle close; main menu ramp written to rising, then triangle (gate closed); leaving flag written, then triangle | FOUND 87 frames, 6 402 equal |

All five are in `run_all.manifest.json`; `run_all.mjs --changed` passes 5 of 5.

In the unstimulated capture the list has three rows: ids 0, 3 and 5. Row 0 has one sub-row and
no row has id 6, so the selected row is 0 and the third hint is 0x57.

**Mutation.**
- `mutate.mjs verify_version.mjs`: 1 of 1 candidate killed. The verifier computes almost
  nothing itself.
- The model was mutated through the verifier with a scratch harness (copies of the model and
  of the verifier, run on all five captures): **173 of 195 killed**. The 22 survivors are
  equivalent or not reachable:
  - Pad masks gaining bit 0x1 (L2), 3 mutants: L2 is never pressed.
  - The negative-product rounding in `alphaOf`, 4 mutants: the product is never negative.
  - `front·128` → `front·129` inside `alphaOf`, 1 mutant: the panel takes max(alpha, front), and
    the values are equal at every front counter reached.
  - Notes only, 4 mutants (lines 67, 93).
  - `count < ROWS` → `<=`, 1 mutant: needs a full 32-row list.
  - Null-label test reading at +1, 1 mutant: equal for these label pointers.
  - First-shown `<` → `<=`, 1 mutant: equal at equality, so always equivalent.
  - View length 0x10 → 0x11, 1 mutant.
  - 0x55/0x56 on the right hint, 2 mutants: the right argument is always 1 on this page.
  - `alpha < front` → `<=`, 1 mutant: equal at equality.
  - Front state 3, 1 mutant: never reached, because the front page's closing is not modelled.
  - The leaving flag in the gate, 1 mutant: whenever `D_002B2174 != 0`, the main menu ramp has
    already left state 2 at menupos (between() sets mode 3 → `func_002320B0` hides the ramp in
    the same frame; stim3 shows ramp state 3 at the triangle).
  - A failed queue (handle 0), 1 mutant: never happens.

## Open items

1. **ROM 2.30 not measured.** The version page's ROM addresses were not looked up, so
   `verify_version.mjs` is HDD-only and says PARTIAL under `CLOCK_BUILD=rom`. The PAL check was
   not taken either; the code reads no frame rate.
2. **The front page (the row's detail page) is not modelled.** That covers `func_00229028`,
   `func_00229080`, `func_002297D0`, the sub-page records `do_show_version_info` builds in
   `D_00404370` / `D_00403CE0`, how it closes, and its panel words. The verifier stops
   comparing hints and arrows once the front page leads, and stops comparing the panel alpha
   once the front ramp is full.
3. **`clock_menus.mjs` still answers triangle with "not modelled".** On `whole3-version`,
   `verify_frame.mjs --carry` gives PARTIAL: `versionRamp` differs in 83 frames, and the frames
   from 1629 on report the note "the version page ... is not modelled". All its vertex, state
   and text packets are equal: 95.9% of packets produced, and the version page's own text is
   not counted. To integrate, in `menus()`, replace `tickRamp(versionRamp)` with
   `frontTick` + `versionPage` (in pages order: 229828 then 22A990, before `configPage`), and
   call `triangle` from `mainMenu`'s triangle branch. That needs the extra pieces in the
   snapshot (record and rows, `D_00370A84`, panel words, page stack, job list) and the
   console's answers (poll, queue, `func_002086A8`) as external inputs.
4. **`verify_text2.mjs` crashes on `whole3-version`.** The error is `RangeError` in
   `sequencePlace` (verify_text2.mjs:769): it reads row `-2·16` of the rows. The version
   branch reaches a value string while `version.row` is still `rec[0x14] − 2`. Its `text2-version`
   captures pass, so this capture's frames show something they do not (perhaps the frame drawn
   while the job is pending, before the rows are filled). Not fixed here, because it is another
   verifier.
5. **Sound commands** (0x6300 1 4 / 6 / 0xA) are read but not modelled. The title string id is
   0x59, which is not in facts/text.md's list (that list has 0x5F "Version"); check it against
   the language table.
6. `func_002086A8` (the sub-row count per id) and the job `D_0020AAD8` (the list from
   `func_00208618` / `func_00208660` / `func_00208530`) are taken from the console, not
   recomputed.
