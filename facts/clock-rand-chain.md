# The random generator's state at the clock's start

*Read* on **HDD OSD 1.10U**: `rand` (`0x0029C6E8`), `srand` (`0x0029C6D8`), `func_0022EF40`,
`func_0021E6C8`, `InitLightsCubes`, `OpeningDrawLights`. *Verified* with
`References/scripts/verify_cold_rand_chain.mjs` on the logs `hddosd-110U-cold-rand-{direct,opening,history}.rand.json`
that `References/scripts/cold_rand.mjs` records (a breakpoint on every call of `rand` and `srand` from power-on
to `module_clock_init_resources` and twenty frames beyond).

## The rule

`rand` is a linear congruential generator on one word, `*(_impure_ptr_0 + 0x58)`
(`_impure_ptr_0` = `0x00347384`, holding `0x00347098`):

```
state = state * 0x41C64E6D + 0x3039      (32 bits, kept whole)
rand() = state & 0x7FFFFFFF
srand(a0): state = a0
```

The ELF holds 1 in the word (`0x003470F0`). `func_0022EF40` draws seven values at `0x0022F030`
(`D_00405210[k] = rand() % 65536`; `verify_rand.mjs` verifies the seven angles from the state).

## The calls before the clock

| Start | Calls before `module_clock_init_resources` | State at the init |
|---|---|---|
| Plain power-on (`SkipSearchLater`) | none; no `srand` | 1 |
| Through the opening (`SkipSearchLater BootOpening`) | 27 314, no `srand` | `0x60440537` |
| The same from a state with a play history (`hddosd-1.10U-host-opening-towers.p2s`, five entries) | 26 096 after the state's moment, no `srand` | `0x60440537` |

The 27 314 calls of the opening, by caller: `func_0021E6C8` 385 (`0x0021E7D8` once, `0x0021E878`,
`0x0021E8A0` and `0x0021E8C8` 128 times each), `InitLightsCubes` once (`0x00220CB0`), `OpeningDrawLights`
26 928 (`0x0021F98C`, 128 in most frames of the 217 that draw the lights, fewer in the first and last).
The play history changes no draw: both runs reach the same state. The seven angles equal the
seven draws after the init in each log.

`verify_cold_rand_chain.mjs` recomputes, for each log: every call's probed state from the call before it (no
call is missing), the state at the init from the calls (LCG applied once per call to the first state, which is
the ELF's 1 on a run from power-on), and the seven angles from the state at the init.
