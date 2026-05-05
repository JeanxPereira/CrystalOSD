int sceCdInit(int init_mode);

int thunk_sceCdInit(int init_mode) {
    return sceCdInit(0);
}
