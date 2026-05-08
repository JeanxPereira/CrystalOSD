#include "osd_config.h"

s32 config_get_timezone_offset(void)
{
    /* sign-extend 11-bit field at bits 19:9: shift left 12, arithmetic right 21 */
    return ((s32)(var_mechacon_config_param_1 << 12)) >> 21;
}
