extern float D_0036F9BC;
extern float D_0036F9C0;
extern int D_00370094;

typedef struct {
    int unk00;
    int unk04;
    int unk08;
    int unk0C;
    int unk10;
    int unk14;
    int unk18;
    int unk1C;
    int unk20;
    int unk24;
    float unk28;
    int unk2C;
    int unk30;
    int unk34;
    int unk38;
    int unk3C;
    int unk40;
    int unk44;
    float unk48;
    int unk4C;
    int unk50;
} AnimStruct;

extern AnimStruct D_003DB800;

void OpeningInitAnimation(void) {
    D_003DB800.unk50 = 0;
    D_003DB800.unk28 = D_0036F9BC;
    D_003DB800.unk48 = D_0036F9C0;
    D_003DB800.unk08 = 0;
    D_003DB800.unk10 = 0;
    D_003DB800.unk14 = 0;
    D_003DB800.unk18 = 0;
    D_003DB800.unk20 = 0;
    D_003DB800.unk24 = 0;
    D_003DB800.unk30 = 0;
    D_003DB800.unk34 = 0;
    D_003DB800.unk38 = 0;
    D_003DB800.unk40 = 0;
    D_003DB800.unk44 = 0;
    D_00370094 = 0;
}
