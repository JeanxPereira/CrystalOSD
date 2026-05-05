typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef signed char s8;
typedef signed short s16;
typedef signed int s32;
typedef unsigned long u64;
typedef signed long s64;

typedef unsigned int size_t;

extern void sceDevVif0Reset(void);
extern void sceDevVu0Reset(void);
extern void sceDevVif1Reset(void);
extern void sceDevVu1Reset(void);
extern void sceDevGifReset(void);
extern void sceGsResetPath(void);
extern void sceDmaReset(int);
extern void *memset(void *, int, int);
extern void *memcpy(void *, const void *, int);
extern int memcmp(const void *, const void *, int);
extern int strlen(const char *);
extern int strcmp(const char *, const char *);
extern int strncmp(const char *, const char *, int);
extern char *strcpy(char *, const char *);
extern char *strncpy(char *, const char *, int);
extern char *strcat(char *, const char *);
extern int sprintf(char *, const char *, ...);
extern int printf(const char *, ...);
extern int rand(void);
extern int psmToBppGS(u32);

/* Memory card API — 5-param variant matching OSDSYS binary */
extern int sceMcGetInfo(int, int, int *, int *, int *);
extern int sceMcOpen(int, int, const char *, int);
extern int sceMcClose(int);
extern int sceMcSync(int, int, int *);
extern int sceMcRead(int, void *, int);
extern int sceMcWrite(int, const void *, int);
extern int sceMcSeek(int, int, int);
extern int sceMcMkdir(int, int, const char *);
extern int sceMcGetDir(int, int, const char *, int, int, void *);
extern int sceMcDelete(int, int, const char *);
extern int sceMcFlush(int);
extern int sceMcSetFileInfo(int, int, const char *, const void *, int);
extern int sceMcChdir(int, int, const char *, char *);
extern int sceMcFormat(int, int);
extern int sceMcUnformat(int, int);

/* cdvd */
extern int sceCdOpenConfig(int, int, int, int*);
extern int sceCdReadConfig(void*, int*);
extern int sceCdCloseConfig(int*);

/* system */
extern char *get_system_folder_name(void);
extern int get_vidmode_with_fallback(void);

/* history helpers */
extern int func_002015A0(void);
extern int func_00207B80(int, const char *, const void *, int, int);
extern char *func_0020E3E8(void);

extern char aSS_0[];
extern char aHistory[];
extern char aIconSys[];
extern char aHistoryOld[];
extern char aPs2d_1[];
extern char aPs2d_2[];
extern char aStar_0[];

extern char D_00382B80[];
extern char D_00372B40[];
extern char D_00382B40[];
