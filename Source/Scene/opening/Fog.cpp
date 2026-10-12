#include "Scene/opening/Fog.hpp"

#include <string>

#include "Scene/opening/Vu0.hpp"

namespace scene::opening {

namespace {

constexpr float kRadiusSquared = 5202.0f;
constexpr double kHalfPi = 1.5707963267948966;
constexpr std::array<int32_t, 6> kTextures = {5, 3, 2, 5, 3, 2};

// verify_opening_fog_v2.mjs: the clip box at 0x002B0C20, the scroll step at 0x0036F990
const Vec4 kClipMin = {1728.0f, 1936.0f, 0.0f, 5.0f};
const Vec4 kClipMax = {2368.0f, 2160.0f, 0.0f, 16777215.0f};
constexpr uint32_t kStepBits = 0x38d1b717;
constexpr int32_t kCornerX = 1728 * 16, kCornerY = 1936 * 16;

}

// verify_opening_inputs.mjs tableSine and fog; the counter is 0 at set-up
template <class A>
Fog<A>::Fog() {
    const auto tableSine = [](int32_t angle) {
        int32_t a = angle < 0 ? -angle : angle;
        if (a >= 0x4000) a = 0x8000 - a;
        const float s = A::sinf(static_cast<float>(static_cast<double>(a) * kHalfPi * (1.0 / 16384.0)));
        return angle < 0 ? -s : s;
    };
    const auto sum = [](float a, float b) { return A::cut(static_cast<double>(a) + static_cast<double>(b)); };
    const float radius = A::rootExact(kRadiusSquared);
    const float centre = -5.1f;
    const int32_t angle = 0;
    const float cosine = tableSine(angle + 0x4000), sine = tableSine(angle);
    for (int i = 0; i < kPoints; ++i)
        for (int j = 0; j < kPoints; ++j) {
            const float x = sum(sum(static_cast<float>(j * 6), -48.0f), sum(cosine, cosine));
            const float y = sum(sum(static_cast<float>(i * 6), -48.0f), sum(sine, sine));
            const float dx = A::cut(static_cast<double>(centre) - static_cast<double>(sum(A::mul(A::mul(static_cast<float>(2 * j - 16), 6.0f), 0.5f), 3.0f)));
            const float dy = A::cut(0.0 - static_cast<double>(sum(A::mul(A::mul(static_cast<float>(2 * i - 16), 6.0f), 0.5f), 3.0f)));
            const float d = A::rootExact(sum(A::mul(dx, dx), A::mul(dy, dy)));
            const float over = A::cut(static_cast<double>(radius) - static_cast<double>(A::mul(d, 4.0f)));
            float level = sum(A::quotientExact(A::mul(over, 96.0f), radius), 0.0f);
            level = level < 0 ? 0.0f : 127 < level ? 127.0f : level;
            const int32_t dark = A::toInt(A::mul(A::mul(level, 0.0f), 0.0078125f));
            const size_t at = static_cast<size_t>(j * kPoints + i);
            m_mesh[at] = {x, y, 134.0f, 1.0f};
            m_brightness[at] = {dark, dark, A::toInt(A::mul(A::mul(level, 128.0f), 0.0078125f)), 0x80};
        }
}

// verify_opening_fog_v2.mjs expected
template <class A>
void Fog<A>::draw(const Mat4& worldToScreen, std::vector<Pass>& out) {
    m_stats = {};
    using V = Vu0<A>;
    const float step = asFloat(kStepBits);
    for (int layer = 0; layer < 6; ++layer) {
        float scroll = A::addExact(m_offsets[layer], A::mul(A::mul(A::mul(A::subExact(14.0f, static_cast<float>(layer)), step), A::addExact(static_cast<float>(layer), 1.0f)), 0.5f));
        if (1 < scroll) scroll = A::subExact(scroll, 1.0f);
        m_offsets[layer] = scroll;
        const float drop = A::mul(static_cast<float>(layer), 5.0f);

        Pass pass;
        pass.name = "fog " + std::to_string(layer);
        pass.target = TargetName::Display;
        pass.topology = PassTopology::Triangles;
        pass.material.source = SourceKind::Texture;
        pass.material.texture = kTextures[layer];
        pass.material.coordinates = CoordinateKind::Projective;
        pass.material.sampling = Sampling::Repeat;
        pass.material.bilinear = true;
        pass.material.blend = BlendOp::FixedAdd;
        pass.material.blendConstant = 20;
        pass.material.depthTest = DepthTest::GreaterEqual;
        pass.material.depthWrite = false;
        pass.material.gouraud = true;
        pass.halfLine = true;

        for (int row = 0; row < 16; ++row)
            for (int column = 0; column < 16; ++column) {
                const auto index = [&](int k) { return static_cast<size_t>((column + (k & 1)) * kPoints + row + (k >> 1)); };
                std::array<Vec4, 4> corners;
                for (int k = 0; k < 4; ++k) {
                    const Vec4& v = m_mesh[index(k)];
                    corners[k] = {v[0], v[1], A::subExact(v[2], drop), v[3]};
                }
                if (V::clipAll(kClipMin, kClipMax, worldToScreen, corners)) {
                    ++m_stats.leftOut;
                    continue;
                }
                ++m_stats.drawn;
                std::array<Vertex, 4> quad;
                for (int k = 0; k < 4; ++k) {
                    const Vec4 p = V::apply(worldToScreen, corners[k]);
                    const float q = A::quotientExact(1.0f, p[3]);
                    const int32_t sx = A::toInt(A::mul(A::mul(p[0], q), 16.0f));
                    const int32_t sy = A::toInt(A::mul(A::mul(p[1], q), 16.0f));
                    const int32_t sz = A::toInt(A::mul(A::mul(p[2], q), 16.0f)) >> 4;
                    const float across = A::mul(A::addExact(A::mul(static_cast<float>(k >> 1), 0.5f), A::mul(static_cast<float>(row & 1), 0.5f)), q);
                    const float along = A::mul(A::subExact(A::addExact(A::mul(static_cast<float>(k & 1), 0.5f), A::mul(static_cast<float>(column & 1), 0.5f)), scroll), q);
                    const int32_t level = m_brightness[index(k)][2];
                    Vertex& v = quad[k];
                    v.x = static_cast<float>(sx - kCornerX) * 0.0625f;
                    v.y = static_cast<float>(sy - kCornerY) * 0.0625f;
                    v.z = static_cast<uint32_t>(sz) & 0xffffff;
                    v.u = along;
                    v.v = across;
                    v.q = q;
                    v.r = static_cast<uint8_t>(level < 0 ? (level + 3) >> 2 : level >> 2);
                    v.g = static_cast<uint8_t>(level * 2 / 5);
                    v.b = static_cast<uint8_t>(level);
                    v.a = 0x80;
                }
                pass.vertices.insert(pass.vertices.end(), {quad[0], quad[1], quad[2], quad[1], quad[2], quad[3]});
            }
        if (!pass.vertices.empty()) out.push_back(std::move(pass));
    }
}

#ifndef SCENE_NATIVE_ONLY
template class Fog<EeArithmetic>;
#endif
template class Fog<NativeArithmetic>;

}
