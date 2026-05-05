int sceCdTrayReq(int param, void* addr);

int thunk_sceCdTrayReq(int param_1) {
    int auStack_20[4];
    return sceCdTrayReq(param_1, auStack_20);
}
