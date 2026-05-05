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

void override_illegal_disc_type(void) {
    int val = 0x74;
    unksema_392900.field_24 = val;
    *(int*)0x1F000C = val;
}
