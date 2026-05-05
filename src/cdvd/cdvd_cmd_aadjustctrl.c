struct cdvd_ctx {
    int sema0;
    int sema1;
    int sema2;
    int pad0;
    int pad1;
    int field_14;
    int thread_id;
    int field_1C;
    int field_20;
    int field_24;
    int field_28;
};

extern struct cdvd_ctx unksema_392900;
void WaitSema(int);
int sceCdAAdjustCtrl(int, unsigned int*);

void cdvd_cmd_aadjustctrl(int param_1) {
    unsigned int auStack_50[4];
    int lVar1;
    
    unksema_392900.field_1C = 3;
    do {
        do {
            WaitSema(unksema_392900.sema1); // wait, unksema_392904 is at 0x392904 which is sema1!
            lVar1 = sceCdAAdjustCtrl(param_1, auStack_50);
        } while ((auStack_50[0] & 8) != 0);
    } while (lVar1 == 0);
    
    unksema_392900.field_1C = 0;
}
