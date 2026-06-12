/* 0x00220CE8 - OpeningDrawLightsAndCubes */

extern void sceVu0Normalize(void *out, void *in);
extern void OpeningDrawLights(void);
extern void vif1SetCLAMP_1(int a0, int a1, int a2, int a3, int a4, int a5);
extern void func_00220450(void *sp, int index);

extern float D_002B0C70[];
extern void *D_0037005C;

void OpeningDrawLightsAndCubes(void) {
    void *buffer = (void *)((unsigned long)D_0037005C + 0x50);
    int s0;
    char local_buffer[0x488];

    sceVu0Normalize(buffer, D_002B0C70);

    OpeningDrawLights();

    vif1SetCLAMP_1(1, 1, 0, 0, 0, 0);

    s0 = 0;
    while (s0 < 5) {
        func_00220450(local_buffer, s0);
        s0 = s0 + 1;
    }
}
