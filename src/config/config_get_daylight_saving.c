#include "osd_config.h"

u32 config_get_daylight_saving(void)
{
    return (var_mechacon_config_param_1 >> 29) & 1;
}
