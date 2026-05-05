extern char D_002B5F20[];
extern void func_00234B10(void*);
extern int func_00234B80(void);
extern void func_00234D60(void);
extern void func_00234E08(void);

void module_clock_234E70(void) {
    func_00234B10(D_002B5F20);
    if (!func_00234B80()) {
        func_00234D60();
    }
    func_00234E08();
}
