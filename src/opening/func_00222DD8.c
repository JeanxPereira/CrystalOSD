/* 0x00222DD8 */

extern void sceVu0Normalize(void *a0, void *a1);
extern void vif1SetZTest(int a0);
extern void func_00222678(void *sp, int a1);

extern void *D_0037005C;
extern float D_002B0C70[];

void func_00222DD8(void) {
    char buf[0x490];
    int i;

    sceVu0Normalize((void *)((char *)D_0037005C + 0x50), D_002B0C70);
    vif1SetZTest(0);

    i = 0;
    do {
        func_00222678(buf, i);
        i = i + 1;
    } while (i < 5);

    vif1SetZTest(1);
}
