int module_clock_config_ps1drv_get_value(int arg0) {
    unsigned char *D_001F1284 = (unsigned char *)0x1F1284;
    if (arg0 & 1) {
        return (D_001F1284[arg0 / 2] >> 4) & 7;
    }
    return D_001F1284[arg0 / 2] & 7;
}
