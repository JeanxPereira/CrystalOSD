/* 0x0020A860 - module_smap_getdesc */

char *get_lang_string_GetOSDString_hkdosd_p2_tgt(int id);

char *module_smap_getdesc(void) {
    return get_lang_string_GetOSDString_hkdosd_p2_tgt(0x19A);
}
