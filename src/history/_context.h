typedef unsigned char  u8;
typedef unsigned short u16;
typedef unsigned int   u32;
typedef signed char    s8;
typedef signed short   s16;
typedef signed int     s32;
typedef unsigned long  u64;
typedef signed long    s64;

typedef unsigned int size_t;

extern void *memset(void *, int, int);
extern void *memcpy(void *, const void *, int);
extern int   strncmp(const char *, const char *, int);
extern char *strncpy(char *, const char *, int);
extern int   strcmp(const char *, const char *);
extern int   sprintf(char *, const char *, ...);
extern int   rand(void);

extern int sceMcGetInfo(int port, int slot, int *type, int *free, int *format);
extern int sceMcSync(int mode, int *cmd, int *result);
extern int sceMcOpen(int port, int slot, const char *name, int mode);
extern int sceMcClose(int fd);
extern int sceMcRead(int fd, void *buf, int size);
extern int sceMcWrite(int fd, const void *buf, int size);
extern int sceMcMkdir(int port, int slot, const char *name);
extern int sceMcDelete(int port, int slot, const char *name);
extern int sceMcGetDir(int port, int slot, const char *name, int mode, int maxent, void *table);
extern int sceMcSetFileInfo(int port, int slot, const char *name, const void *info, int valid);

extern char *get_system_folder_name(void);
extern int   get_vidmode_with_fallback(void);
