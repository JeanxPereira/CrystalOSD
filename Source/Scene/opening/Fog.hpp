#pragma once
#include <array>
#include <cstdint>
#include <vector>

#include "Scene/Arithmetic.hpp"
#include "Scene/Frame.hpp"
#include "Scene/Matrix.hpp"

namespace scene::opening {

struct FogStats {
    int32_t drawn = 0, leftOut = 0;
};

// facts/opening.md 4.3, 4.6 (func_0021DEA8, OpeningDrawFog 0x0021E168): verify_opening_fog_v2.mjs expected, verify_opening_inputs.mjs fog.
// draw takes the world-to-screen matrix; a layer whose quads are all clipped adds no pass.
template <class A>
class Fog {
public:
    static constexpr int kPoints = 17;
    Fog();
    void draw(const Mat4& worldToScreen, std::vector<Pass>& out);
    const std::array<float, 6>& offsets() const { return m_offsets; }
    const std::array<Vec4, kPoints * kPoints>& mesh() const { return m_mesh; }
    const std::array<std::array<int32_t, 4>, kPoints * kPoints>& brightness() const { return m_brightness; }
    const FogStats& stats() const { return m_stats; }

private:
    std::array<float, 6> m_offsets{};
    std::array<Vec4, kPoints * kPoints> m_mesh{};
    std::array<std::array<int32_t, 4>, kPoints * kPoints> m_brightness{};
    FogStats m_stats;
};

extern template class Fog<EeArithmetic>;
extern template class Fog<NativeArithmetic>;

}
