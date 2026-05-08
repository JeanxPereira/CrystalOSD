#ifndef LIBCDVD_H
#define LIBCDVD_H

// Dummy header to satisfy compiler
typedef struct {
    int dummy;
} sceCdvd_t;

int sceCdOpenConfig(int a, int b, int c, void *d);
int sceCdReadConfig(void *a, void *b);
int sceCdCloseConfig(void *a);

#endif
