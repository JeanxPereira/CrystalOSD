/* 0x0020A938 - module_smap_setup */

typedef struct {
    void *prepare;
    void *unk4;
    void *getdesc;
    void *getversion;
    void *option_str;
    void *pathrelated;
    void *unk18;
} ModuleInfo;

extern void module_smap_prepare(void);
extern void module_smap_getdesc(void);
extern void module_smap_getver(void);
extern void func_00208450(ModuleInfo*);

void module_smap_setup(void) {
    ModuleInfo info;
    info.prepare = module_smap_prepare;
    info.unk4 = 0;
    info.getdesc = module_smap_getdesc;
    info.getversion = module_smap_getver;
    info.option_str = 0;
    info.pathrelated = 0;
    info.unk18 = 0;
    func_00208450(&info);
}
