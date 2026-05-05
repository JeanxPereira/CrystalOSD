struct ArgsList {
    char *args[16];
};
extern struct ArgsList D_00347B50;

void deinit_2019B0(int);
void sceSifExitRpc(void);
void sceSifRebootIop(const char*);
int sceSifSyncIop(void);
void sceSifInitRpc(int);
void ExecPS2(void*, void*, int, char**);

extern const char D_003479F8[];

int ExecuteHDDBOOT(int argc, char** argv) {
    struct ArgsList local_args = D_00347B50;
    int iVar3 = 1;
    
    if (1 < argc) {
        do {
            local_args.args[iVar3] = argv[iVar3];
            iVar3++;
            if (15 < iVar3) break;
        } while (iVar3 < argc);
    }
    
    deinit_2019B0(0);
    sceSifExitRpc();
    sceSifRebootIop(D_003479F8);
    while (sceSifSyncIop() == 0) {}
    sceSifInitRpc(0);
    ExecPS2((void*)0x100000, 0, iVar3, local_args.args);
    return 0;
}
