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
int sceCdRcBypassCtl(int, unsigned int*);

void cdvd_cmd_rcbypassctl(int param_1) {
    unsigned int auStack_40[4];
    int lVar1;

    unksema_392900.field_1C = 3;
    do {
        lVar1 = sceCdRcBypassCtl(param_1, auStack_40);
        if ((auStack_40[0] & 0x100) != 0) {
            unksema_392900.field_1C = 0;
            return;
        }
    } while ((auStack_40[0] & 0x80) != 0 || lVar1 == 0);

    unksema_392900.field_1C = 0;
}
