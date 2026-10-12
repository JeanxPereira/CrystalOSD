#include "Assets/Romdir.hpp"

namespace assets {

int64_t romdirStart(View image, size_t limit) {
    for (size_t at = 0; at < limit && at + 16 <= image.size(); at += 16) {
        if (le32(image, at) != 0x45534552 || le32(image, at + 4) != 0x54 || le16(image, at + 8) != 0) continue;
        if (((le32(image, at + 12) + 15) & ~15u) == at) return int64_t(at);
    }
    return -1;
}

std::vector<RomdirEntry> romdirEntries(View image, size_t start) {
    std::vector<RomdirEntry> entries;
    uint32_t offset = 0;
    for (size_t at = start;; at += 16) {
        if (at + 16 > image.size()) throw std::runtime_error("ROMDIR: truncated");
        if (le32(image, at) == 0) break;
        size_t end = at;
        while (end < at + 10 && image[end] != 0) ++end;
        const uint32_t size = le32(image, at + 12);
        entries.push_back({std::string(reinterpret_cast<const char*>(image.data() + at), end - at), size, offset});
        offset += (size + 15) & ~15u;
    }
    return entries;
}

std::optional<RomdirEntry> romdirFind(const std::vector<RomdirEntry>& entries, const std::string& name) {
    for (const RomdirEntry& e : entries)
        if (e.name == name) return e;
    return std::nullopt;
}

View romdirMember(View image, const std::vector<RomdirEntry>& entries, const std::string& name) {
    const auto entry = romdirFind(entries, name);
    if (!entry) throw std::runtime_error("ROMDIR: no member " + name);
    if (size_t(entry->offset) + entry->size > image.size()) throw std::runtime_error("ROMDIR: member " + name + " runs past the image");
    return image.subspan(entry->offset, entry->size);
}

}
