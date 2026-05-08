#include "osd_config.h"

void config_set_keyboard_type(u32 v)
{
    var_hddsys_keyboard_type = (s32)v;
}
