/* CrystalOSD — CDVD Configuration Interface
 *
 * Reconstructed from Ghidra analysis of HDDOSD 1.10U OSDSYS.elf
 * Part of the config subsystem — handles reading/writing CDVD NVRAM entries.
 *
 * References:
 *   PS2SDK: libcdvd (sceCdOpenConfig, sceCdReadConfig, sceCdCloseConfig)
 *   PCSX2: CDVD/CdRom.cpp
 */

#include <kernel.h>
#include <libcdvd.h>

/* 0x002038B0 - do_read_cdvd_config_entry
 *
 * Reads a single CDVD config entry from the mechacon NVRAM.
 * Retries both open/read/close operations when the CDVD is busy
 * (status bits 0x81 = tray open | command executing).
 *
 * @param buf    Output buffer for the config data (15 bytes)
 */
void do_read_cdvd_config_entry(void *buf)
{
    int ret;
    u32 stat[4];

    /* Open config block: mode=1 (read), num_blocks=0, offset=2 */
    do {
        do {
            ret = sceCdOpenConfig(1, 0, 2, stat);
        } while (stat[0] & 0x81);
    } while (ret == 0);

    /* Read the config data */
    do {
        do {
            ret = sceCdReadConfig(buf, stat);
        } while (stat[0] & 0x81);
    } while (ret == 0);

    /* Close config */
    do {
        do {
            ret = sceCdCloseConfig(stat);
        } while (stat[0] & 0x81);
    } while (ret == 0);
}
