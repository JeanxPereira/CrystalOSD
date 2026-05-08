#include "osd_config.h"

u32 config_set_spdif_mode(u32 v)
{
    var_mechacon_config_param_1 = (var_mechacon_config_param_1 & 0xfffffffe) | (v & 1);
    return v & 1;
}
