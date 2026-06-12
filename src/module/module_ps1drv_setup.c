/* 0x00209DE0 - module_ps1drv_setup */

typedef struct {
    void *prepare;
    void *unk4;
    void *getname;
    void *getversion;
    void *option_str;
    void *pathrelated;
    void *unk24;
} ModuleInfo;

extern void module_ps1drv_prepare(void);
extern void module_ps1drv_getname(void);
extern void module_ps1drv_getversion(void);
extern void module_ps1drv_option_str(void);
extern void module_ps1drv_pathrelated(void);
extern void func_00208450(ModuleInfo*);

void module_ps1drv_setup(void) {
    ModuleInfo info;
    info.prepare = module_ps1drv_prepare;
    info.unk4 = 0;
    info.getname = module_ps1drv_getname;
    info.getversion = module_ps1drv_getversion;
    info.option_str = module_ps1drv_option_str;
    info.pathrelated = module_ps1drv_pathrelated;
    info.unk24 = 0;
    func_00208450(&info);
}
