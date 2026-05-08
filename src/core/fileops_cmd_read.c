typedef struct {
    char pad[0x1C10];
    int fd;
    char pad2[8];
    int buf;
    int count;
} FileopsState;

extern int fileops_send_cmd(int);
extern int SignalSema(int);
extern FileopsState D_0038E7C0;
extern int fileops_sema1;

/* 0x0020EB68 - fileops_cmd_read */
int fileops_cmd_read(int fd, int buf, int count) {
    int ret = fileops_send_cmd(3);
    if (ret < 0) {
        return ret;
    }
    D_0038E7C0.count = count;
    D_0038E7C0.fd = fd;
    D_0038E7C0.buf = buf;
    SignalSema(fileops_sema1);
    return 0;
}
