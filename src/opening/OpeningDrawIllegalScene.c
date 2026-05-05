extern int D_003700E4;
extern void func_002243F8(void);
extern void func_0021E950(void);
extern void func_00222DD8(void);
extern void func_002242C8(void);

void OpeningDrawIllegalScene(void) {
    if (D_003700E4 != 0) {
        func_002243F8();
        func_0021E950();
        func_00222DD8();
        func_002242C8();
    } else {
        D_003700E4 = 1;
    }
}
