/* 0x002093C0 - module_machine_getversion */

extern char machine_name[];

char *module_machine_getversion(void) {
    return machine_name;
}
