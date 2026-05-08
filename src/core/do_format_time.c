extern int sprintf(char *, const char *, ...);

extern char D_00397B70[];
extern char aP0P00P0P00P0P0_1[];
extern char aP02dP0002d02d[];
extern char aP0P00P0P00P0P0_2[];
extern char aP02dP0002d02dS[];
extern char aR080PAaP00mR00[];
extern char aR080PApP00mR00[];

/* 0x00214640 - do_format_time */
char *do_format_time(int hours, int minutes, int seconds, int format) {
    char *s0;
    char *ampm;
    int hours_12;
    int div12;

    s0 = 0;
    if (format == 0) {
        if (hours < 0) {
            s0 = aP0P00P0P00P0P0_1;
        } else {
            s0 = D_00397B70;
            sprintf(s0, aP02dP0002d02d, hours, minutes);
        }
    } else if (format == 1) {
        if (hours < 0) {
            s0 = aP0P00P0P00P0P0_2;
        } else {
            div12 = 12;
            hours_12 = div12;
            if (hours < 12) {
                ampm = aR080PAaP00mR00;
            } else {
                ampm = aR080PApP00mR00;
            }
            if (hours % div12) {
                hours_12 = hours % div12;
            }
            s0 = D_00397B70;
            sprintf(s0, aP02dP0002d02dS, hours_12, minutes);
        }
    }
    return s0;
}
