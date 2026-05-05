extern void sprInit(void);
extern void *sprAlloc(int);
extern void sprSetBasePtr(void);
extern void sceVu0UnitMatrix(void *);

extern void *D_00370064;
extern void *D_00370060;
extern void *D_00370058;
extern void *D_0037005C;

void InitSPR(void) {
    sprInit();
    D_00370064 = sprAlloc(0x30);
    D_00370060 = sprAlloc(0x30);
    D_00370058 = sprAlloc(0x280);
    D_0037005C = sprAlloc(0x240);
    sprSetBasePtr();
    sceVu0UnitMatrix(D_00370058);
}
