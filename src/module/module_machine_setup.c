/* 0x00209438 - module_machine_setup */

typedef struct {
    void *prepare;
    void *unk4;
    void *getdesc;
    void *getversion;
    void *option_str;
    void *pathrelated;
    void *unk18;
} ModuleInfo;

extern void module_machine_prepare(void);
extern void module_machine_getdesc(void);
extern void module_machine_getversion(void);
extern void module_machine_option_str(void);
extern void func_00208450(ModuleInfo*);

void module_machine_setup(void) {
    ModuleInfo info;
    info.prepare = module_machine_prepare;
    info.unk4 = 0;
    info.getdesc = module_machine_getdesc;
    info.getversion = module_machine_getversion;
    info.option_str = module_machine_option_str;
    info.pathrelated = 0;
    info.unk18 = 0;
    func_00208450(&info);
}
