extern float D_0041EAB0[];
extern void sceVu0UnitMatrix(float*);
extern void func_00239F48(void);
int D_00370344;

void module_clock_23A068(void) {
    D_00370344 = 0;
    sceVu0UnitMatrix(D_0041EAB0);
    func_00239F48();
}
