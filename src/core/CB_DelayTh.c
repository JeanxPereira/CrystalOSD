extern int iSignalSema(int);

/* 0x0028A7E8 - CB_DelayTh */
void CB_DelayTh(int unused0, int unused1, int sema_id) {
    iSignalSema(sema_id);
    __asm__("sync");
    __asm__("ei");
}
