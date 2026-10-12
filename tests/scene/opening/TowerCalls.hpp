#pragma once
#include <cstdint>
#include <cstring>
#include <vector>

#include "OpeningFixture.hpp"
#include "Scene/opening/Towers.hpp"

namespace openingtest {

// One call of func_002214F8 as probed (verify_opening_towers_ee.mjs): the three entry probes, the sine's result when
// the call reached it, and the chain of every tower it started, in order. Probes land in the emulator frame after
// their call, so the records of all frames are walked as one sequence.
struct TowerCall {
    Probe entry, entry2, entry3;
    std::optional<uint32_t> sine;
    std::vector<Bytes> chains;
    bool whole = false;
};

inline std::vector<TowerCall> towerCalls(const OpeningFixture& fixture) {
    std::vector<Probe> all;
    for (size_t k = 0; k < fixture.frameCount(); ++k)
        for (Probe& p : fixture.records(k, "towers")) all.push_back(std::move(p));
    std::vector<TowerCall> calls;
    for (size_t n = 0; n < all.size(); ++n) {
        if (all[n].k != 0) continue;
        if (n + 2 >= all.size() || all[n + 1].k != 1 || all[n + 2].k != 2) continue;
        TowerCall call;
        call.entry = all[n];
        call.entry2 = all[n + 1];
        call.entry3 = all[n + 2];
        size_t m = n + 3;
        if (m < all.size() && all[m].k == 3) call.sine = all[m++].fpr0;
        for (; m < all.size() && all[m].k != 0; ++m)
            if (all[m].k == 4) call.chains.push_back(all[m].mem.at(0));
        call.whole = m < all.size();
        calls.push_back(std::move(call));
    }
    return calls;
}

inline float floatAt(const Bytes& bytes, size_t at) {
    float v;
    std::memcpy(&v, bytes.data() + at, 4);
    return v;
}
inline uint32_t wordAt(const Bytes& bytes, size_t at) {
    uint32_t v;
    std::memcpy(&v, bytes.data() + at, 4);
    return v;
}
inline scene::Vec4 vecAt(const Bytes& bytes, size_t at) { return {floatAt(bytes, at), floatAt(bytes, at + 4), floatAt(bytes, at + 8), floatAt(bytes, at + 12)}; }
inline scene::Mat4 matAt(const Bytes& bytes, size_t at) { return {vecAt(bytes, at), vecAt(bytes, at + 16), vecAt(bytes, at + 32), vecAt(bytes, at + 48)}; }

inline scene::opening::TowerMatrices matricesOf(const Bytes& block) {
    return {matAt(block, 0), matAt(block, 0xc0), matAt(block, 0x200)};
}

inline scene::opening::TowerChain chainOf(const Bytes& bytes) {
    scene::opening::TowerChain chain;
    std::memcpy(chain.bytes.data(), bytes.data(), chain.bytes.size());
    return chain;
}

}
