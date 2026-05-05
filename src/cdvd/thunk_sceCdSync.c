int sceCdSync(int mode);

int thunk_sceCdSync(int mode) {
    return sceCdSync(mode);
}
