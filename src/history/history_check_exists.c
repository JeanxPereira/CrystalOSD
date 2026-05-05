/* CrystalOSD — History subsystem
 *
 * 0x002079D0 - history_check_exists
 *
 * Probes a memory card port for the OSDSYS history file.
 * Returns 0 on success (file present and read into 0x1F0198),
 * -1 on any failure (no card / wrong type / unformatted / open or
 * read failure).
 */

#include <stdio.h>
#include <libmc.h>

extern char *get_system_folder_name(void);

extern char path_buf_382B80[];

int history_check_exists(int port)
{
    int type;
    int format;
    int result;
    int fd;
    int close_result;

    sceMcGetInfo(port, 0, &type, 0, &format);
    sceMcSync(0, 0, &result);
    if (result < -1) return -1;
    if (type != 2)   return -1;
    if (format) goto has_card;
    return -1;
has_card:
    sprintf(path_buf_382B80, "%s%s", get_system_folder_name(), "history");

    fd = sceMcOpen(port, 0, path_buf_382B80, 1);
    sceMcSync(0, 0, &fd);
    if (fd < 0) goto fail;
    sceMcRead(fd, (void *)0x1F0198, 0x1CE);
    sceMcSync(0, 0, &result);
    if (result < 0) {
        close_result = sceMcClose(fd);
        sceMcSync(0, 0, &close_result);
        return result;
    }
    sceMcClose(fd);
    sceMcSync(0, 0, &result);
    return result > -1 ? 0 : result;
fail:
    return -1;
}
