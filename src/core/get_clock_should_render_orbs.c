extern int g_clock_should_render_orbs __attribute__((section(".sbss")));

/* 0x00234B78 - get_clock_should_render_orbs */
int get_clock_should_render_orbs(void) {
    return g_clock_should_render_orbs;
}
