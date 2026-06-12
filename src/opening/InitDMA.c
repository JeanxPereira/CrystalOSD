/* 0x0021B2F8 - InitDMA */

extern void sceDmaReset(int chan);
extern void *sceDmaGetChan(int chan);

extern int D_00370020;
extern int D_00370024;
extern int D_00370028;

void InitDMA(void)
{
    int *chan;
    int val;

    sceDmaReset(1);

    chan = sceDmaGetChan(1);
    val = *chan;
    D_00370020 = (int)chan;
    val |= 0x40;
    *chan = val;

    chan = sceDmaGetChan(2);
    val = *chan;
    D_00370024 = (int)chan;
    val |= 0x40;
    *chan = val;

    chan = sceDmaGetChan(8);
    val = *chan;
    D_00370028 = (int)chan;
    val |= 0x40;
    *chan = val;
}
