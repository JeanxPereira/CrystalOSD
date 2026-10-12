# The Browser's first dialog on HDD OSD 1.10U

Read: `browser_hdd_error_render` 0x25BD18 draws a message selected by the kind word D_00370BE8. The scan 0x24B96C calls `0x25BC08(0, 0, 0)` (kind 0) when D_003708E8 != 2.

The existing capture `hddosd-110U-trans-return.trace.jsonl.gz` (frames 2008..2104) carries no probe in the Browser and no packet origins, so a call scan of 0x25BD18 over it is not possible; its only probe is the clock function 0x234B88.

Measured instead (scratch capture, exact mode, `--state menu`, Cross on item 0, probes at 0x25BD18 and at `GetOSDString` 0x002081B8, a0 = id):

- D_00370BE8 = 0 (kind 0) on every frame the dialog is drawn, from capture frame 127 (the Browser's first frame).
- `GetOSDString` ids drawn with the dialog: 0x15C 0x15D 0x15E 0x15F, every frame (kind 0 as read).
- Frame before the dialog (scan outcome): ids 6, 6, 0x1A1, 0x8A, 7, 0x8A, 8 (the device titles "PS2" 6, "HDD" 0x1A1).

The verifier `verify_browser_enter.mjs` (Task 2) recomputes these from the probes.
