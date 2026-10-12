#include "StringCompare.hpp"

#include <cstdio>

#include "SceneFixture.hpp"

namespace scenetest {

using nlohmann::json;

bool sameState(const scene::FontState& ours, const json& theirs, const std::string& at) {
    const auto integer = [&](int32_t v, const char* key) {
        if (v == theirs.at(key).get<int32_t>()) return true;
        std::fprintf(stderr, "%s: %s %d vs %d\n", at.c_str(), key, v, theirs.at(key).get<int32_t>());
        return false;
    };
    bool ok = integer(ours.lineHeight, "lineHeight") && integer(ours.fixed, "fixed") && integer(ours.percent, "percent") && integer(ours.pitch, "pitch") &&
              integer(ours.decoration, "decoration") && integer(ours.clip, "clip") && integer(ours.blank, "blank") && integer(ours.ascent, "ascent") &&
              integer(ours.dirty, "dirty") && sameBits(ours.tv, theirs.at("tv"), at + " tv") && sameBits(ours.ratio, theirs.at("ratio"), at + " ratio");
    for (int i = 0; ok && i < 2; ++i) ok = sameBits(ours.locate[i], theirs.at("locate").at(i), at + " locate");
    for (int i = 0; ok && i < 4; ++i) ok = sameBits(ours.colour[i], theirs.at("colour").at(i), at + " colour");
    return ok && sameBits(ours.matrix, theirs.at("matrix"), at + " matrix");
}

int compareStrings(const std::vector<scene::StringRun>& ours, const json& expect, std::initializer_list<const char*> parts, const std::string& at) {
    std::vector<const json*> theirs;
    for (const char* part : parts)
        for (const json& s : expect.at(part)) theirs.push_back(&s);
    if (ours.size() != theirs.size()) {
        std::fprintf(stderr, "%s: %zu strings, the capture %zu\n", at.c_str(), ours.size(), theirs.size());
        std::fprintf(stderr, "  ours:");
        for (const scene::StringRun& run : ours) std::fprintf(stderr, " \"%s\"%s", run.text.c_str(), run.measuring ? "m" : "");
        std::fprintf(stderr, "\n  capture:");
        for (const json* t : theirs) {
            std::string text;
            for (const json& c : t->at("text")) text.push_back(static_cast<char>(c.get<int32_t>()));
            std::fprintf(stderr, " \"%s\"%s", text.c_str(), t->at("measuring").get<bool>() ? "m" : "");
        }
        std::fprintf(stderr, "\n");
        return 1;
    }
    for (size_t i = 0; i < ours.size(); ++i) {
        const json& s = *theirs[i];
        std::string text;
        for (const json& c : s.at("text")) text.push_back(static_cast<char>(c.get<int32_t>()));
        const std::string where = at + " string " + std::to_string(i) + " \"" + text + "\"";
        if (ours[i].text != text || ours[i].measuring != s.at("measuring").get<bool>()) {
            std::fprintf(stderr, "%s: the clock handed \"%s\" (%s)\n", where.c_str(), ours[i].text.c_str(), ours[i].measuring ? "measured" : "drawn");
            return 1;
        }
        if (!sameState(ours[i].own, s.at("own"), where)) return 1;
    }
    return 0;
}

int compareCache(const scene::FontCache& ours, const json& theirs, const std::string& at) {
    const json& list = theirs.at("list");
    if (ours.list.size() != list.size()) {
        std::fprintf(stderr, "%s: cache of %zu entries, the library's %zu\n", at.c_str(), ours.list.size(), list.size());
        return 1;
    }
    for (size_t i = 0; i < list.size(); ++i) {
        const scene::FontCacheEntry& e = ours.list[i];
        const json& t = list[i];
        if (e.code != t.at("code") || e.loaded != t.at("loaded") || e.cell != t.at("cell") || e.block != t.at("block").get<uint32_t>()) {
            std::fprintf(stderr, "%s: cache entry %zu is %x/%d/%d, the library's %x/%d/%d\n", at.c_str(), i, e.code, e.cell, e.loaded, t.at("code").get<int32_t>(),
                         t.at("cell").get<int32_t>(), t.at("loaded").get<int32_t>());
            return 1;
        }
    }
    if (ours.block != theirs.at("block").get<uint32_t>() || ours.cellW != theirs.at("cellW") || ours.cellH != theirs.at("cellH") || ours.width != theirs.at("width")) {
        std::fprintf(stderr, "%s: the cache's layout differs from the library's\n", at.c_str());
        return 1;
    }
    return 0;
}

}
