/* 0x00209620 - module_cdplayer_getversion */

extern void *cdplayer_version;

void *module_cdplayer_getversion(void) {
    return &cdplayer_version;
}
