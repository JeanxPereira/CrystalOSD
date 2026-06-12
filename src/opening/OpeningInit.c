/* 0x0021AC50 - OpeningInit */

/* Extern globals */
extern unsigned int D_0037000C;
extern unsigned int D_00370008;
extern unsigned int D_00370004;
extern unsigned int D_00370000;

/* Extern functions */
extern void OpeningInitRender(void);
extern void OpeningInitAnimation(void);
extern void OpeningInitTowersFog(void);
extern void func_00222E38(void);
extern void func_0021DE50(void);
extern void StartFrame(void);

void OpeningInit(void)
{
    unsigned int temp;
    unsigned long long *base;
    unsigned long long val1, val2;
    unsigned long long mask;

    temp = D_0037000C;
    D_00370004 = temp;
    D_00370008 = temp;

    OpeningInitRender();

    base = (unsigned long long *)0x1F0000;

    val1 = base[344];  /* 2752 / 8 = 344 */
    mask = -32768;
    val2 = base[374];  /* 2992 / 8 = 374 */

    val1 = val1 & mask;
    val2 = val2 & mask;

    val1 = val1 | 14;
    val2 = val2 | 14;

    base[344] = val1;
    base[374] = val2;

    OpeningInitAnimation();
    OpeningInitTowersFog();
    func_00222E38();
    func_0021DE50();
    StartFrame();

    D_00370000 = *(unsigned int *)((unsigned char *)base + 0x0CA0);
}
