#include "osd_config.h"

u32 config_get_aspect_ratio(void)
{
    u32 v = (var_mechacon_config_param_1 >> 1) & 3;
    if (v > 2) v = 0;
    return v;
}
