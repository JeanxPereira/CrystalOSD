int sceCdPosToInt(void* addr);

int thunk_sceCdPosToInit(int p1, unsigned char m, unsigned char s, unsigned char f) {
    unsigned char uStack_20[4];
    uStack_20[0] = m;
    uStack_20[1] = s;
    uStack_20[2] = f;
    return sceCdPosToInt(uStack_20);
}
