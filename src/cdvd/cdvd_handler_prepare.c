typedef struct {
    int count;
    int max;
    int init;
    int num;
    int attr;
    int option;
} ee_sema_t;

typedef struct {
    int status;
    void* entry;
    void* stack;
    int stackSize;
    void* gpReg;
    int initPriority;
    int currentPriority;
    int attr;
    unsigned int option;
} ee_thread_t;

struct cdvd_ctx {
    int sema0;
    int sema1;
    int sema2;
    int pad0;
    int pad1;
    int field_14;
    int thread_id;
    int field_1C;
    int field_20;
    int field_24;
    int field_28;
};

struct unksema_392930_t {
    int sema;
    int unk4;
};

extern struct cdvd_ctx unksema_392900;
extern struct unksema_392930_t unksema_392930;

extern char cdvd_handler_thread_stack[];
extern char module_gp_area[];
void cdvd_handler_thread_proc(void);
void callback_211A28(void);

int CreateSema(ee_sema_t*);
int CreateThread(ee_thread_t*);
void sema_related_2118A8(int);
void FUN_002118e0(int);
void sceCdPOffCallback(void*, int);
void StartThread(int, int);

int cdvd_handler_prepare(int param_1) {
    ee_sema_t sema;
    ee_thread_t thp;
    int uVar1;

    unksema_392900.field_1C = 0;
    unksema_392900.field_24 = 100;
    unksema_392900.field_14 = 0;
    unksema_392900.field_20 = 0;
    unksema_392900.field_28 = 0;

    sema.max = 1;
    sema.init = 0;
    sema.option = 0;
    unksema_392900.sema0 = CreateSema(&sema);

    sema.max = 1;
    sema.init = 0;
    sema.option = 0;
    unksema_392900.sema1 = CreateSema(&sema);

    sema.max = 1;
    sema.init = 0;
    sema.option = 0;
    unksema_392900.sema2 = CreateSema(&sema);

    thp.entry = cdvd_handler_thread_proc;
    thp.stack = cdvd_handler_thread_stack;
    thp.stackSize = 0x2000;
    thp.gpReg = module_gp_area;
    thp.initPriority = param_1;
    unksema_392900.thread_id = CreateThread(&thp);

    sema_related_2118A8(1);
    FUN_002118e0(1);

    sema.max = 1;
    sema.init = 0;
    sema.option = 0;
    uVar1 = CreateSema(&sema);
    unksema_392930.sema = uVar1;
    unksema_392930.unk4 = 0;
    
    sceCdPOffCallback(callback_211A28, uVar1);
    
    StartThread(unksema_392900.thread_id, 0);
    return 0;
}
