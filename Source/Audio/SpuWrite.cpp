#include "Audio/SpuWrite.hpp"

#include <algorithm>

namespace audio {

bool sameWrite(const SpuWrite& a, const SpuWrite& b) { return a.frame == b.frame && a.address == b.address && a.value == b.value; }

std::optional<size_t> firstDifference(const WriteStream& expected, const WriteStream& actual) {
    const size_t n = std::max(expected.size(), actual.size());
    for (size_t i = 0; i < n; ++i)
        if (i >= expected.size() || i >= actual.size() || !sameWrite(expected[i], actual[i])) return i;
    return std::nullopt;
}

}
