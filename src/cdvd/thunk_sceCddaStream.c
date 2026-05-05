int sceCddaStream(int p1, int p2, int p3, void* p4);
int sceCdSync(int);
void FlushCache(int);

int thunk_sceCddaStream(int p1, int p2, int p3, void* p4) {
    int res = sceCddaStream(p1, p2, p3, p4);
    sceCdSync(0);
    FlushCache(0);
    return res;
}
