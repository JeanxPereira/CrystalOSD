extern void OpeningDoText(void);
extern void func_0021D6C0(void);
extern void OpeningDoWaitNextFrame(void);

extern int D_00370014;
extern int D_00370000;

void OpeningDrawEnd(void) {
    OpeningDoText();
    if (D_00370014 != 0) {
        func_0021D6C0();
    }
    OpeningDoWaitNextFrame();
    D_00370000++;
}
