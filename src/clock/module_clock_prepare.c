typedef struct {
    int status;
    void *func;
    void *stack;
    int stack_size;
    void *gp_reg;
    int initial_priority;
    int current_priority;
    unsigned int attr;
    unsigned int option;
} ee_thread_t;

extern int CreateThread(ee_thread_t *);
extern void StartThread(int, void *);
extern void module_clock_thread_proc(void);
extern char D_003E0B10[];
extern char module_gp_area[];

int module_clock_prepare(void) {
    ee_thread_t param;
    param.func = module_clock_thread_proc;
    param.stack = D_003E0B10;
    param.stack_size = 0x20000;
    param.gp_reg = module_gp_area;
    param.initial_priority = 6;
    
    int thid = CreateThread(&param);
    StartThread(thid, 0);
    return thid;
}
