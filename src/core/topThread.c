extern int WaitSema(int);
extern int WakeupThread(int);
extern int RotateThreadReadyQueue(int);
extern int SuspendThread(int);
extern int kprintf(const char *, ...);

extern char aInternelErrorI_1[];
extern int topSema;

typedef struct {
    int counter;
    int pad;
    unsigned char queue[1024];
} TopArg;

/* 0x00280590 - topThread */
void topThread(TopArg *arg) {
    int idx;
    int cmd;
    unsigned char *cmd_base;
    unsigned char *tid_base;

    cmd_base = arg->queue;
    tid_base = arg->queue + 1;
    while (1) {
        WaitSema(topSema);
        idx = arg->counter & 0x1FF;
        arg->counter = idx + 1;
        idx <<= 1;
        cmd = cmd_base[idx];
        switch (cmd) {
        case 1:
            RotateThreadReadyQueue(tid_base[idx]);
            break;
        case 0:
            WakeupThread(tid_base[idx]);
            break;
        case 2:
            SuspendThread(tid_base[idx]);
            break;
        default:
            kprintf(aInternelErrorI_1);
            break;
        }
    }
}
