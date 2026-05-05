extern int cdvd_cbloop_thread;
extern int sceCdCbfunc_num;
extern int cdrelated_sema_32E220;
extern int _sceCd_ncmd_semid;
extern int _sceCd_scmd_semid;

void SignalSema(int);
void DeleteSema(int);
int DIntr(void);
int EIntr(void);
void sceSifRemoveCmdHandler(unsigned int);

void cdvd_exit(void) {
    int *s0 = &cdrelated_sema_32E220;
    int *v0 = &_sceCd_ncmd_semid;
    if (cdvd_cbloop_thread != 0) {
        sceCdCbfunc_num = -1;
        SignalSema(*s0);
    }
    DeleteSema(*v0);
    DeleteSema(_sceCd_scmd_semid);
    DeleteSema(*s0);
    DIntr();
    sceSifRemoveCmdHandler(0x80000012);
    EIntr();
}
