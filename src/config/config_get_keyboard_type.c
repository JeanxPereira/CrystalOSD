#include "osd_config.h"

u32 config_get_keyboard_type(void)
{
    return (u32)var_hddsys_keyboard_type;
}
