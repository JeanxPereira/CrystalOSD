#pragma once
#include <array>
#include <cstdint>
#include <vector>

#include "Scene/Arithmetic.hpp"
#include "Scene/Frame.hpp"
#include "Scene/Matrix.hpp"

namespace scene::opening {

struct LightStats {
    int32_t spritePackets = 0, quadsDrawn = 0, quadsLeftOut = 0, trailPackets = 0, trailHidden = 0;
};

// facts/opening.md 4.2 (OpeningDrawLights 0x0021F5F8): verify_opening_lights_v2.mjs expected.
// draw takes the world-to-screen matrix; the matrix block's first matrix (the lights' base) is the unit matrix.
// A sprite packet or trail with nothing to draw adds no pass; the stats count every packet the OSD sends.
template <class A>
class Lights {
public:
    static constexpr int kLights = 4, kRing = 128;
    explicit Lights(uint32_t phase);
    void draw(int32_t counter, const Mat4& worldToScreen, std::vector<Pass>& out);

    int32_t head() const { return m_head; }
    int32_t tail() const { return m_tail; }
    const std::array<std::array<Mat4, 4>, kLights>& matrices() const { return m_matrices; }
    const std::array<std::array<std::array<int32_t, 4>, kRing>, kLights>& ring() const { return m_ring; }
    const std::array<Vec4, kLights>& centres() const { return m_centres; }
    const std::array<float, kLights * 2>& angles() const { return m_angles; }
    const std::array<float, kLights>& cosines() const { return m_cosines; }
    const std::array<float, kLights>& sines() const { return m_sines; }
    const LightStats& stats() const { return m_stats; }

private:
    int32_t m_phase;
    int32_t m_head = 0, m_tail = 0;
    std::array<std::array<Mat4, 4>, kLights> m_matrices{};
    std::array<std::array<std::array<int32_t, 4>, kRing>, kLights> m_ring{};
    std::array<Vec4, kLights> m_centres{};
    std::array<float, kLights * 2> m_angles{};
    std::array<float, kLights> m_cosines{}, m_sines{};
    LightStats m_stats;
};

extern template class Lights<EeArithmetic>;
extern template class Lights<NativeArithmetic>;

}
