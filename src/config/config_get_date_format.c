#include "osd_config.h"

u32 config_get_date_format(void)
{
    u32 v = var_mechacon_config_param_2 & 3;
    if (v > 2) v = 0;
    return v;
}
