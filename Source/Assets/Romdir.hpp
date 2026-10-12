#pragma once
#include <optional>
#include <string>
#include <vector>

#include "Assets/Bytes.hpp"

namespace assets {

// romdir_get_offset and romdir_search_entry (HDD OSD 1.10U 0x0020E418 / 0x0020E4B0), ported from
// References/model/sound_data.mjs romdirStart and romdirEntries.
struct RomdirEntry {
    std::string name;
    uint32_t size = 0;
    uint32_t offset = 0;
};

// The RESET entry whose size rounded up to 16 equals its own offset, searched below `limit`; -1 if none.
int64_t romdirStart(View image, size_t limit = 0x2000);
std::vector<RomdirEntry> romdirEntries(View image, size_t start);
std::optional<RomdirEntry> romdirFind(const std::vector<RomdirEntry>& entries, const std::string& name);
// A member's bytes; throws when it is missing or runs past the image.
View romdirMember(View image, const std::vector<RomdirEntry>& entries, const std::string& name);

}
