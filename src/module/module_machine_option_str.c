/* 0x002093D0 - module_machine_option_str */

extern char *get_lang_string_GetOSDString_hkdosd_p2_tgt(int id);
extern char *module_update_parse_option_desc_str(char *desc, int a1, int a2, int a3);

char *module_machine_option_str(int a0, int a1, int a2, int a3) {
    char *desc;
    if (a1 == -2) {
        return 0;
    }
    desc = get_lang_string_GetOSDString_hkdosd_p2_tgt(0x64);
    return module_update_parse_option_desc_str(desc, a0, a1, a2);
}
