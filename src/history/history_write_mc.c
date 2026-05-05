/* CrystalOSD — History subsystem
/* 0x00207D28 - history_write_mc */

extern int sceMcGetInfo(int, int, int *, int *, int *);
extern int sceMcSync(int, int, int *);
extern int sceMcGetDir(int, int, const char *, int, int, void *);
extern int sceMcMkdir(int, int, const char *);
extern int sceMcSetFileInfo(int, int, const char *, const void *, int);
extern int sceMcDelete(int, int, const char *);
extern int strcmp(const char *, const char *);
extern int sprintf(char *, const char *, ...);

extern char *func_0020E3E8(void);
extern char *get_system_folder_name(void);
extern int func_00207B80(int, const char *, const void *, int, int);
extern int get_vidmode_with_fallback(void);

extern char D_00372B40[];
extern char D_00382B40[];
extern char D_00382B80[];
extern char aSS_0[];
extern char aHistory[];
extern char aIconSys[];
extern char aHistoryOld[];
extern char aPs2d_1[];
extern char aPs2d_2[];
extern char aStar_0[];

extern int history_check_exists(int slot);

extern char aSS_0[];
extern char aHistory[];
extern char aIconSys[];
extern char aHistoryOld[];
extern char aPs2d_1[];
extern char aPs2d_2[];
extern char aStar_0[]; // "*"

int history_write_mc(int slot)
{
    int type;
    int free;
    int format;
    int result;
    int i;
    int found;
    char *sysname;
    int mode;

    sceMcGetInfo(slot, 0, &type, &free, &format);
    sceMcSync(0, 0, &result);
    if (result < -1) return -1;
    if (type != 2) return -1;
    if (format == 0) return -1;

    found = 0;
    sceMcGetDir(slot, 0, aStar_0, 0, 0x400, D_00372B40);
    sceMcSync(0, 0, &result);
    if (result > -1) {
        i = 0;
        while (i < result) {
            if (strcmp((char *)(0x372B60 + i * 0x40), func_0020E3E8()) == 0) {
                found = 1;
                break;
            }
            i++;
        }
    }
    if (found) {
        if (free < 2) return -1;
    } else {
        if (free < 10) return -1;
        sysname = get_system_folder_name();
        sceMcMkdir(slot, 0, sysname);
        sceMcSync(0, 0, &result);
        if (result < 0) return -1;
    }

    sysname = get_system_folder_name();
    sceMcGetDir(slot, 0, sysname, 0, 1, D_00382B40);
    sceMcSync(0, 0, &result);
    *(unsigned short *)(D_00382B40 + 0x14) |= 0x2000;
    sysname = get_system_folder_name();
    sceMcSetFileInfo(slot, 0, sysname, D_00382B40, 4);
    sceMcSync(0, 0, &result);
    sysname = get_system_folder_name();
    sprintf(D_00382B80, aSS_0, sysname, aHistory);
    sceMcDelete(slot, 0, D_00382B80);
    sceMcSync(0, 0, &result);
    func_00207B80(slot, D_00382B80, (void *)0x1F0198, 0x1CE, 0);

    sysname = get_system_folder_name();
    sprintf(D_00382B80, aSS_0, sysname, aIconSys);
    mode = get_vidmode_with_fallback();
    if (mode == 0) {
        func_00207B80(slot, D_00382B80, aPs2d_1, 0x6F0, 0);
    } else {
        func_00207B80(slot, D_00382B80, aPs2d_2, 0x6F0, 0);
    }

    if (*(int *)0x1F037C != 0) {
        sysname = get_system_folder_name();
        sprintf(D_00382B80, aSS_0, sysname, aHistoryOld);
        func_00207B80(slot, D_00382B80, (void *)0x1F0366, 0x16, 1);
        return 0;
    }
    return 0;
}
