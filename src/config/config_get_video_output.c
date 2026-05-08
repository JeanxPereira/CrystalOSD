#include "osd_config.h"

u32 config_get_video_output(void)
{
    return (var_mechacon_config_param_1 >> 3) & 1;
}
