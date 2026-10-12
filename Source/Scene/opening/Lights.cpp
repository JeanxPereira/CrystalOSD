#include "Scene/opening/Lights.hpp"

#include "Scene/opening/Vu0.hpp"

namespace scene::opening {

namespace {

// verify_opening_lights_v2.mjs: the constants at 0x0036FA0C, the tables at 0x002B0E30, the clip box at 0x002B0C20
constexpr uint32_t kFactorBits[4] = {0x3c23d70a, 0x3dcccccd, 0x3ba3d70a, 0x3dcccccd};
constexpr float kColours[4][3] = {{32, 128, 0}, {128, 32, 64}, {128, 0, 0}, {64, 32, 128}};
constexpr float kGlowHalf = 0.8f, kCoreHalf = 0.25f;
constexpr int32_t kAlphas[2] = {24, 12};
const Vec4 kClipMin = {1728.0f, 1936.0f, 0.0f, 5.0f};
const Vec4 kClipMax = {2368.0f, 2160.0f, 0.0f, 16777215.0f};
constexpr int32_t kCornerX = 1728 * 16, kCornerY = 1936 * 16;
constexpr int32_t kLightTexture = 8;
// The FIX field of the lights' ALPHA register as the dump records it (the blend does not read it: C is the source alpha).
constexpr uint8_t kAlphaFix = 0x80;

int32_t mod128(int32_t x) { return x - (((x < 0 ? x + 127 : x) >> 7) << 7); }

std::array<Vec4, 4> cornersOf(int pair) {
    const float h = pair == 0 ? kGlowHalf : kCoreHalf;
    return {{{-h, -h, 0, 1}, {h, -h, 0, 1}, {-h, h, 0, 1}, {h, h, 0, 1}}};
}
constexpr float kCoordinates[4][2] = {{0, 0}, {1, 0}, {0, 1}, {1, 1}};

Pass spritePass() {
    Pass pass;
    pass.name = "light sprites";
    pass.target = TargetName::Display;
    pass.topology = PassTopology::Triangles;
    pass.material.source = SourceKind::Texture;
    pass.material.texture = kLightTexture;
    pass.material.coordinates = CoordinateKind::Projective;
    pass.material.sampling = Sampling::Repeat;
    pass.material.bilinear = true;
    pass.material.blend = BlendOp::Add;
    pass.material.blendConstant = kAlphaFix;
    pass.material.depthTest = DepthTest::Always;
    pass.material.depthWrite = false;
    pass.material.gouraud = true;
    pass.halfLine = true;
    return pass;
}

Pass trailPass() {
    Pass pass;
    pass.name = "light trails";
    pass.target = TargetName::Display;
    pass.topology = PassTopology::Lines;
    pass.material.blend = BlendOp::Add;
    pass.material.blendConstant = kAlphaFix;
    pass.material.depthTest = DepthTest::Always;
    pass.material.depthWrite = false;
    pass.material.gouraud = true;
    pass.halfLine = true;
    pass.edgeSmoothing = true;
    return pass;
}

}

template <class A>
Lights<A>::Lights(uint32_t phase) : m_phase(static_cast<int32_t>(phase)) {
    for (auto& light : m_matrices)
        for (Mat4& m : light) m = Vu0<A>::unitMatrix();
}

// verify_opening_lights_v2.mjs expected
template <class A>
void Lights<A>::draw(int32_t counter, const Mat4& worldToScreen, std::vector<Pass>& out) {
    m_stats = {};
    using V = Vu0<A>;
    const float ka = asFloat(kFactorBits[0]), kb = asFloat(kFactorBits[1]), kc = asFloat(kFactorBits[2]), kd = asFloat(kFactorBits[3]);
    const Mat4 base = V::unitMatrix();
    const Vec4 origin = {0, 0, 0, 1};

    const auto transform = [&](const Mat4& m, const Vec4& v, int32_t (&ints)[3], float& q) {
        const Vec4 p = V::apply(m, v);
        q = A::quotientExact(1.0f, p[3]);
        ints[0] = A::toInt(A::mul(A::mul(p[0], q), 16.0f));
        ints[1] = A::toInt(A::mul(A::mul(p[1], q), 16.0f));
        ints[2] = A::toInt(A::mul(A::mul(p[2], q), 16.0f)) >> 4;
    };

    Pass sprites = spritePass();
    for (int i = 0; i < kLights; ++i) {
        const float a = A::mul(A::mul(A::mul(A::addExact(static_cast<float>(counter + m_phase), static_cast<float>(17 * i)), ka), A::addExact(static_cast<float>(i), 10.0f)), kb);
        const float b = A::mul(A::mul(A::mul(A::addExact(static_cast<float>(counter + m_phase), static_cast<float>(15 * i)), kc), A::addExact(static_cast<float>(i), 10.0f)), kd);
        m_angles[i * 2] = a;
        m_angles[i * 2 + 1] = b;
        const float cosine = A::cosf(a), sine = A::sinf(b);
        m_cosines[i] = cosine;
        m_sines[i] = sine;
        for (int n = 0; n < 4; ++n) {
            Mat4 m;
            if (n == 3) {
                const Vec4 centre = {A::mul(A::subExact(10.0f, static_cast<float>(i)), cosine), A::mul(A::addExact(static_cast<float>(i), 3.0f), sine),
                                     A::addExact(A::mul(cosine, 12.0f), 88.0f), 0.0f};
                m_centres[i] = centre;
                const Mat4 moved = {base[0], base[1], base[2],
                                    {A::addExact(base[3][0], centre[0]), A::addExact(base[3][1], centre[1]), A::addExact(base[3][2], centre[2]), base[3][3]}};
                m = V::mulMatrix(worldToScreen, moved);
                m_matrices[i][3] = m;
            } else {
                m_matrices[i][n] = m_matrices[i][n + 1];
                m = m_matrices[i][n];
            }
            int32_t at[3];
            float q = 0;
            transform(m, origin, at, q);
            m_ring[i][m_head] = {at[0], at[1], at[2], 16};

            ++m_stats.spritePackets;
            for (int pair = 0; pair < 2; ++pair) {
                const std::array<Vec4, 4> quad = cornersOf(pair);
                if (V::clipAll(kClipMin, kClipMax, m, quad)) {
                    ++m_stats.quadsLeftOut;
                    continue;
                }
                ++m_stats.quadsDrawn;
                const int32_t alpha = kAlphas[pair] * (n + 1) / 5;
                std::array<Vertex, 4> v;
                for (int k = 0; k < 4; ++k) {
                    int32_t s[3];
                    float w = 0;
                    transform(m, quad[k], s, w);
                    v[k].x = static_cast<float>(s[0] - kCornerX) * 0.0625f;
                    v[k].y = static_cast<float>(s[1] - kCornerY) * 0.0625f;
                    v[k].z = static_cast<uint32_t>(s[2]) & 0xffffff;
                    v[k].u = A::mul(kCoordinates[k][0], w);
                    v[k].v = A::mul(kCoordinates[k][1], w);
                    v[k].q = w;
                    if (pair == 0) {
                        v[k].r = static_cast<uint8_t>(A::toUnsigned(A::mul(kColours[i % 4][0], 0.5f)));
                        v[k].g = static_cast<uint8_t>(A::toUnsigned(A::mul(kColours[i % 4][1], 0.5f)));
                        v[k].b = static_cast<uint8_t>(A::toUnsigned(A::mul(kColours[i % 4][2], 0.5f)));
                    } else {
                        v[k].r = v[k].g = v[k].b = 0x80;
                    }
                    v[k].a = static_cast<uint8_t>(alpha);
                }
                sprites.vertices.insert(sprites.vertices.end(), {v[0], v[1], v[2], v[1], v[2], v[3]});
            }
        }
    }
    if (!sprites.vertices.empty()) out.push_back(std::move(sprites));

    m_head = mod128(m_head + 1);
    if (m_head == m_tail) m_tail = mod128(m_tail + 1);

    Pass trails = trailPass();
    for (int i = 0; i < kLights; ++i) {
        ++m_stats.trailPackets;
        const int32_t end = mod128(m_tail + 1);
        int32_t at = mod128(m_head + 127);
        const int32_t length = mod128(m_head - (end - 127));
        int32_t previousY = 0;
        std::vector<Vertex> strip;
        std::vector<bool> kicked;
        for (int32_t step = 0; at != end; ++step, at = mod128(at + 127)) {
            const int32_t level = ((length - step) << 6) / length;
            if ((step & 7) != 0) continue;
            const float levelValue = static_cast<float>(level);
            const auto channel = [&](float c) { return A::toInt(A::mul(A::mul(c, levelValue), 0.0078125f)); };
            const auto& entry = m_ring[i][at];
            const int32_t before = previousY;
            const int32_t sx = (entry[0] >> 4) - 0x6c0;
            const int32_t sy = (entry[1] >> 4) - 0x790;
            previousY = sy;
            const bool hidden = entry[2] < 5 || sx < 0 || 640 < sx || sy < 0 || 224 < sy || before < 0 || 640 < before;
            Vertex v;
            v.x = static_cast<float>(entry[0] - kCornerX) * 0.0625f;
            v.y = static_cast<float>(entry[1] - kCornerY) * 0.0625f;
            v.z = static_cast<uint32_t>(entry[2]) & 0xffffff;
            v.r = static_cast<uint8_t>(channel(kColours[i][0]));
            v.g = static_cast<uint8_t>(channel(kColours[i][1]));
            v.b = static_cast<uint8_t>(channel(kColours[i][2]));
            v.a = static_cast<uint8_t>(level << 1);
            strip.push_back(v);
            kicked.push_back(!hidden);
            if (hidden) ++m_stats.trailHidden;
        }
        for (size_t j = 1; j < strip.size(); ++j)
            if (kicked[j]) trails.vertices.insert(trails.vertices.end(), {strip[j - 1], strip[j]});
    }
    if (!trails.vertices.empty()) out.push_back(std::move(trails));
}

#ifndef SCENE_NATIVE_ONLY
template class Lights<EeArithmetic>;
#endif
template class Lights<NativeArithmetic>;

}
