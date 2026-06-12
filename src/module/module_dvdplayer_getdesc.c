/* 0x0020A100 - module_dvdplayer_getdesc */

char *get_lang_string_GetOSDString_hkdosd_p2_tgt(int id);

char *module_dvdplayer_getdesc(void) {
    return get_lang_string_GetOSDString_hkdosd_p2_tgt(0x61);
}
