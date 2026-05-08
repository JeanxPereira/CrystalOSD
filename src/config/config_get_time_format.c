#include "osd_config.h"

u32 config_get_time_format(void)
{
    return (var_mechacon_config_param_1 >> 30) & 1;
}
