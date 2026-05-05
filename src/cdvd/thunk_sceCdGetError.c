int sceCdGetError(void);

int thunk_sceCdGetError(void) {
    return sceCdGetError();
}
