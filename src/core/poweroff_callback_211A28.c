extern int iSignalSema(int);

#define D_001F141C (*(unsigned int *)0x001F141C)

/* 0x00211A28 - poweroff_callback_211A28 */
void poweroff_callback_211A28(int sema_id) {
    iSignalSema(sema_id);
    D_001F141C |= 1;
}
