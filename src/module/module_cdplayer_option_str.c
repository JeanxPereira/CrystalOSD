/* 0x00209630 - module_cdplayer_option_str */

extern char cdplayer_path;
extern int cdplayer_opt_bytes;
extern char *get_module_update_config(int *opt_bytes, int a1, int a2, int a3);

char *module_cdplayer_option_str(int a0, int a1, int a2, int a3) {
    char v1 = cdplayer_path;
    if (v1 != 0) {
        return get_module_update_config(&cdplayer_opt_bytes, a0, a1, a2);
    }
    return 0;
}
