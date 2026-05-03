# OSDSYS-Launcher Reference

Source: `/Users/jeanxpereira/CodingProjects/OSDSYS-Launcher/`
Authors: Howling Wolf & Chelsea (HWNJ), segments from SP193

## Why This Is Valuable

This is a **tested, working implementation** of the OSDSYS config subsystem.
It provides ground truth for:

### 1. OSDConfigStore_t — EEPROM Byte-Level Layout
The EXACT byte-by-byte layout of the PS2 config block in EEPROM:

```
Byte 0x0F:
  bit 0     = spdifMode (0=enabled, 1=disabled)
  bits 2:1  = screenType (0=4:3, 1=fullscreen, 2=16:9)
  bit 3     = videoOutput (0=RGB/SCART, 1=component)
  bit 4     = japLanguage (protokernel only)
  bit 5     = extendedLanguage (1 = use 5-bit language field)

Byte 0x10:
  bits 4:0  = language (5-bit, up to 32 languages)
  bits 7:5  = version (0=protokernel, 1=ROM<=v1.70, 2=v1.80+)

Byte 0x11:
  bits 2:0  = timezoneOffsetHi (3 bits)
  bit 3     = daylightSaving
  bit 4     = timeFormat (0=24h, 1=12h)
  bits 6:5  = dateFormat (0=YYYY/MM/DD, 1=MM/DD/YYYY, 2=DD/MM/YYYY)
  bit 7     = osdInit (OOBE flag)

Byte 0x12:
  bits 7:0  = timezoneOffsetLo (8 bits)
  → timezoneOffset = timezoneOffsetLo | (timezoneOffsetHi << 8) = 11 bits

Byte 0x13:
  bit 0     = timezoneHi (MSB of timezone)
  bits 3:1  = unknownB13_01 (carried over, never modified)
  bit 4     = dvdpProgressive
  bit 5     = rcSupported
  bit 6     = rcGameFunction
  bit 7     = rcEnabled

Byte 0x14:
  bits 7:0  = timezoneLo (8 bits)
  → timezone = timezoneLo | (timezoneHi << 8) = 9 bits total
```

### 2. OSDConfig2_t — In-Memory Bitfield Structure
The runtime representation after parsing from EEPROM:
- spdifMode (1 bit)
- screenType (2 bits) = aspect ratio
- videoOutput (1 bit)
- language (5 bits)
- timezoneOffset (11 bits) = minutes from GMT
- timezone (9 bits) = city ID
- daylightSaving (1 bit)
- timeFormat (1 bit) = 24h/12h
- dateFormat (2 bits)
- rcEnabled/rcGameFunction/rcSupported
- dvdpProgressive

### 3. Region Detection
- ROMVER parsing: `rom0:ROMVER` byte[4] = region letter
  - J=Japan, A/H=USA, E=Europe, C=China
- OSDVER parsing: `rom0:OSDVER` byte[4] = OSD region
  - Adds K=Korea, R=Russia, H=Asia
- System folder naming: `B{I,A,E,C}EXEC-SYSTEM`, `B{I,A,E,C}DATA-SYSTEM`

### 4. OSD Naming Convention for MC
From main-nogui.c, the OSD update files on memory card:
```
mc0:/B{region}EXEC-SYSTEM/osdmain.elf    (base)
mc0:/B{region}EXEC-SYSTEM/osd110.elf     (v1.10)
mc0:/B{region}EXEC-SYSTEM/osd120.elf     (v1.20)
...
mc0:/B{region}EXEC-SYSTEM/osd270.elf     (v2.70)
```
Where region = I(Japan), A(USA), E(Europe)

### 5. MECHACON Version Detection
From libcdvd_add.c:
- v5.0+ supports S-cmd 0x24 (RC bypass)
- v5.2+ supports S-cmd 0x27 (PS1 boot param)
- v6.0+ supports S-cmd 0x36 (region params)

### 6. Makefile Reference
Uses standard PS2SDK build system:
```makefile
EE_LIBS = -ldebug -lc -lcdvd -lpatches -lfileXio
include $(PS2SDK)/samples/Makefile.pref
include $(PS2SDK)/samples/Makefile.eeglobal
```

## Cross-Reference with Ghidra

Our `config_set_aspect_ratio` at 0x001f41e8 operates on the same
`screenType` field (bits 2:1) documented here. This confirms our
bitfield analysis was correct!

`ReadConfigFromNVM` at line 494 is functionally identical to our
reconstructed `do_read_cdvd_config_entry` — same sceCdOpenConfig(1,0,2)
→ sceCdReadConfig → sceCdCloseConfig pattern with stat & 0x81 checks.
