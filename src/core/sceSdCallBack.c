/* 0x00294728 - sceSdCallBack */
#include <tamtypes.h>

extern void *D_00347068;

void *sceSdCallBack(void *cb)
{
    void *old = D_00347068;
    D_00347068 = cb;
    return old;
}
