extern int SignalSema(int);
extern int WaitSema(int);
extern int threadid_2AE5D8[];

void OpeningDoWaitNextFrame(void) {
    SignalSema(threadid_2AE5D8[12]);
    WaitSema(threadid_2AE5D8[14]);
}
