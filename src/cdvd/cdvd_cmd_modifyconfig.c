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
int sceCdWriteConfig(int, unsigned int*);

void cdvd_cmd_modifyconfig(int param_1) {
    unsigned int auStack_50[4];
    int lVar1;
    struct cdvd_ctx *ctx = &unksema_392900;

    ctx->field_1C = 2;
    do {
        do {
            WaitSema(ctx->sema1);
            lVar1 = sceCdOpenConfig(1, 1, 2, auStack_50);
        } while ((auStack_50[0] & 9) != 0);
    } while (lVar1 == 0);

    do {
        do {
            WaitSema(ctx->sema1);
            lVar1 = sceCdWriteConfig(param_1, auStack_50);
        } while ((auStack_50[0] & 9) != 0);
    } while (lVar1 == 0);

    do {
        do {
            WaitSema(ctx->sema1);
            lVar1 = sceCdCloseConfig(auStack_50);
        } while ((auStack_50[0] & 9) != 0);
    } while (lVar1 == 0);

    ctx->field_1C = 0;
}
