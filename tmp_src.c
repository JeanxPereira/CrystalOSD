extern int config_get_video_output(void);
extern void SetGsVParam(int mode);
extern int is_pal_vmode_p9_tgt(void);
extern void sceGsResetGraph(int mode, int interlace, int field, int out);

extern int D_002AD980;

void graph_reset_related3(void)
{
    int vid;
    int pal;
    int field;

    vid = config_get_video_output();
    if (vid == D_002AD980)
        return;

    vid = config_get_video_output();
    D_002AD980 = vid;

    if (vid == 0) {
        SetGsVParam(0);
        pal = is_pal_vmode_p9_tgt();
        field = pal ? 3 : 2;
        sceGsResetGraph(2, 1, field, 1);
        return;
    }
    if (vid == 1) {
        SetGsVParam(1);
        pal = is_pal_vmode_p9_tgt();
        field = pal ? 3 : 2;
        sceGsResetGraph(2, 1, field, 1);
        return;
    }
}
