extern void module_opening_prepare(void);
extern void *module_opening_getdesc(void);
extern void *module_opening_getversion(void);
extern void func_00208408(void *);

void module_opening_setup(void) {
    void *handler[7];
    handler[0] = module_opening_prepare;
    handler[1] = 0;
    handler[2] = module_opening_getdesc;
    handler[3] = module_opening_getversion;
    handler[4] = 0;
    handler[5] = 0;
    handler[6] = 0;
    func_00208408(handler);
}
