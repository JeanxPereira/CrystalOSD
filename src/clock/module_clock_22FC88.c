extern void module_clock_237A28(void*, void*, float, float);

void module_clock_22FC88(unsigned char *arg0) {
    module_clock_237A28(arg0 + 0x10, arg0 + 0x100, *(float*)(arg0 + 0xF4), (float)*(int*)(arg0 + 0x110));
}
