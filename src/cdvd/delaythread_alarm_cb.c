extern int delaythread_sema_371800;
int iSignalSema(int);

int delaythread_alarm_cb(void) {
    return iSignalSema(delaythread_sema_371800);
}
