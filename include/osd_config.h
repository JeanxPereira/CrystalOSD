#ifndef OSD_CONFIG_H
#define OSD_CONFIG_H

/**
 * @file osd_config.c
 * @brief OSDSYS configuration parameter management
 *
 * Reconstructed from Ghidra decompilation of all 67 config_* functions
 * in hddosd.elf v1.10U. Cross-referenced with OSDConfigStore_t byte layout
 * documented in reference/osdsys_launcher_ref.md (HWNJ OSDSYS-Launcher).
 *
 * --- Mechacon EEPROM packing ---
 *
 * The Mechacon stores OSD config in EEPROM bytes 0x0F-0x14 (per OSDConfigStore_t
 * in the Launcher reference). OSDSYS reads them via sceCdReadConfig and packs
 * into two u32 words at runtime for fast bitfield access:
 *
 *   var_mechacon_config_param_1 @ 0x00371818
 *     bit 0       spdif_mode                  (EEPROM 0x0F bit 0)
 *     bits 2:1    aspect_ratio  (screenType)  (EEPROM 0x0F bits 2:1)
 *     bit 3       video_output                (EEPROM 0x0F bit 3)
 *     bits 8:4    osd_language  (5 bits)      (EEPROM 0x10 bits 4:0)
 *     bits 19:9   timezone_offset (11 bits)   (EEPROM 0x11[2:0] | 0x12)
 *     bits 28:20  timezone_city   (9 bits)    (EEPROM 0x13 bit 0 | 0x14)
 *     bit 29      daylight_saving             (EEPROM 0x11 bit 3)
 *     bit 30      time_format                 (EEPROM 0x11 bit 4)
 *     bit 31      preserved (never modified)  (likely EEPROM 0x11 bit 7 osdInit)
 *
 *   var_mechacon_config_param_2 @ 0x0037181c
 *     bits 1:0    date_format                 (EEPROM 0x11 bits 6:5)
 *     bit 2       unknown_204DD8              (probably osdInit OOBE flag)
 *     bit 3       rc_gameplay   (rcGameFn)    (EEPROM 0x13 bit 6)
 *     bit 4       dvdp_remote_control (rcEn)  (EEPROM 0x13 bit 7)
 *     bit 5       dvdp_progressive            (EEPROM 0x13 bit 4)
 *
 * Peripherals (keyboard/mouse/atok/softkb) live in separate u32 globals
 * and are persisted to a config .ini file on the HDD, not the EEPROM.
 *
 * Working/dirty mirror copies for the clock/settings UI live in the
 * 0x00409130-0x004091ac range (var_config_*).
 */

#include <tamtypes.h>
#include <string.h>
#include <stdint.h>

/* ---------------------------------------------------------------- */
/*  Globals — addresses match hddosd.elf v1.10U                     */
/* ---------------------------------------------------------------- */

/* Mechacon NVRAM bitfields (loaded via sceCdReadConfig) */
/* 0x00371818 */ extern u32 var_mechacon_config_param_1;
/* 0x0037181c */ extern u32 var_mechacon_config_param_2;

/* Extended timezone-city storage (overflow path when city > 127) */
/* 0x002ab240 */ extern u32 g_extended_timezone_city;

/* HDD-persisted peripheral settings */
/* 0x00371820 */ extern s32 var_hddsys_keyboard_type;
/* 0x00371824 */ extern s32 var_hddsys_keyboard_repeatw;
/* 0x00371828 */ extern s32 var_hddsys_keyboard_repeats;
/* 0x0037182c */ extern s32 var_hddsys_mouse_speed;
/* 0x00371830 */ extern s32 var_hddsys_mouse_dblclk;
/* 0x00371834 */ extern s32 var_hddsys_mouse_lr;
/* 0x00371838 */ extern s32 var_hddsys_atok_mode;
/* 0x0037183c */ extern s32 var_hddsys_atok_bind;
/* 0x00371840 */ extern s32 var_hddsys_softkb_onoff;
/* 0x00371844 */ extern s32 var_hddsys_softkb_qwert;

/* "Original on load" snapshots used by config_hdd_write_keys to detect changes */
/* 0x00371850 */ extern s32 g_orig_keyboard_type;
/* 0x00371854 */ extern s32 g_orig_keyboard_repeatw;
/* 0x00371858 */ extern s32 g_orig_keyboard_repeats;
/* 0x0037185c */ extern s32 g_orig_mouse_speed;
/* 0x00371860 */ extern s32 g_orig_mouse_dblclk;
/* 0x00371864 */ extern s32 g_orig_mouse_lr;
/* 0x00371868 */ extern s32 g_orig_atok_mode;
/* 0x0037186c */ extern s32 g_orig_atok_bind;
/* 0x00371870 */ extern s32 g_orig_softkb_onoff;
/* 0x00371874 */ extern s32 g_orig_softkb_qwert;
/* 0x00371848 */ extern u32 g_orig_mechacon_param_1;

/* PS1DRV mechacon byte buffer (0x0F bytes copied from raw EEPROM read) */
/* 0x001f1284 */ extern u8 var_ps1drv_config;

/* Dirty / write-in-progress flags */
/* 0x00370304 */ extern s32 var_config_dirty;
/* 0x0037030c */ extern s32 var_config_writeinprogress;
/* 0x00370300 */ extern s32 g_config_load_first_pass;
/* 0x001f0d18 */ extern u8  var_clock_is_dirty;
/* 0x001f1294 */ extern u32 var_diagnosis;
/* 0x001f1424 */ extern u32 dvdplayer_should_reset_progressive;

/* Dirty mirror copies (used by clock/settings UI) */
/* 0x00409130 */ extern s32 var_config_aspect_ratio;
/* 0x00409134 */ extern s32 var_config_spdif_mode;
/* 0x00409138 */ extern s32 var_config_video_output;
/* 0x0040913c */ extern s32 var_config_osd_language;
/* 0x00409140 */ extern s32 var_config_diagnosis;
/* 0x00409164 */ extern s32 var_config_time_format;
/* 0x00409168 */ extern s32 var_config_date_format;
/* 0x0040916c */ extern s32 var_config_timezone_city;
/* 0x00409170 */ extern s32 var_config_daylight_saving;
/* 0x00409178 */ extern s32 var_config_rc_gameplay;
/* 0x0040917c */ extern s32 var_config_dvdp_remote_control;
/* 0x00409180 */ extern s32 var_config_dvdp_support_clear_progressive;
/* 0x00409188 */ extern s32 var_config_keyboard_type;
/* 0x0040918c */ extern s32 var_config_keyboard_repeatw;
/* 0x00409190 */ extern s32 var_config_keyboard_repeats;
/* 0x00409194 */ extern s32 var_config_mouse_speed;
/* 0x00409198 */ extern s32 var_config_mouse_dblclk;
/* 0x0040919c */ extern s32 var_config_mouse_lr;
/* 0x004091a0 */ extern s32 var_config_atok_mode;
/* 0x004091a4 */ extern s32 var_config_atok_bind;
/* 0x004091a8/0x004091ac */ extern u32 var_config_ps1drv_low[15];
/* 0x004091b0... */ extern u32 var_config_ps1drv_hi[15];
/* 0x00409148-0x0040915c */ extern s32 g_clock_year, g_clock_month, g_clock_day;
extern s32 g_clock_hour, g_clock_min, g_clock_sec;
/* 0x00409174 */ extern s32 g_config_204DD8_mirror;
/* 0x00409184 */ extern s32 g_dvdp_reset_progressive_mirror;

/* Language pointer-table (resolved by config_set_langtbl) */
/* 0x002ad200 */ extern void *langtblptrs[];
/* 0x002ad220 */ extern void *PTR_langtbl_english_002ad220;

/* Timezone-city table base (1 entry = 0x18 bytes, byte[2] = country/region id) */
/* 0x002ad98a */ extern u8 g_timezone_city_table[];
/* 0x002ae5a0 */ extern s32 g_timezone_city_count;

/* HDD INI file-handle cache */
/* 0x002aba60 */ extern s32 g_hdd_ini_read_fd;
/* 0x002aba64 */ extern s32 g_hdd_ini_write_fd;
/* 0x002aca6c */ extern s32 g_hdd_ini_last_err;
/* 0x002ab260 */ extern char g_hdd_ini_path[];
/* 0x002ab660 */ extern char g_hdd_ini_tmp_path[];
extern const char aTmp[]; /* ".tmp" */

/* HDD INI section/key string table base */
/* 0x00347c20 */ extern const char g_hdd_ini_filename[];
/* 0x00347c38 */ extern const char g_sec_keyboard[];
/* 0x00347c48 */ extern const char g_key_kbd_type[];
/* 0x00347c50 */ extern const char g_key_kbd_repeatw[];
/* 0x00347c58 */ extern const char g_key_kbd_repeats[];
/* 0x00347c60 */ extern const char g_sec_mouse[];
/* 0x00347c68 */ extern const char g_key_mouse_speed[];
/* 0x00347c70 */ extern const char g_key_mouse_dblclk[];
/* 0x00347c78 */ extern const char g_key_mouse_lr[];
/* 0x00347c80 */ extern const char g_sec_atok[];
/* 0x00347c88 */ extern const char g_key_atok_mode[];
/* 0x00347c90 */ extern const char g_key_atok_bind[];
/* 0x00347c98 */ extern const char g_sec_softkb[];
/* 0x00347ca8 */ extern const char g_key_softkb_onoff[];
/* 0x00347cb8 */ extern const char g_key_softkb_qwert[];

/* Mechacon raw byte buffer (filled by do_read_cdvd_config_entry) */
/* 0x00371878 */ extern u8 g_mechacon_raw_buf[];

/* External helpers (PS2SDK / other OSDSYS subsystems — kept extern) */
extern void do_read_cdvd_config_entry(void *buf);
extern long get_vidmode_with_fallback(void);
extern long get_timezone_info_struct(void);
extern long callback_queue_submit(u32 cb, u32 arg);
extern void module_clock_set_anim_offset(u32 offset, u32 dst);
extern u32  thunk_config_get_osd_language(void);
extern void nullsub_1(int);
extern long fileops_cmd_open(const void *path, int flags, int mode);
extern long fileops_cmd_close(int fd);
extern long fileops_get_cmd_result(int a, int b, int *out);

/* Anonymous helpers (FUN_*) used only by INI parser — kept opaque */
extern long FUN_002050a8(void);
extern void FUN_00206578(long);
extern long FUN_00203490(void *dst, void *src);
extern void FUN_00203850(void *dst, void *src);
extern long FUN_00206080(const char *);
extern long FUN_002062a8(const void *key);
extern long FUN_00205720(void);
extern long FUN_00205ba8(long c);
extern long FUN_00205c00(long c);
extern long FUN_00205c10(long c);
extern long FUN_00205c40(long c);
extern long FUN_00205c80(long c);
extern long FUN_00205ca8(long c);
extern long FUN_00205bf0(long c);
extern void FUN_00205798(void);
extern void FUN_00205df8(void);
extern long FUN_002057c0(const char *);
extern long FUN_002059c0(const void *sec, const void *key);
extern long FUN_002076f0(u32 value, void *out, int base);
extern long FUN_002058a8(u8 c);
extern long FUN_00205aa0(void);
extern long FUN_00205858(void);
extern void FUN_00205808(void);
extern long FUN_00212320(void);
extern long FUN_002148b8(void *, void *, void *, void *, void *, void *);
extern u8   FUN_00235138(int);
extern long FUN_002357c0(void);
extern long FUN_002357b0(void);
extern long FUN_002357a0(void);
extern float FUN_00235730(void);
extern float FUN_00235650(void);
extern float FUN_002355a0(void);

/* BCD packed clock RAM bytes touched by clock_write_mechacon */
/* 0x001f0d11..0x001f0d17 */ extern u8 uRam001f0d11, uRam001f0d12, bRam001f0d13;
extern u8 bRam001f0d15, bRam001f0d16, uRam001f0d17;
extern s32 iRam001f0d1c;
extern u32 uRam001f0d20, uRam001f0d24, uRam001f0d28, uRam001f0d2c, uRam001f0d30;

/* Forward decls */
u32 config_mechacon_prepare(void *out_bytes, void *out_packed);
void config_hdd_prepare(void);
u32 config_get_osd_language(void);
s32 config_get_timezone_offset(void);
u32 config_get_daylight_saving(void);
u32 config_hdd_open_read_ini(const char *path);
long config_hdd_close_ini(void);
long config_hdd_do_get_key(const char *sec, const char *key, u32 *out, int *base_out);
long config_hdd_write_single_key(const char *sec, const char *key, u32 val, int base);
long config_check_timezone_city(u32 city);


#endif /* OSD_CONFIG_H */
