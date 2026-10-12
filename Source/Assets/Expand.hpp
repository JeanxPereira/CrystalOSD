#pragma once
#include "Assets/Bytes.hpp"

namespace assets {

// The OSD's Expand (HDD OSD 1.10U 0x00200EE8, ROM 2.30 0x00200ED0), ported from References/model/sound_data.mjs
// expand: {u32 size, then blocks of a big-endian flag word and 30 literal or match items}.
struct Expanded {
    uint32_t size = 0;
    Bytes out;
    size_t produced = 0;
    size_t consumed = 0;
};
// Refuses a stream that announces more than `maxSize` bytes, or more than its remaining bytes could give.
Expanded expand(View source, size_t at = 0, size_t maxSize = size_t(1) << 24);

}
