/* 0x0020A780 - module_dvdplayer_setup */

typedef struct {
    void *prepare;
    void *unk4;
    void *getdesc;
    void *getver;
    void *option_str;
    void *pathrelated;
    void *unk18;
} ModuleInfo;

extern void module_dvdplayer_prepare(void);
extern void module_dvdplayer_getdesc(void);
extern void module_dvdplayer_getver(void);
extern void module_dvdplayer_option_str(void);
extern void module_dvdplayer_pathrelated(void);
extern void func_00208450(ModuleInfo*);

void module_dvdplayer_setup(void) {
    ModuleInfo info;
    info.prepare = module_dvdplayer_prepare;
    info.unk4 = 0;
    info.getdesc = module_dvdplayer_getdesc;
    info.getver = module_dvdplayer_getver;
    info.option_str = module_dvdplayer_option_str;
    info.pathrelated = module_dvdplayer_pathrelated;
    info.unk18 = 0;
    func_00208450(&info);
}
