/* CrystalOSD — History subsystem
 *
 * 0x002079D0 - history_check_exists
 */

int history_check_exists(int port)
{
    int type;
    int free;
    int result;
    int fd;
    int close_result;

    sceMcGetInfo(port, 0, &type, 0, &free);
    sceMcSync(0, 0, &result);
    if (result < -1) return -1;
    if (type != 2)   return -1;
    if (!free)       return -1;

    sprintf(D_00382B80, aSS_0, get_system_folder_name(), aHistory);

    fd = sceMcOpen(port, 0, D_00382B80, 1);
    sceMcSync(0, 0, &fd);
    if (fd < 0) return fd;

    sceMcRead(fd, (void *)0x1F0198, 0x1CE);
    sceMcSync(0, 0, &result);
    if (result < 0) {
        close_result = sceMcClose(fd);
        sceMcSync(0, 0, &close_result);
        return result;
    }
    sceMcClose(fd);
    sceMcSync(0, 0, &result);
    if (result > -1)
        result = 0;
    return result;
}
