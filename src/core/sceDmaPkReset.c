/* 0x0027D978 - sceDmaPkReset */
void sceDmaPkReset(u32 *pk)
{
    u32 start = pk[1];
    pk[2] = 0;
    pk[0] = start;
}
