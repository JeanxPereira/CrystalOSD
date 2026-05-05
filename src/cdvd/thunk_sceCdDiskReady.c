int sceCdDiskReady(int mode);

int thunk_sceCdDiskReady(int mode) {
    return sceCdDiskReady(mode);
}
