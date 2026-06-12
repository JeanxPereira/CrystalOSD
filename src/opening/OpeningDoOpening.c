/* 0x00222180 - OpeningDoOpening */

extern void OpeningInitOpeningScene(void);
extern void OpeningDrawOpeningScene(void);

extern int D_00370010;
extern int D_00370008;

void OpeningDoOpening(void) {
    int state = D_00370010;

    if (state == 1)
        goto draw;

    if (state >= 2)
        goto geq2;

    if (state == 0)
        goto init;

    goto done;

geq2:
    if (state == 2)
        goto store;

    goto done;

init:
    OpeningInitOpeningScene();
    D_00370010 = D_00370010 + 1;

draw:
    OpeningDrawOpeningScene();
    return;

store:
    D_00370008 = state;
    D_00370010 = 0;

done:
    return;
}
