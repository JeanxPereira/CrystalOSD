/* 0x00209600 - module_cdplayer_getdesc */

char *get_lang_string_GetOSDString_hkdosd_p2_tgt(int id);

char *module_cdplayer_getdesc(void) {
    return get_lang_string_GetOSDString_hkdosd_p2_tgt(0x66);
}
