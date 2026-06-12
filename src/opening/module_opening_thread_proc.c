/* 0x0021ABD0 - module_opening_thread_proc */

extern void SleepThread(void);
extern void opening_thread_set_vars(void);
extern void opening_thread_set_vars_2(void);
extern void OpeningInit(void);
extern int func_002118E0(int a0);
extern void OpeningDoOpeningIllegal(void);
extern void opening_transition_to_clock(void);
extern void SignalSema(int sema_id);

extern int D_00370004;
extern int threadid_2AE5D8[];

void module_opening_thread_proc(void) {
    while (1) {
        SleepThread();
        opening_thread_set_vars();
        opening_thread_set_vars_2();
        OpeningInit();

        if (D_00370004 == 0) {
            func_002118E0(0);
        } else {
            func_002118E0(1);
        }

        OpeningDoOpeningIllegal();
        opening_transition_to_clock();
        func_002118E0(1);

        SignalSema(threadid_2AE5D8[5]);
    }
}
