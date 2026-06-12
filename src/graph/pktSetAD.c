/* 0x0021B768 - pktSetAD */
extern int D_00370A34;
extern void *sceVif1PkAddGsAD(int pkt, long long reg);

void *pktSetAD(void *pkt, long long reg)
{
    sceVif1PkAddGsAD(D_00370A34, (int)reg);
    return pkt;
}
