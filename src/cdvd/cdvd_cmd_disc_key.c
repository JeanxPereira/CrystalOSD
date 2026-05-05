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
extern char D_003908C0[];
int cdvd_handle_disc_key_inner(void* addr);

int cdvd_cmd_disc_key(void) {
    char *addr = D_003908C0;
    struct cdvd_ctx *ctx = &unksema_392900;
    int res;

    ctx->field_1C = 1;
    res = cdvd_handle_disc_key_inner(addr);
    ctx->field_1C = 0;
    return res;
}
