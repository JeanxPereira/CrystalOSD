# What `config_item_change_cb_clock_write_mechacon` writes

Question: what does `config_item_change_cb_clock_write_mechacon` (HDD OSD 1.10U `0x00235170`, ROM 2.30 `0x00231738`)
write, and from which inputs. Read from `asm/config/config_item_change_cb_clock_write_mechacon.s`, `asm/core/func_002148B8.s`,
`func_00214788.s`, `func_00235138.s` (in `align_036138.s`); ROM addresses by `find_in_rom.mjs` (head 15/16 to 16/16) and
`disasm_rom.py`.

## Inputs

- Items 6 to 0xB: words `0x00409148..0x0040915C` (`D_00409130` + `0x18..0x2C`; ROM `0x00375100` + `0x18..0x2C`): year, month,
  day, hour, minute, second, local time. Copied to six stack words in that order.
- The settings word `var_mechacon_config_param_1` (HDD `0x00371818`; ROM `0x002C9680`, the address `0x002044D8` loads),
  read by `config_get_timezone_offset` (bits 9..19, signed minutes) and `config_get_daylight_saving` (bit 29).
- The base zone: `config_check_timezone_city(0x33)` then `get_timezone_info_struct`, 540 minutes.

## Computation

1. `func_002148B8` (ROM `0x0020E1B8`) takes six pointers. When hour or year is negative (two `bltz`) it returns with the
   six words unchanged. Otherwise `func_002149D8` (date to seconds since 1600), `func_00214788` (ROM `0x0020E158`), then
   `some_sort_of_lut_calc` (seconds to a date) writes the six words back.
2. `func_00214788(seconds)`: `seconds - 3600` when summer time, `- zone x 60`, `+ base x 60` (the inverse of `func_00214728`).
3. BCD, `func_00235138` (ROM `0x00231700`): `((v / 10) << 4) + v % 10`, low byte. Stores, in this order:
   `0x1F0D17` = BCD(year mod 100), `0x1F0D16` = BCD(month) | 0x80, `0x1F0D15` = BCD(day), `0x1F0D13` = BCD(hour),
   `0x1F0D12` = BCD(minute), `0x1F0D11` = BCD(second); word `0x1F0D18` = 1;
   mirror words `0x1F0D1C, 20, 24, 28, 2C, 30` = year, month, day, hour, minute, second of the result.
   ROM: every address 0x64 lower (`0x1F0CAD..0x1F0CCC`); the code is the same word for word.
4. Not written: `0x1F0D10`, `0x1F0D14`, `0x1F0D19..0x1F0D1B`.

## What a verifier probes

Entry (`0x00235170`): items, settings word, `0x1F0D10..0x1F0D33` before. Return (`0x002352B4`, the `jr` after the last store):
the same block after. Per call it recomputes the six RTC words, seven BCD bytes and flag, and the untouched bytes.
