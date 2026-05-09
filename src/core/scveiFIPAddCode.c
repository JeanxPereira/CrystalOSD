/* 0x0027DC58 - sceVif1PkAddCode */

void scveiFIPAddCode(void **buffer, void *code)
{
    void *p = *buffer;
    *(void **)p = code;
    p = (char *)p + 4;
    *buffer = p;
}