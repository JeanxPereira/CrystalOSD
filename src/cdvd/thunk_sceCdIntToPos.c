typedef struct {
    unsigned char minute;
    unsigned char second;
    unsigned char sector;
    unsigned char track;
} sceCdPos;

void sceCdIntToPos(int, sceCdPos*);

int thunk_sceCdIntToPos(int param_1, unsigned char* param_2) {
    sceCdPos pos;
    sceCdIntToPos(param_1, &pos);
    param_2[9] = pos.minute;
    param_2[10] = pos.second;
    param_2[11] = pos.sector;
    return 1;
}
