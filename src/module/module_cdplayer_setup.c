/* 0x00209790 - module_cdplayer_setup */

typedef struct {
    void *prepare;
    void *unk4;
    void *getdesc;
    void *getversion;
    void *option_str;
    void *pathrelated;
    void *unk18;
} ModuleInfo;

extern void module_cdplayer_prepare(void);
extern void module_cdplayer_getdesc(void);
extern void module_cdplayer_getversion(void);
extern void module_cdplayer_option_str(void);
extern void module_cdplayer_pathrelated(void);
extern void func_00208450(ModuleInfo*);

void module_cdplayer_setup(void) {
    ModuleInfo info;
    info.prepare = module_cdplayer_prepare;
    info.unk4 = 0;
    info.getdesc = module_cdplayer_getdesc;
    info.getversion = module_cdplayer_getversion;
    info.option_str = module_cdplayer_option_str;
    info.pathrelated = module_cdplayer_pathrelated;
    info.unk18 = 0;
    func_00208450(&info);
}
