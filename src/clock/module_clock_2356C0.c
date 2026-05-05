extern float module_clock_2355F8(void);

float module_clock_2356C0(void) {
    unsigned int *p = (unsigned int *)0x409238;
    return (float)*p + (module_clock_2355F8() / 60.0f);
}
