typedef struct {
    void *prepare;
    void *unk4;
    void *getdesc;
    void *getversion;
    void *unk10;
    void *unk14;
    void *unk18;
} ModuleInfo;

extern void module_clock_prepare(void);
extern void module_clock_getdesc(void);
extern void module_clock_getversion(void);
extern void func_00208408(ModuleInfo*);

void module_clock_setup(void) {
    ModuleInfo info;
    info.prepare = module_clock_prepare;
    info.unk4 = 0;
    info.getdesc = module_clock_getdesc;
    info.getversion = module_clock_getversion;
    info.unk10 = 0;
    info.unk14 = 0;
    info.unk18 = 0;
    func_00208408(&info);
}
