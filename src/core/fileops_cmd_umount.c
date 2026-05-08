extern int fileops_send_cmd(int);
extern char *strcpy(char *, const char *);
extern int SignalSema(int);
extern char D_0038E7C0[];
extern int fileops_sema1;

/* 0x0020F698 - fileops_cmd_umount */
int fileops_cmd_umount(char *path) {
    int ret = fileops_send_cmd(0x16);
    if (ret < 0) {
        return ret;
    }
    strcpy(D_0038E7C0, path);
    SignalSema(fileops_sema1);
    return 0;
}
