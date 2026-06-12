/* 0x0021AB88 - module_dummy_setup */

typedef struct {
    void *prepare;
    void *unk4;
    void *getdesc;
    void *getversion;
    void *option_str;
    void *pathrelated;
    void *unk18;
} ModuleInfo;

extern void module_opening_getdesc(void);
extern void module_opening_getversion(void);
extern void func_00208450(ModuleInfo*);

void module_dummy_setup(void) {
    ModuleInfo info;
    info.prepare = 0;
    info.unk4 = 0;
    info.getdesc = module_opening_getdesc;
    info.getversion = module_opening_getversion;
    info.option_str = 0;
    info.pathrelated = 0;
    info.unk18 = 0;
    func_00208450(&info);
}
