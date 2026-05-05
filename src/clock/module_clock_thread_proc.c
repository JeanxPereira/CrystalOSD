extern void SleepThread(void);
extern void sound_handler_queue_cmd(int, int, int, int);
extern void module_clock_23A068(void);
extern void module_clock_225D98(void);
extern void clock_stuff1(void);
extern void clock_input_check_handler_p6_p7_tgt(void);
extern void SignalSema(int);

extern int threadid_2AE5D8[];

void module_clock_thread_proc(void) {
    SleepThread();
    sound_handler_queue_cmd(0x6150, 1, 0, 0);
    module_clock_23A068();
    module_clock_225D98();
    
    while (1) {
        clock_stuff1();
        clock_input_check_handler_p6_p7_tgt();
        SignalSema(threadid_2AE5D8[5]);
        SleepThread();
    }
}
