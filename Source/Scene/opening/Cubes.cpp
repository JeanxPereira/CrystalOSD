#include "Scene/opening/Cubes.hpp"

#include <span>
#include <string>

#include "Scene/opening/Vu0.hpp"

namespace scene::opening {

namespace {

enum class Make { Refract, Fixed, Mirror };

struct Row {
    bool edge;
    bool screen;
    int32_t colour;
    Make make;
    int32_t value;
};

// A generator's argument: an index into the constants D_0036FA1C..48 or one of the literals.
constexpr int32_t kPull = 9, kFixedA = 7, kFixedB = 8, kFixedC = 10, kFixedD = 11, kZero = -1, kMirrorFar = -2, kMirrorNear = -3;

// facts/opening.md 4.1, the table of ten passes (descriptors built at 0x00220450..0x0022076C, verify_opening_cubes_v2.mjs PASSES).
constexpr std::array<CubePassSetup, 10> kSetups{{
    {true, 0, 4, 0x7a}, {true, 12, 5, 0x80}, {true, 10, 8, 0x2a}, {true, 11, 5, 0x80}, {true, 10, 8, 0x2a},
    {false, 0, 4, 0xf0}, {false, 12, 5, 0x80}, {false, 10, 8, 0x40}, {false, 11, 5, 0x80}, {false, 10, 8, 0x40},
}};
constexpr std::array<Row, 10> kRows{{
    {true, true, 2, Make::Refract, kZero}, {false, false, 0, Make::Fixed, kFixedA}, {false, false, 3, Make::Mirror, kMirrorFar},
    {false, false, 0, Make::Fixed, kFixedB}, {false, false, 3, Make::Mirror, kMirrorFar},
    {true, true, 2, Make::Refract, kPull}, {false, false, 0, Make::Fixed, kFixedC}, {false, false, 3, Make::Mirror, kMirrorNear},
    {false, false, 0, Make::Fixed, kFixedD}, {false, false, 3, Make::Mirror, kMirrorNear},
}};

// D_0036FA1C..48 (the graded colour's scale, slopes and bases, then the shifts and the pull) and D_0036FB80 (the facing limit).
constexpr uint32_t kConstantBits[12] = {0x3ecccccdu, 0x3f19999au, 0x3e4ccccdu, 0x3f19999au, 0x3e4ccccdu, 0x3f19999au,
                                        0x3e4ccccdu, 0xbb75c28fu, 0x3b75c28fu, 0xbdac0831u, 0xbbf5c28fu, 0x3bf5c28fu};
constexpr uint32_t kFacingLimitBits = 0x3ba3d70au;

// D_002B1D10 faces, D_002B1DC0 mirror directions, the fixed pattern's corners (func_00224B10).
constexpr int32_t kFaces[6][4] = {{0, 1, 2, 3}, {5, 4, 7, 6}, {4, 0, 6, 2}, {2, 3, 6, 7}, {1, 5, 3, 7}, {4, 5, 0, 1}};
constexpr uint32_t kMirrorBits[6][4] = {{0x0u, 0x0u, 0xbf800000u, 0x3f800000u}, {0x0u, 0x0u, 0x3f800000u, 0x3f800000u},
                                        {0xbf800000u, 0x0u, 0x0u, 0x3f800000u}, {0x0u, 0x3f800000u, 0x0u, 0x3f800000u},
                                        {0x3f800000u, 0x0u, 0x0u, 0x3f800000u}, {0x0u, 0xbf800000u, 0x0u, 0x3f800000u}};
constexpr float kFixedPairs[4][2] = {{0.0f, 0.0f}, {1.0f, 0.0f}, {0.0f, 1.0f}, {1.0f, 1.0f}};

constexpr float kPi = 3.14159274101257324f, kTwoPi = 6.28318548202514648f;
constexpr int32_t kWidth = 640, kHeight = 224;
constexpr int32_t kOffsetX = 1728 * 16, kOffsetY = 1936 * 16;

template <class A>
struct Lib {
    static Vec4 normalize(const Vec4& v) {
        const float length = A::rootExact(A::addExact(A::addExact(A::mul(v[0], v[0]), A::mul(v[1], v[1])), A::mul(v[2], v[2])));
        const float q = A::quotientExact(1.0f, length);
        return {A::mul(v[0], q), A::mul(v[1], q), A::mul(v[2], q), 0.0f};
    }
    static Vec4 outer(const Vec4& a, const Vec4& b) {
        return {A::subExact(A::mul(a[1], b[2]), A::mul(b[1], a[2])), A::subExact(A::mul(a[2], b[0]), A::mul(b[2], a[0])),
                A::subExact(A::mul(a[0], b[1]), A::mul(b[0], a[1])), 0.0f};
    }
    static float inner(const Vec4& a, const Vec4& b) { return A::addExact(A::addExact(A::mul(a[0], b[0]), A::mul(a[1], b[1])), A::mul(a[2], b[2])); }
    static float absolute(float d) { return d < 0 ? -d : d; }
};

// A run of faces under one GS state is one pass: the next face joins the last pass when its state is the same.
void append(std::vector<Pass>& out, const Pass& header, const std::vector<Vertex>& vertices) {
    Pass* last = out.empty() ? nullptr : &out.back();
    if (!last || last->name != header.name || last->target != header.target || !(last->material == header.material) || last->edgeSmoothing != header.edgeSmoothing)
        last = &out.emplace_back(header);
    last->vertices.insert(last->vertices.end(), vertices.begin(), vertices.end());
}

}

const std::array<CubePassSetup, 10>& cubePassSetups() { return kSetups; }

// facts/opening.md 4.1, InitLightsCubes 0x002209E0: the table D_002B0F40 and the constants D_0036FA50..68 are read from the program.
template <class A>
Cubes<A>::Cubes(const ProgramImage& program) {
    const float scale = program.single(0x0036fa50), spread = program.single(0x0036fa54), base = program.single(0x0036fa58), speed = program.single(0x0036fa5c);
    const float tilt = program.single(0x0036fa60), drift = program.single(0x0036fa64), fallback = program.single(0x0036fa68);
    for (int32_t n = 0; n < 5; ++n) {
        const uint32_t at = 0x002b0f40u + static_cast<uint32_t>(n) * 16u;
        State& s = m_cubes[static_cast<size_t>(n)];
        s.place = {A::mul(3.5f, program.single(at)), A::mul(3.5f, program.single(at + 4)), A::subExact(150.0f, A::mul(15.0f, program.single(at + 8))), 0.0f};
        float u = A::mul(static_cast<float>(n - 2), scale);
        if (u == 0.0f) u = fallback;
        const float angle = A::addExact(A::mul(A::mul(u, static_cast<float>(n % 3)), spread), base);
        s.angles = {angle, angle, angle, angle};
        s.rates = {A::quotientExact(speed, u), A::mul(u, tilt), A::addExact(A::quotientExact(u, 1000.0f), drift), 0.0f};
    }
}

// facts/opening.md 4.1 (verify_opening_cubes_v2.mjs: turn, transform, pass).
template <class A>
void Cubes<A>::draw(const Matrices& matrices, const Vec4& camera, std::vector<Pass>& out, std::vector<CubeWork>* probe, int32_t field) {
    using L = Lib<A>;
    using V = Vu0<A>;
    constexpr Vec4 kClipMin{1728.0f, 1936.0f, 0.0f, 5.0f}, kClipMax{2368.0f, 2160.0f, 0.0f, 16777215.0f};
    const Vec4 colour{112.0f, 112.0f, 152.0f, 128.0f};
    std::array<Vec4, 8> vertices{};
    for (size_t i = 0; i < 8; ++i) vertices[i] = {(i & 1) ? 1.8f : -1.8f, (i & 2) ? 1.8f : -1.8f, (i & 4) ? 1.8f : -1.8f, 1.0f};
    float constants[12];
    for (size_t i = 0; i < 12; ++i) constants[i] = asFloat(kConstantBits[i]);
    const float facingLimit = asFloat(kFacingLimitBits);

    for (int32_t n = 0; n < 5; ++n) {
        State& state = m_cubes[static_cast<size_t>(n)];
        for (size_t i = 0; i < 3; ++i) {
            float a = A::addExact(state.angles[i], state.rates[i]);
            if (kPi < a) a = A::subExact(a, kTwoPi);
            if (a < -kPi) a = A::addExact(a, kTwoPi);
            state.angles[i] = a;
        }
        CubeWork work;
        work.index = n;
        work.angles = state.angles;
        work.angles[3] = 0.0f;
        work.turned = V::rotMatrix(V::unitMatrix(), state.angles);
        work.toWorld = V::transMatrix(work.turned, state.place);
        work.toScreen = V::mulMatrix(matrices.worldToScreen, work.toWorld);
        if (V::clipAll(kClipMin, kClipMax, work.toScreen, vertices)) continue;

        const Vec4 origin = V::apply(work.toScreen, {0.0f, 0.0f, 0.0f, 1.0f});
        const float originQ = A::quotientExact(1.0f, origin[3]);
        work.centre = {A::mul(origin[0], originQ), A::mul(origin[1], originQ), A::mul(origin[2], originQ), 1.0f};

        for (size_t i = 0; i < 8; ++i) {
            CubeCorner& c = work.corners[i];
            c.world = V::apply(work.toWorld, vertices[i]);
            c.eye = L::normalize(V::apply(matrices.camera, c.world));
            const Vec4 p = V::apply(work.toScreen, vertices[i]);
            c.q = A::quotientExact(1.0f, p[3]);
            for (size_t k = 0; k < 4; ++k) c.screen[k] = A::mul(p[k], c.q);
            c.ints = {A::toInt(A::mul(c.screen[0], 16.0f)), A::toInt(A::mul(c.screen[1], 16.0f)), A::toInt(A::mul(c.screen[2], 16.0f)) >> 4,
                      A::toInt(A::mul(c.screen[3], 16.0f))};
        }
        for (size_t f = 0; f < 6; ++f) {
            CubeFace& face = work.faces[f];
            for (size_t k = 0; k < 4; ++k) face.corners[k] = kFaces[f][k];
            const Vec4 object = L::outer(V::subVector(vertices[kFaces[f][1]], vertices[kFaces[f][0]]), V::subVector(vertices[kFaces[f][2]], vertices[kFaces[f][0]]));
            const Vec4 world = V::apply(work.toWorld, object);
            const Vec4 view = V::apply(matrices.camera, world);
            const auto flat = [&](int32_t a, int32_t b) {
                return L::normalize({A::subExact(work.corners[a].screen[0], work.corners[b].screen[0]), A::subExact(work.corners[a].screen[1], work.corners[b].screen[1]), 0.0f, 0.0f});
            };
            const Vec4 a = flat(kFaces[f][0], kFaces[f][1]), b = flat(kFaces[f][0], kFaces[f][2]);
            face.object = L::normalize(object);
            face.world = L::normalize(world);
            face.view = L::normalize(view);
            face.facing = A::subExact(A::mul(a[0], b[1]), A::mul(a[1], b[0]));
            for (size_t k = 0; k < 4; ++k) face.colour[k] = colour[k] < 0.0f ? 0.0f : colour[k] > 127.0f ? 127.0f : colour[k];
            for (size_t k = 0; k < 4; ++k) {
                const float d = L::inner(face.world, L::normalize(V::subVector(work.corners[kFaces[f][k]].world, camera)));
                face.edge[k] = L::absolute(d);
            }
        }

        // module_opening_225728: the clear of the extra buffer (outside the scissor) and the copy of the frame into it, before the passes.
        Pass clear;
        clear.name = "cube" + std::to_string(n) + " clear";
        clear.target = TargetName::Extra;
        clear.topology = PassTopology::Sprites;
        clear.halfLine = true;
        clear.material.depthWrite = false;
        clear.vertices = {Vertex{-1728.0f, -1936.0f, 0, 0, 0, 1, 0, 0, 0, 0}, Vertex{-1088.0f, -1712.0f, 0, 0, 0, 1, 0, 0, 0, 0}};
        out.push_back(clear);
        Pass copy;
        copy.name = "cube" + std::to_string(n) + " copy";
        copy.target = TargetName::Extra;
        copy.topology = PassTopology::Sprites;
        copy.halfLine = true;
        copy.material.source = SourceKind::Target;
        copy.material.sourceTarget = TargetName::Display;
        copy.material.colourOnly = true;
        copy.material.coordinates = CoordinateKind::Texel;
        copy.material.sampling = Sampling::Repeat;
        copy.material.bilinear = true;
        copy.material.perPixelAlpha = true;
        copy.material.depthWrite = false;
        copy.vertices = {Vertex{0.0f, 0.0f, 0, 0.5f, 0.5f, 1, 128, 128, 128, 0}, Vertex{639.5f, 223.5f, 0, 640.0f, 224.0f, 1, 128, 128, 128, 0}};
        out.push_back(copy);

        // The ten passes (verify_opening_cubes_v2.mjs pass, func_002254E0 with the callback at 0x0021FEB8).
        for (int32_t p = 0; p < 10; ++p) {
            const CubePassSetup& setup = kSetups[static_cast<size_t>(p)];
            const Row& row = kRows[static_cast<size_t>(p)];
            const float fix = static_cast<float>(setup.fix);
            for (size_t f = 0; f < 6; ++f) {
                const CubeFace& face = work.faces[f];
                if ((face.facing < 0.0f) != setup.away) continue;

                std::array<std::array<float, 2>, 4> pairs{};
                if (row.make == Make::Refract) {
                    const float pull = row.value == kZero ? 0.0f : constants[row.value];
                    for (size_t i = 0; i < 4; ++i) {
                        const CubeCorner& c = work.corners[static_cast<size_t>(face.corners[i])];
                        const float u = A::addExact(A::addExact(A::subExact(c.screen[0], 2048.0f), static_cast<float>(kWidth / 2)),
                                                    A::mul(A::mul(A::mul(A::mul(face.view[0], 320.0f), 1.0f), c.q), 4.0f));
                        const float v = A::addExact(A::addExact(A::subExact(c.screen[1], 2048.0f), static_cast<float>(kHeight / 2)),
                                                    A::mul(A::mul(A::mul(A::mul(face.view[1], 112.0f), 1.0f), c.q), 4.0f));
                        float x = A::addExact(u, A::mul(A::subExact(c.screen[0], work.centre[0]), pull));
                        float y = A::addExact(v, A::mul(A::subExact(c.screen[1], work.centre[1]), pull));
                        const float w1 = A::subExact(static_cast<float>(kWidth), 1.0f), h1 = A::subExact(static_cast<float>(kHeight), 1.0f);
                        if (w1 < x) x = w1; else if (x < 1.0f) x = 1.0f;
                        if (h1 < y) y = h1; else if (y < 1.0f) y = 1.0f;
                        pairs[i] = {x, y};
                    }
                } else if (row.make == Make::Mirror) {
                    const float value = row.value == kMirrorFar ? -0.25f : 0.5f;
                    const Vec4 mirror{asFloat(kMirrorBits[f][0]), asFloat(kMirrorBits[f][1]), asFloat(kMirrorBits[f][2]), asFloat(kMirrorBits[f][3])};
                    const float d = L::inner(face.object, mirror);
                    const float amount = A::mul(-L::absolute(d), value);
                    const Vec4 moved{A::mul(face.view[0], amount), A::mul(face.view[1], amount), A::mul(face.view[2], amount), face.view[3]};
                    for (size_t i = 0; i < 4; ++i) {
                        const Vec4 e = L::normalize(work.corners[static_cast<size_t>(face.corners[i])].eye);
                        pairs[i] = {A::addExact(A::addExact(moved[1], e[1]), 0.5f), A::addExact(A::addExact(moved[0], e[0]), 0.5f)};
                    }
                } else {
                    const float shift = constants[row.value];
                    for (size_t i = 0; i < 4; ++i) pairs[i] = {A::addExact(kFixedPairs[i][0], shift), A::subExact(kFixedPairs[i][1], shift)};
                }

                const bool smooth = row.edge && (facingLimit < face.facing || setup.away);
                std::array<Vertex, 4> corner{};
                for (size_t i = 0; i < 4; ++i) {
                    const CubeCorner& c = work.corners[static_cast<size_t>(face.corners[i])];
                    const float lift = A::mul(A::mul(A::subExact(1.0f, face.edge[i]), A::subExact(1.0f, face.edge[i])), 0.5f);
                    float q, s, t;
                    if (row.screen) {
                        const float half = !setup.away && field != 0 ? 0.5f : 0.0f;
                        q = 1.0f;
                        s = A::mul(pairs[i][0], 0.0009765625f);
                        t = A::mul(A::subExact(pairs[i][1], half), 0.00390625f);
                        s = s < 0.0f ? 0.0f : 0.625f < s ? 0.625f : s;
                        t = t < 0.0f ? 0.0f : 0.875f < t ? 0.875f : t;
                    } else {
                        q = c.q;
                        s = A::mul(pairs[i][0], q);
                        t = A::mul(pairs[i][1], q);
                    }
                    int32_t rgb[3];
                    for (size_t k = 0; k < 3; ++k) {
                        if (row.colour == 0) {
                            rgb[k] = 0x80;
                        } else if (row.colour == 2) {
                            rgb[k] = A::toInt(A::mul(A::mul(A::addExact(face.colour[k], A::mul(lift, 32.0f)), fix), 0.0078125f));
                        } else {
                            const float scaled = A::mul(lift, constants[0]);
                            rgb[k] = A::toInt(A::mul(A::mul(A::mul(face.colour[k], A::addExact(A::mul(scaled, constants[1 + k * 2]), constants[2 + k * 2])), fix), 0.0078125f));
                        }
                        rgb[k] = rgb[k] > 0x80 ? 0x80 : rgb[k] < 0 ? 0 : rgb[k];
                    }
                    Vertex& v = corner[i];
                    v.x = static_cast<float>(c.ints[0] - kOffsetX) / 16.0f;
                    v.y = static_cast<float>(c.ints[1] - kOffsetY) / 16.0f;
                    v.z = static_cast<uint32_t>(c.ints[2]) & 0xffffffu;
                    v.u = s;
                    v.v = t;
                    v.q = q;
                    v.r = static_cast<uint8_t>(rgb[0]);
                    v.g = static_cast<uint8_t>(rgb[1]);
                    v.b = static_cast<uint8_t>(rgb[2]);
                    v.a = 0x80;
                }

                Pass header;
                header.name = "cube" + std::to_string(n) + " pass" + std::to_string(p);
                header.target = setup.away ? TargetName::Extra : TargetName::Display;
                header.topology = PassTopology::Triangles;
                header.edgeSmoothing = smooth;
                header.halfLine = true;
                Material& m = header.material;
                m.coordinates = CoordinateKind::Projective;
                m.sampling = Sampling::Repeat;
                m.bilinear = true;
                m.depthTest = DepthTest::Always;
                m.depthWrite = false;
                if (row.make == Make::Refract) {
                    m.source = SourceKind::Target;
                    m.sourceTarget = setup.away ? TargetName::Display : TargetName::Extra;
                    m.blend = smooth ? BlendOp::AlphaOver : BlendOp::Opaque;
                    m.blendConstant = smooth ? setup.fix : 0;
                } else {
                    m.source = SourceKind::Texture;
                    m.texture = setup.texture;
                    m.blend = setup.mode == 5 ? BlendOp::Add : BlendOp::AddDestinationAlpha;
                    m.blendConstant = setup.fix;
                }

                std::vector<Vertex> triangles;
                triangles.reserve(6);
                for (size_t i = 0; i + 2 < 4; ++i) {
                    Vertex tri[3] = {corner[i], corner[i + 1], corner[i + 2]};
                    for (Vertex& v : tri) {
                        v.r = tri[2].r;
                        v.g = tri[2].g;
                        v.b = tri[2].b;
                        v.a = tri[2].a;
                    }
                    triangles.insert(triangles.end(), tri, tri + 3);
                }
                append(out, header, triangles);
            }
        }
        if (probe) probe->push_back(work);
    }
}

#ifndef SCENE_NATIVE_ONLY
template class Cubes<EeArithmetic>;
#endif
template class Cubes<NativeArithmetic>;

}
