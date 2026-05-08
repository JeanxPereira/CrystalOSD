#include "osd_config.h"

/* ============================================================== */
/*  Mechacon param 1 — bitfield accessors                         */
/* ============================================================== */

/* 0x00203a20 — config_set_default_main */
void config_set_default_main(void)
{
    /* preserve bit 31 only; install factory defaults for all other fields */
    var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0x80000000)
                                | 0x3343800;
    var_hddsys_softkb_onoff      = 1;
    var_mechacon_config_param_2 &= 0xfffffffc; /* clear date_format */
    var_hddsys_softkb_qwert      = 0;
    var_hddsys_keyboard_type     = 0;
    var_hddsys_keyboard_repeatw  = 1;
    var_hddsys_keyboard_repeats  = 1;
    var_hddsys_mouse_speed       = 1;
    var_hddsys_mouse_dblclk      = 1;
    var_hddsys_mouse_lr          = 1;
    var_hddsys_atok_mode         = 0;
    var_hddsys_atok_bind         = 1;
}

/* 0x00203bf0 — config_first */
u32 config_first(void)
{
    u32 ret;
    int i;

    ret = (u32)config_mechacon_prepare(&var_ps1drv_config + (0x371808 - 0x371808),
                                       &var_mechacon_config_param_1);
    config_hdd_prepare();

    /* Copy the first 0x0F mechacon bytes into the PS1DRV scratch area */
    for (i = 0; i < 0x0F; i++) {
        ((u8 *)&var_ps1drv_config)[i] = ((u8 *)0x00371808)[i];
    }
    *(u8 *)0x001f1285 = 0;

    /* Snapshot originals so config_hdd_write_keys can diff later */
    g_orig_mechacon_param_1  = var_mechacon_config_param_1;
    g_orig_keyboard_type     = var_hddsys_keyboard_type;
    g_orig_keyboard_repeats  = var_hddsys_keyboard_repeats;
    g_orig_mouse_dblclk      = var_hddsys_mouse_dblclk;
    g_orig_atok_mode         = var_hddsys_atok_mode;
    g_orig_softkb_onoff      = var_hddsys_softkb_onoff;

    /* Mask down ps1drv config word to bits 0,4 only (spdif + japLanguage) */
    var_ps1drv_config = ((u8 *)0x00371808)[0] & 0x11;
    return ret;
}

/* 0x00203cf8 — config_get_spdif_mode (EEPROM 0x0F bit 0) */
u32 config_get_spdif_mode(void)
{
    return var_mechacon_config_param_1 & 1;
}

/* 0x00203d08 — config_set_spdif_mode */
u32 config_set_spdif_mode(u32 v)
{
    var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0xfffffffe) | (v & 1);
    return v & 1;
}

/* 0x00203d30 — config_get_aspect_ratio (EEPROM 0x0F bits 2:1, "screenType") */
u32 config_get_aspect_ratio(void)
{
    u32 v = (var_mechacon_config_param_1 >> 1) & 3;
    if (v > 2) v = 0;
    return v;
}

/* 0x00203d50 — config_set_aspect_ratio */
s32 config_set_aspect_ratio(s32 arg0)
{
    s32 temp;

    if ((s32)((var_mechacon_config_param_1 >> 1) & 3) >= 3) {
        if (arg0 == 0) {
            return 0;
        }
    }

    temp = arg0 & 3;
    var_mechacon_config_param_1 = ((s32)var_mechacon_config_param_1 & -7) | (temp << 1);
    return temp;
}

/* 0x00203d98 — config_get_video_output (EEPROM 0x0F bit 3) */
u32 config_get_video_output(void)
{
    return (var_mechacon_config_param_1 >> 3) & 1;
}

/* 0x00203db0 — config_set_video_output */
void config_set_video_output(u32 v)
{
    var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0xfffffff7)
                                | ((v & 1) << 3);
}

/* 0x00203dd8 — config_get_osd_language (EEPROM 0x10 bits 4:0)
 *
 * Behavior depends on video mode:
 *   vidmode == 0 (Japan/protokernel): boolean — returns 1 iff lang field == 1
 *   otherwise:  returns 5-bit language; clamps invalid values; auto-fixes 0
 */
u32 config_get_osd_language(void)
{
    u32 v;
    long vidmode = get_vidmode_with_fallback();

    if (vidmode == 0) {
        return ((var_mechacon_config_param_1 >> 4) & 0x1f) == 1;
    }

    v = (var_mechacon_config_param_1 >> 4) & 0x1f;
    if (v == 0) {
        var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0xfffffe0f) | 0x10;
    } else if (v > 7) {
        return 1;
    }
    return (var_mechacon_config_param_1 >> 4) & 0x1f;
}

/* 0x00203e58 — config_set_jpn_language (writes the same 5-bit lang field) */
u32 config_set_jpn_language(u32 v)
{
    long vidmode = get_vidmode_with_fallback();

    if (vidmode == 0) {
        if (((var_mechacon_config_param_1 >> 4) & 0x1f) > 1 && v == 0) {
            return 0;
        }
    } else {
        if (((var_mechacon_config_param_1 >> 4) & 0x1f) > 7 && v == 1) {
            return 1;
        }
    }
    var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0xfffffe0f)
                                | ((v & 0x1f) << 4);
    return v & 0x1f;
}

/* 0x00203ee8 — config_get_timezone_offset (EEPROM 0x11[2:0] | 0x12, 11-bit signed) */
s32 config_get_timezone_offset(void)
{
    /* sign-extend 11-bit field at bits 19:9: shift left 12, arithmetic right 21 */
    return ((s32)(var_mechacon_config_param_1 << 12)) >> 21;
}

/* 0x00203f00 — config_set_timezone_offset */
s32 config_set_timezone_offset(u32 v)
{
    var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0xfff001ff)
                                | ((v & 0x7ff) << 9);
    return ((s32)(v << 21)) >> 21;
}

/* 0x00203f30 — config_get_timezone_city (EEPROM 0x13 bit 0 | 0x14, 9-bit) */
u32 config_get_timezone_city(void)
{
    u32 v = (var_mechacon_config_param_1 >> 20) & 0x1ff;
    if (v > 0x7f) {
        g_extended_timezone_city = v;
        return 0x80;
    }
    return v;
}

/* 0x00203f60 — config_set_timezone_city */
u32 config_set_timezone_city(u32 city)
{
    if (city == 0x80) {
        var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0xe00fffff)
                                    | ((g_extended_timezone_city & 0x1ff) << 20);
        return 0x80;
    }
    var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0xe00fffff)
                                | ((city & 0x1ff) << 20);
    return city & 0x1ff;
}

/* 0x00203fc8 — config_get_daylight_saving (EEPROM 0x11 bit 3) */
u32 config_get_daylight_saving(void)
{
    return (var_mechacon_config_param_1 >> 29) & 1;
}

/* 0x00203fe0 — config_set_daylight_saving */
void config_set_daylight_saving(u32 v)
{
    var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0xdfffffff)
                                | ((v & 1) << 29);
}

/* 0x00204008 — config_get_time_format (0=24h, 1=12h; EEPROM 0x11 bit 4) */
u32 config_get_time_format(void)
{
    return (var_mechacon_config_param_1 >> 30) & 1;
}

/* 0x00204020 — config_set_time_format */
void config_set_time_format(u32 v)
{
    var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0xbfffffff)
                                | ((v & 1) << 30);
}

/* ============================================================== */
/*  Mechacon param 2 — date format / RC / DVD-P                   */
/* ============================================================== */

/* 0x00204048 — config_get_date_format (EEPROM 0x11 bits 6:5) */
u32 config_get_date_format(void)
{
    u32 v = var_mechacon_config_param_2 & 3;
    if (v > 2) v = 0;
    return v;
}

/* 0x00204060 — config_set_date_format */
u32 config_set_date_format(u32 v)
{
    if ((var_mechacon_config_param_2 & 3) > 2 && v == 0) {
        return 0;
    }
    var_mechacon_config_param_2 = (var_mechacon_config_param_2 & 0xfffffffc)
                                | (v & 3);
    return v & 3;
}

/* ============================================================== */
/*  Peripheral get/set — trivial wrappers over .ini-backed globals */
/* ============================================================== */

/* 0x002040b0 */ void  config_set_keyboard_type(u32 v)    { var_hddsys_keyboard_type    = (s32)v; }
/* 0x002040c0 */ u32   config_get_keyboard_type(void)     { return (u32)var_hddsys_keyboard_type; }
/* 0x002040d0 */ void  config_set_keyboard_repeatw(u32 v) { var_hddsys_keyboard_repeatw = (s32)v; }
/* 0x002040e0 */ u32   config_get_keyboard_repeatw(void)  { return (u32)var_hddsys_keyboard_repeatw; }
/* 0x002040f0 */ void  config_set_keyboard_repeats(u32 v) { var_hddsys_keyboard_repeats = (s32)v; }
/* 0x00204100 */ u32   config_get_keyboard_repeats(void)  { return (u32)var_hddsys_keyboard_repeats; }
/* 0x00204110 */ void  config_set_mouse_speed(u32 v)      { var_hddsys_mouse_speed      = (s32)v; }
/* 0x00204120 */ u32   config_get_mouse_speed(void)       { return (u32)var_hddsys_mouse_speed; }
/* 0x00204130 */ void  config_set_mouse_dblclk(u32 v)     { var_hddsys_mouse_dblclk     = (s32)v; }
/* 0x00204140 */ u32   config_get_mouse_dblclk(void)      { return (u32)var_hddsys_mouse_dblclk; }
/* 0x00204150 */ void  config_set_mouse_lr(u32 v)         { var_hddsys_mouse_lr         = (s32)v; }
/* 0x00204160 */ u32   config_get_mouse_lr(void)          { return (u32)var_hddsys_mouse_lr; }
/* 0x00204170 */ void  config_set_atok_mode(u32 v)        { var_hddsys_atok_mode        = (s32)v; }
/* 0x00204180 */ u32   config_get_atok_mode(void)         { return (u32)var_hddsys_atok_mode; }
/* 0x00204190 */ void  config_set_atok_bind(u32 v)        { var_hddsys_atok_bind        = (s32)v; }
/* 0x002041a0 */ u32   config_get_atok_bind(void)         { return (u32)var_hddsys_atok_bind; }
/* 0x002041b0 */ void  config_set_softkb_onoff(u32 v)     { var_hddsys_softkb_onoff     = (s32)v; }
/* 0x002041c0 */ u32   config_get_softkb_onoff(void)      { return (u32)var_hddsys_softkb_onoff; }
/* 0x002041d0 */ void  config_set_softkb_qwert(u32 v)     { var_hddsys_softkb_qwert     = (s32)v; }
/* 0x002041e0 */ u32   config_get_softkb_qwert(void)      { return (u32)var_hddsys_softkb_qwert; }

/* ============================================================== */
/*  HDD config defaults / load / save                             */
/* ============================================================== */

/* 0x002041f0 — config_hdd_set_uninit
 * Marks every HDD-backed peripheral var as "not loaded" (0xffffffff). */
void config_hdd_set_uninit(void)
{
    var_hddsys_softkb_qwert     = -1;
    var_hddsys_keyboard_type    = -1;
    var_hddsys_keyboard_repeatw = -1;
    var_hddsys_keyboard_repeats = -1;
    var_hddsys_mouse_speed      = -1;
    var_hddsys_mouse_dblclk     = -1;
    var_hddsys_mouse_lr         = -1;
    var_hddsys_atok_mode        = -1;
    var_hddsys_atok_bind        = -1;
    var_hddsys_softkb_onoff     = -1;
}

/* 0x00204230 — config_get_keyboard_type_with_fallback
 * Returns a sane keyboard layout based on (vidmode, osd_language).
 * vidmode 0 → Japan kernel: only 0/1 valid
 * vidmode 1 → US/EU kernel: 1..9 valid, fallback per language
 * vidmode 2 → ?           : 1..9 valid, slightly different fallback table */
u32 config_get_keyboard_type_with_fallback(void)
{
    long vidmode = get_vidmode_with_fallback();
    u32 lang;

    if (vidmode == 0) {
        if ((u32)var_hddsys_keyboard_type < 2) {
            return (u32)var_hddsys_keyboard_type;
        }
        lang = config_get_osd_language();
        var_hddsys_keyboard_type = (lang == 1) ? 1 : 0;
        g_orig_keyboard_type = -1;
        return (u32)var_hddsys_keyboard_type;
    }

    /* vidmode 1 or 2: layout 1..9 already valid → keep */
    if ((u32)(var_hddsys_keyboard_type - 1) < 9) {
        return (u32)var_hddsys_keyboard_type;
    }

    lang = config_get_osd_language();
    if (vidmode == 2) {
        switch (lang) {
        case 1: var_hddsys_keyboard_type = 8; break;
        case 2: var_hddsys_keyboard_type = 2; break;
        case 3: var_hddsys_keyboard_type = 3; break;
        case 4: var_hddsys_keyboard_type = 4; break;
        case 5: var_hddsys_keyboard_type = 5; break;
        case 6: var_hddsys_keyboard_type = 6; break;
        case 7: var_hddsys_keyboard_type = 7; break;
        default: var_hddsys_keyboard_type = 8; break;
        }
    } else {
        switch (lang) {
        case 1: var_hddsys_keyboard_type = 1; break;
        case 2: var_hddsys_keyboard_type = 9; break;
        case 3: var_hddsys_keyboard_type = 3; break;
        case 4: var_hddsys_keyboard_type = 4; break;
        case 5: var_hddsys_keyboard_type = 5; break;
        case 6: var_hddsys_keyboard_type = 6; break;
        case 7: var_hddsys_keyboard_type = 7; break;
        default: var_hddsys_keyboard_type = 1; break;
        }
    }
    g_orig_keyboard_type = -1;
    return (u32)var_hddsys_keyboard_type;
}

/* 0x00204418 — config_hdd_set_default
 * Walks every peripheral var; if value is out of valid range,
 * clamps to the default and forces an "originals differ" marker
 * (-1) so the next save persists the corrected value. */
void config_hdd_set_default(void)
{
    config_get_keyboard_type_with_fallback();

    if ((u32)var_hddsys_keyboard_repeatw > 2) { g_orig_keyboard_repeatw = -1; var_hddsys_keyboard_repeatw = 1; }
    if ((u32)var_hddsys_keyboard_repeats > 2) { g_orig_keyboard_repeats = -1; var_hddsys_keyboard_repeats = 1; }
    if ((u32)var_hddsys_mouse_speed      > 2) { g_orig_mouse_speed      = -1; var_hddsys_mouse_speed      = 1; }
    if ((u32)var_hddsys_mouse_dblclk     > 2) { g_orig_mouse_dblclk     = -1; var_hddsys_mouse_dblclk     = 1; }
    if ((u32)var_hddsys_mouse_lr         > 1) { g_orig_mouse_lr         = -1; var_hddsys_mouse_lr         = 1; }
    if ((u32)var_hddsys_atok_mode        > 1) { var_hddsys_atok_mode    = 0;  g_orig_atok_mode            = -1; }
    if ((u32)var_hddsys_atok_bind        > 1) { var_hddsys_atok_bind    = 0;  g_orig_atok_bind            = -1; }
    if ((u32)var_hddsys_softkb_onoff     > 1) { g_orig_softkb_onoff     = -1; var_hddsys_softkb_onoff     = 1; }
    if ((u32)var_hddsys_softkb_qwert     > 1) { var_hddsys_softkb_qwert = 1;  g_orig_softkb_qwert         = -1; }
}

/* 0x00204598 — config_hdd_prepare
 * Loads all HDD-backed peripheral keys from the .ini file; any key that
 * fails to load is marked uninit (0xffffffff). Then applies defaults. */
void config_hdd_prepare(void)
{
    long rv;
    long ctx;

    config_hdd_set_uninit();
    rv = config_hdd_open_read_ini(g_hdd_ini_filename);
    if (rv < 0) {
        config_hdd_set_default();
        return;
    }

    ctx = FUN_002050a8();
    FUN_00206578(ctx);

    if (config_hdd_do_get_key(g_sec_keyboard, g_key_kbd_type,    (u32 *)&var_hddsys_keyboard_type,    0) < 0) var_hddsys_keyboard_type    = -1;
    if (config_hdd_do_get_key(g_sec_keyboard, g_key_kbd_repeatw, (u32 *)&var_hddsys_keyboard_repeatw, 0) < 0) var_hddsys_keyboard_repeatw = -1;
    if (config_hdd_do_get_key(g_sec_keyboard, g_key_kbd_repeats, (u32 *)&var_hddsys_keyboard_repeats, 0) < 0) var_hddsys_keyboard_repeats = -1;
    if (config_hdd_do_get_key(g_sec_mouse,    g_key_mouse_speed, (u32 *)&var_hddsys_mouse_speed,      0) < 0) var_hddsys_mouse_speed      = -1;
    if (config_hdd_do_get_key(g_sec_mouse,    g_key_mouse_dblclk,(u32 *)&var_hddsys_mouse_dblclk,     0) < 0) var_hddsys_mouse_dblclk     = -1;
    if (config_hdd_do_get_key(g_sec_mouse,    g_key_mouse_lr,    (u32 *)&var_hddsys_mouse_lr,         0) < 0) var_hddsys_mouse_lr         = -1;
    if (config_hdd_do_get_key(g_sec_atok,     g_key_atok_mode,   (u32 *)&var_hddsys_atok_mode,        0) < 0) var_hddsys_atok_mode        = -1;
    if (config_hdd_do_get_key(g_sec_atok,     g_key_atok_bind,   (u32 *)&var_hddsys_atok_bind,        0) < 0) var_hddsys_atok_bind        = -1;
    if (config_hdd_do_get_key(g_sec_softkb,   g_key_softkb_onoff,(u32 *)&var_hddsys_softkb_onoff,     0) < 0) var_hddsys_softkb_onoff     = -1;
    if (config_hdd_do_get_key(g_sec_softkb,   g_key_softkb_qwert,(u32 *)&var_hddsys_softkb_qwert,     0) < 0) var_hddsys_softkb_qwert     = -1;

    config_hdd_close_ini();
    config_hdd_set_default();
}

/* 0x00204928 — config_hdd_write_keys
 * For every peripheral var that differs from its load-time snapshot,
 * write it back. Returns 0 on success, -1 on first failure. */
u32 config_hdd_write_keys(void)
{
    long rv;

    if (var_hddsys_keyboard_type != g_orig_keyboard_type) {
        rv = config_hdd_write_single_key(g_sec_keyboard, g_key_kbd_type, (u32)var_hddsys_keyboard_type, 10);
        if (rv < 0) return (u32)-1;
    }
    if (var_hddsys_keyboard_repeatw != g_orig_keyboard_repeatw) {
        rv = config_hdd_write_single_key(g_sec_keyboard, g_key_kbd_repeatw, (u32)var_hddsys_keyboard_repeatw, 10);
        if (rv < 0) return (u32)-1;
    }
    if (var_hddsys_keyboard_repeats != g_orig_keyboard_repeats) {
        rv = config_hdd_write_single_key(g_sec_keyboard, g_key_kbd_repeats, (u32)var_hddsys_keyboard_repeats, 10);
        if (rv < 0) return (u32)-1;
    }
    if (var_hddsys_mouse_speed != g_orig_mouse_speed) {
        rv = config_hdd_write_single_key(g_sec_mouse, g_key_mouse_speed, (u32)var_hddsys_mouse_speed, 10);
        if (rv < 0) return (u32)-1;
    }
    if (var_hddsys_mouse_dblclk != g_orig_mouse_dblclk) {
        rv = config_hdd_write_single_key(g_sec_mouse, g_key_mouse_dblclk, (u32)var_hddsys_mouse_dblclk, 10);
        if (rv < 0) return (u32)-1;
    }
    if (var_hddsys_mouse_lr != g_orig_mouse_lr) {
        rv = config_hdd_write_single_key(g_sec_mouse, g_key_mouse_lr, (u32)var_hddsys_mouse_lr, 10);
        if (rv < 0) return (u32)-1;
    }
    if (var_hddsys_atok_mode != g_orig_atok_mode) {
        rv = config_hdd_write_single_key(g_sec_atok, g_key_atok_mode, (u32)var_hddsys_atok_mode, 10);
        if (rv < 0) return (u32)-1;
    }
    if (var_hddsys_atok_bind != g_orig_atok_bind) {
        rv = config_hdd_write_single_key(g_sec_atok, g_key_atok_bind, (u32)var_hddsys_atok_bind, 10);
        if (rv < 0) return (u32)-1;
    }
    if (var_hddsys_softkb_onoff != g_orig_softkb_onoff) {
        rv = config_hdd_write_single_key(g_sec_softkb, g_key_softkb_onoff, (u32)var_hddsys_softkb_onoff, 10);
        if (rv < 0) return (u32)-1;
    }
    if (var_hddsys_softkb_qwert != g_orig_softkb_qwert) {
        rv = config_hdd_write_single_key(g_sec_softkb, g_key_softkb_qwert, (u32)var_hddsys_softkb_qwert, 10);
        if (rv < 0) return (u32)-1;
    }
    return 0;
}

/* 0x00204b70 — config_mechacon_prepare
 * Reads the raw Mechacon config blob via sceCdReadConfig (one ROM page),
 * then unpacks it into both byte-stream and bitfield representations. */
u32 config_mechacon_prepare(void *out_bytes, void *out_packed)
{
    u32 rv;
    do_read_cdvd_config_entry(g_mechacon_raw_buf);
    rv = (u32)FUN_00203490(out_packed, g_mechacon_raw_buf);
    FUN_00203850(out_bytes, g_mechacon_raw_buf);
    return rv;
}

/* ============================================================== */
/*  Param 1 / Param 2 misc accessors                              */
/* ============================================================== */

/* 0x00204d58 — config_get_unused_204D58 (reads same field as get_osd_language) */
u32 config_get_unused_204D58(void)
{
    return (var_mechacon_config_param_1 >> 4) & 0x1f;
}

/* 0x00204d70 — config_set_unused_204D70 */
void config_set_unused_204D70(u32 v)
{
    var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0xfffffe0f)
                                | ((v & 0x1f) << 4);
}

/* 0x00204d98 — config_get_rc_gameplay (param2 bit 3) */
u32 config_get_rc_gameplay(void)
{
    return (var_mechacon_config_param_2 >> 3) & 1;
}

/* 0x00204db0 — config_set_rc_gameplay */
void config_set_rc_gameplay(u32 v)
{
    var_mechacon_config_param_2 = (var_mechacon_config_param_2 & 0xfffffff7)
                                | ((v & 1) << 3);
}

/* 0x00204dd8 — config_get_204DD8 (param2 bit 2 — likely osdInit OOBE flag) */
u32 config_get_204DD8(void)
{
    return (var_mechacon_config_param_2 >> 2) & 1;
}

/* 0x00204df0 — config_set_204DF0 */
void config_set_204DF0(u32 v)
{
    var_mechacon_config_param_2 = (var_mechacon_config_param_2 & 0xfffffffb)
                                | ((v & 1) << 2);
}

/* 0x00204e18 — config_get_dvdp_remote_control (rcEnabled, param2 bit 4) */
u32 config_get_dvdp_remote_control(void)
{
    return (var_mechacon_config_param_2 >> 4) & 1;
}

/* 0x00204e30 — config_set_dvdp_remote_control */
void config_set_dvdp_remote_control(u32 v)
{
    var_mechacon_config_param_2 = (var_mechacon_config_param_2 & 0xffffffef)
                                | ((v & 1) << 4);
}

/* 0x00204e58 — config_get_dvdp_support_clear_progressive (param2 bit 5) */
u32 config_get_dvdp_support_clear_progressive(void)
{
    return (var_mechacon_config_param_2 >> 5) & 1;
}

/* 0x00204e70 — config_set_dvdp_support_clear_progressive */
void config_set_dvdp_support_clear_progressive(u32 v)
{
    var_mechacon_config_param_2 = (var_mechacon_config_param_2 & 0xffffffdf)
                                | ((v & 1) << 5);
}

/* ============================================================== */
/*  HDD INI file open/close                                       */
/* ============================================================== */

/* 0x00204ea0 — config_hdd_open_write_ini
 * Pre-creates the .ini file (O_CREAT|O_WRONLY|O_TRUNC, mode 0666) so the
 * later writer can simply open existing. The handle is closed immediately. */
long config_hdd_open_write_ini(const char *path)
{
    long rv;
    int  res[4];

    while ((rv = fileops_cmd_open(path, 0x602, 0x1b6)) < 0) {
        nullsub_1(1);
    }
    fileops_get_cmd_result(0, 0, res);
    if (res[0] >= 0) {
        while ((rv = fileops_cmd_close(res[0])) < 0) {
            nullsub_1(1);
        }
        fileops_get_cmd_result(0, 0, 0);
        res[0] = 0;
        g_hdd_ini_last_err = 0;
    } else {
        g_hdd_ini_last_err = res[0];
    }
    return res[0];
}

/* 0x00204f38 — config_hdd_open_read_ini
 * Opens the .ini file for read-only and stashes the FD plus the path
 * (with a ".tmp" sibling for atomic rewrites) in module-global state. */
u32 config_hdd_open_read_ini(const char *path)
{
    long rv;
    int  res[4];

    g_hdd_ini_write_fd = -1;
    g_hdd_ini_last_err = 0;
    g_hdd_ini_read_fd  = -1;

    while ((rv = fileops_cmd_open(path, 1, 0x1b6)) < 0) {
        nullsub_1(1);
    }
    fileops_get_cmd_result(0, 0, res);
    if (res[0] < 0) {
        g_hdd_ini_last_err = res[0];
        return (u32)-1;
    }
    g_hdd_ini_read_fd = res[0];
    strcpy(g_hdd_ini_path, path);
    strcpy(g_hdd_ini_tmp_path, path);
    strcat(g_hdd_ini_tmp_path, aTmp);
    return 0;
}

/* 0x00204ff8 — config_hdd_close_ini */
long config_hdd_close_ini(void)
{
    long rv;

    if (g_hdd_ini_write_fd >= 0) {
        while ((rv = fileops_cmd_close(g_hdd_ini_write_fd)) < 0) nullsub_1(1);
        fileops_get_cmd_result(0, 0, 0);
    }
    if (g_hdd_ini_read_fd >= 0) {
        while ((rv = fileops_cmd_close(g_hdd_ini_read_fd)) < 0) nullsub_1(1);
        fileops_get_cmd_result(0, 0, 0);
    }
    return 0;
}

/* 0x00206630 — config_hdd_do_get_key
 * Parses one INI key into *out as a 32-bit integer. Auto-detects
 * base from prefix: "0x" hex, "0" octal, otherwise decimal.
 * Optional leading +/- sign. base_out (if non-null) receives the
 * detected base for round-trip writeback. Returns 0 ok, -4 parse err. */
long config_hdd_do_get_key(const char *sec, const char *key, u32 *out, int *base_out)
{
    int  iVar1;
    long lVar2;
    long c;
    long valid;
    u32  acc;
    int  sign;
    u32  mask;
    long after;

    int rv;

    if ((rv = FUN_00206080(sec)) < 0) return rv;
    if ((rv = FUN_002062a8(key)) < 0) return rv;

    acc = 0;
    c = FUN_00205720();
    sign = 0;
    if (c == '-') { sign = -1; c = FUN_00205720(); }
    else if (c == '+') { sign =  1; c = FUN_00205720(); }

    if (c == '0') {
        long lookahead = FUN_00205720();
        long is_x = FUN_00205ba8(lookahead);
        if (is_x == 'x') {
            if (base_out) *base_out = 16;
            mask = (sign == 0) ? 0xffffffff : 0x7fffffff;
            for (;;) {
                long ch, stop, lc;
                ch  = FUN_00205720();
                stop = FUN_00205c40(ch);
                if (stop || FUN_00205c80(ch) || FUN_00205ca8(ch)) break;
                lc  = FUN_00205ba8(ch);
                if (FUN_00205c10(lc) == 0) return -4;
                iVar1 = (lc < 0x61) ? (acc * 16 - 0x30) : (acc * 16 - 0x57);
                acc = (iVar1 + (int)lc) & mask;
            }
        } else {
            if (base_out) *base_out = 8;
            FUN_00205798();
            mask = (sign == 0) ? 0xffffffff : 0x7fffffff;
            for (;;) {
                long ch = FUN_00205720();
                if (FUN_00205c40(ch) || FUN_00205c80(ch) || FUN_00205ca8(ch)) break;
                if (FUN_00205c00(ch) == 0) return -4;
                acc = (acc * 8 + (int)ch - 0x30) & mask;
            }
        }
    } else {
        if (FUN_00205bf0(c) == 0) return -4;
        if (base_out) *base_out = 10;
        FUN_00205798();
        for (;;) {
            long ch = FUN_00205720();
            if (FUN_00205c40(ch) || FUN_00205c80(ch) || FUN_00205ca8(ch)) break;
            if (FUN_00205bf0(ch) == 0) return -4;
            acc = (acc * 10 + (int)ch - 0x30) & 0x7fffffff;
        }
    }
    FUN_00205798();
    *out = (sign < 0) ? (u32)(-(s32)acc) : acc;
    FUN_00205df8();
    after = FUN_00205720();
    valid = FUN_00205c40(after);
    lVar2 = valid ? 0 : -4;
    return lVar2;
}

/* 0x00206be0 — config_hdd_write_single_key
 * Writes "<key>=<value>\n" line into the INI's tmp file, where the
 * value is rendered in `base` via the FUN_002076f0 number formatter. */
long config_hdd_write_single_key(const char *sec, const char *key, u32 val, int base)
{
    long rv;
    u8   buf[16];
    u8  *p = buf;
    int remain;

    if ((rv = FUN_002057c0(sec)) < 0) return rv;
    if ((rv = FUN_002059c0(sec, key)) < 0) { FUN_00205808(); return rv; }

    rv = FUN_002076f0(val, buf, base);
    remain = (int)rv - 1;
    if (rv < 0) { FUN_00205808(); return -6; }

    if (remain != -1) {
        for (;;) {
            p++;
            rv = FUN_002058a8(buf[0]);
            remain--;
            if (rv < 0) break;
            if (remain == -1) goto commit;
            buf[0] = *p;
        }
        FUN_00205808();
        return rv;
    }
commit:
    rv = FUN_00205aa0();
    if (rv < 0) { FUN_00205808(); return rv; }
    rv = FUN_00205858();
    return (rv < 0) ? rv : 0;
}

/* ============================================================== */
/*  Misc — language table, timezone validation, dirty-bit          */
/* ============================================================== */

/* 0x00208170 — config_set_langtbl
 * Persists Japanese-language flag and swaps the global string-table pointer
 * to the language pack at langtblptrs[index]. */
u32 config_set_langtbl(int index)
{
    config_set_jpn_language((u32)index);
    PTR_langtbl_english_002ad220 = langtblptrs[index];
    return 0;
}

/* 0x0020c8e0 — config_check_timezone_city
 * Linear-search the timezone-city table (entries are 0x18 bytes; offset 0
 * within an entry is the city ID byte). Returns the table index if found,
 * -1 otherwise. */
long config_check_timezone_city(u32 city)
{
    int i;
    for (i = 0; i < g_timezone_city_count; i++) {
        if ((u8)city == g_timezone_city_table[i * 0x18 + 2]) {
            return i;
        }
    }
    return -1;
}

/* 0x002352c0 — config_mark_dirty */
void config_mark_dirty(void)
{
    var_config_dirty = 1;
}

/* ============================================================== */
/*  Clock/Settings UI mirror — load from / save to NVRAM           */
/* ============================================================== */

/* 0x00234f88 — config_load_clock_osd
 * Snapshots every Mechacon/HDD config field into the var_config_*
 * mirror block used by the clock+settings UI. Only runs the first
 * time it's called per session (gated by g_config_load_first_pass=1);
 * subsequent calls only refresh the live clock fields. */
void config_load_clock_osd(void)
{
    int i;
    u8 *src;
    u32 *dst;
    float f;
    u32 tz, dst_;

    if (g_config_load_first_pass == 1) {
        var_config_spdif_mode                       = (s32)config_get_spdif_mode();
        var_config_aspect_ratio                     = (s32)config_get_aspect_ratio();
        var_config_video_output                     = (s32)config_get_video_output();
        var_config_osd_language                     = (s32)thunk_config_get_osd_language();
        var_config_time_format                      = (s32)config_get_time_format();
        var_config_date_format                      = (s32)config_get_date_format();
        var_config_timezone_city                    = (s32)config_get_timezone_city();
        var_config_daylight_saving                  = (s32)config_get_daylight_saving();
        var_config_diagnosis                        = (s32)(var_diagnosis & 1);
        var_config_keyboard_type                    = (s32)config_get_keyboard_type();
        var_config_keyboard_repeatw                 = (s32)config_get_keyboard_repeatw();
        var_config_keyboard_repeats                 = (s32)config_get_keyboard_repeats();
        var_config_mouse_speed                      = (s32)config_get_mouse_speed();
        var_config_mouse_dblclk                     = (s32)config_get_mouse_dblclk();
        var_config_mouse_lr                         = (s32)config_get_mouse_lr();
        var_config_atok_mode                        = (s32)config_get_atok_mode();
        var_config_atok_bind                        = (s32)config_get_atok_bind();

        /* Unpack PS1DRV byte array: each byte → two mirror words (low nibble[2:0]
         * and high nibble[6:4]) walked in lock-step. 15 entries (0..14). */
        dst = &var_config_ps1drv_low[0]; /* = (u32 *)0x004091ac, working backwards */
        src = &var_ps1drv_config;
        i = 0xe;
        do {
            u8 byte;
            i--;
            dst[-1] = (u32)(*src & 0x07);          /* low nibble field */
            byte = *src;
            src++;
            *dst    = (u32)((byte & 0x70) >> 4);   /* high nibble field */
            dst    += 2;
        } while (i >= 0);

        tz   = (u32)config_get_timezone_offset();
        dst_ = config_get_daylight_saving();
        module_clock_set_anim_offset(tz, dst_);

        g_config_204DD8_mirror                      = (s32)config_get_204DD8();
        var_config_rc_gameplay                      = (s32)config_get_rc_gameplay();
        var_config_dvdp_remote_control              = (s32)config_get_dvdp_remote_control();
        var_config_dvdp_support_clear_progressive   = (s32)config_get_dvdp_support_clear_progressive();
        g_dvdp_reset_progressive_mirror             = (s32)dvdplayer_should_reset_progressive;
    }

    /* Refresh live clock fields every call */
    g_clock_year  = (s32)FUN_002357c0();
    g_clock_month = (s32)FUN_002357b0();
    g_clock_day   = (s32)FUN_002357a0();
    f = FUN_00235730(); g_clock_hour = (int)f;
    f = FUN_00235650(); g_clock_min  = (int)f;
    f = FUN_002355a0(); g_clock_sec  = (int)f;
}

/* 0x00235170 — config_item_change_cb_clock_write_mechacon
 * Callback fired when the user edits a clock field in the settings UI.
 * Reads the six clock mirror values, normalises them via FUN_002148b8,
 * BCD-encodes each (FUN_00235138), and stamps them into the Mechacon RTC
 * RAM area at 0x001f0d11..0x001f0d17. Sets clock-dirty so the next
 * sync flushes them to the real RTC. */
void config_item_change_cb_clock_write_mechacon(void)
{
    u32 time[6];

    time[0] = g_clock_year;
    time[1] = g_clock_month;
    time[2] = g_clock_day;
    time[3] = g_clock_hour;
    time[4] = g_clock_min;
    time[5] = g_clock_sec;

    FUN_002148b8(&time[0], &time[1], &time[2], &time[3], &time[4], &time[5]);

    uRam001f0d17 = FUN_00235138((int)time[0] % 100);
    bRam001f0d16 = FUN_00235138(time[1]) | 0x80;
    bRam001f0d15 = FUN_00235138(time[2]);
    bRam001f0d13 = FUN_00235138(time[3]);
    uRam001f0d12 = FUN_00235138(time[4]);
    uRam001f0d11 = FUN_00235138(time[5]);
    var_clock_is_dirty = 1;

    /* Snapshot raw values for later diffing/writeback */
    iRam001f0d1c = time[0];
    uRam001f0d20 = time[1];
    uRam001f0d24 = time[2];
    uRam001f0d28 = time[3];
    uRam001f0d2c = time[4];
    uRam001f0d30 = time[5];
}

/* 0x002352d0 — config_save_clock_osd
 * Flushes every dirty UI mirror back into the Mechacon NVRAM (and the
 * .ini-backed peripherals). Skipped when no change pending or a write
 * is already queued. Returns 0 always. */
u32 config_save_clock_osd(void)
{
    long rv;
    u32 tz, dst;

    if (var_config_dirty == 0)              return 0;
    if (var_config_writeinprogress != 0)    return 0;
    if (FUN_00212320() == 0)                return 0;

    config_set_spdif_mode((u32)var_config_spdif_mode);
    config_set_aspect_ratio((u32)var_config_aspect_ratio);
    config_set_video_output((u32)var_config_video_output);
    config_set_langtbl(var_config_osd_language);
    config_set_time_format((u32)var_config_time_format);
    config_set_date_format((u32)var_config_date_format);
    config_set_timezone_city((u32)var_config_timezone_city);

    /* If user picked a known city, derive the offset from its table entry */
    if (config_check_timezone_city((u32)var_config_timezone_city) != -1) {
        u32 off = (u32)get_timezone_info_struct();
        config_set_timezone_offset(off);
    }
    config_set_daylight_saving((u32)var_config_daylight_saving);

    tz = (u32)config_get_timezone_offset();
    dst = config_get_daylight_saving();
    module_clock_set_anim_offset(tz, dst);

    config_set_rc_gameplay((u32)var_config_rc_gameplay);
    config_set_204DF0((u32)g_config_204DD8_mirror);
    config_set_dvdp_remote_control((u32)var_config_dvdp_remote_control);
    config_set_dvdp_support_clear_progressive((u32)var_config_dvdp_support_clear_progressive);
    dvdplayer_should_reset_progressive = (u32)g_dvdp_reset_progressive_mirror;

    config_set_keyboard_type((u32)var_config_keyboard_type);
    config_set_keyboard_repeatw((u32)var_config_keyboard_repeatw);
    config_set_keyboard_repeats((u32)var_config_keyboard_repeats);
    config_set_mouse_speed((u32)var_config_mouse_speed);
    config_set_mouse_dblclk((u32)var_config_mouse_dblclk);
    config_set_mouse_lr((u32)var_config_mouse_lr);
    config_set_atok_mode((u32)var_config_atok_mode);
    config_set_atok_bind((u32)var_config_atok_bind);

    /* Submit async write callback @ 0x00203ad8; on success clear dirty bit */
    rv = callback_queue_submit(0x203ad8, 0);
    var_config_writeinprogress = (s32)rv;
    if (rv != 0) var_config_dirty = 0;
    return 0;
}
