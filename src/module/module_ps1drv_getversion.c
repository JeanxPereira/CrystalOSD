/* 0x00209C30 - module_ps1drv_getversion */

extern char ps1drv_ver_bytes[];

char *module_ps1drv_getversion(void) {
    return ps1drv_ver_bytes;
}
