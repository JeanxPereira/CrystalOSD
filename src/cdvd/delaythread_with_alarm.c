typedef struct {
    int count;
    int max;
    int init;
    int num;
    int attr;
    int option;
} ee_sema_t;

extern int delaythread_sema_371800;
void delaythread_alarm_cb(void);

int CreateSema(ee_sema_t*);
void SetAlarm(unsigned short, void (*)(void), int);
void WaitSema(int);
void DeleteSema(int);

int delaythread_with_alarm(int param_1) {
    ee_sema_t sema;
    int* ptr = &delaythread_sema_371800;
    
    sema.max = 1;
    sema.init = 0;
    *ptr = CreateSema(&sema);
    if (*ptr < 0) {
        return -1;
    } else {
        SetAlarm(param_1, delaythread_alarm_cb, 0);
        WaitSema(*ptr);
        DeleteSema(*ptr);
        return 1;
    }
}
