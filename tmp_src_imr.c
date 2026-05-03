void GsGetIMR(void)
{
    __asm__ volatile("addiu $3, $0, 0x70\n\tsyscall");
}

void GsPutIMR(int imr)
{
    __asm__ volatile("addiu $3, $0, 0x71\n\tsyscall");
}
