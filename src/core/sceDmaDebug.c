/* 0x0027BCA0 - sceDmaDebug */
extern int D_0032CA18;

int sceDmaDebug(int val)
{
    int old = D_0032CA18;
    D_0032CA18 = val;
    return old;
}
