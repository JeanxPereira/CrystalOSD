#include "osd_config.h"

u32 config_get_spdif_mode(void)
{
    return var_mechacon_config_param_1 & 1;
}
