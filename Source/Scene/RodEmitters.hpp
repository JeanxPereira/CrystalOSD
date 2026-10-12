#pragma once
#include <cstdint>
#include <utility>

#include "Scene/Matrix.hpp"
#include "Scene/Rods.hpp"

namespace scene {

// The rods' emitters (facts/clock-rod-draw.md), shared with the cubes (facts/config-cubes.md).
template <class A>
struct RodEmitters {
    using M = Matrix<A>;
    static constexpr float kTenth = 0.1f, kNineTenths = 0.9f, kAlmostOne = 0.99f, kInward = 0.95f;
    static bool truthy(float x) { return x == x && x != 0.0f; }
    const RodsInput& input;

    RodVertex position(const RodFaceVertex& v) const {
        RodVertex out;
        out.x = static_cast<float>(v.fixed[0] - ((0x800 - (input.width >> 1)) << 4)) / 16.0f;
        out.y = static_cast<float>(v.fixed[1] - ((0x800 - (input.height >> 1)) << 4)) / 16.0f;
        out.z = static_cast<float>(v.fixed[2]) / 16.0f;
        return out;
    }
    static void paint(RodVertex& v, int32_t r, int32_t g, int32_t b, int32_t a) {
        v.r = static_cast<float>(r) / 128.0f;
        v.g = static_cast<float>(g) / 128.0f;
        v.b = static_cast<float>(b) / 128.0f;
        v.a = static_cast<float>(a) / 128.0f;
    }

    // facts/clock-rod-draw.md, "Refracted emitter"; HDD OSD clamps the coordinates to the screen.
    RodFaceDraw refracted(const RodFace& face, const RodRecord& rod, float cx, float cy, int32_t extra, RodPiece piece) const {
        const float edge = Rods<A>::edgeTerm(face);
        int32_t bright = A::toInt(A::mul(A::mul(A::mul(A::mul(A::mul(rod.strength, 10.0f), edge), edge), edge), edge));
        if (kNineTenths < edge) {
            const int32_t angle = s16(A::toInt(A::div(A::mul(A::sub(1.0f, edge), 32768.0f), kTenth)));
            bright = A::toInt(A::mul(A::cut(static_cast<double>(bright)), A::mul(A::sub(1.0f, A::cos16(angle)), 0.5f)));
        }
        const auto channel = [&](int32_t base) { const int32_t value = bright + base + extra; return value < 0x100 ? value : 0xff; };
        const auto clampTo = [](int32_t value, int32_t top) { return value < 0 ? 0 : value > top ? top : value; };
        RodFaceDraw draw{face.index, piece, !(kAlmostOne < edge), {}};
        const float halfW = A::cut(static_cast<double>(input.width / 2)), halfH = A::cut(static_cast<double>(input.height / 2));
        const float half = A::mul(A::cut(static_cast<double>(input.field)), 0.5f);
        for (size_t k = 0; k < 4; ++k) {
            const RodFaceVertex& vertex = face.vertices[k];
            const float push = A::mul(A::mul(A::mul(face.normal[0], 1000.0f), vertex.q), rod.refraction);
            const float u = A::sub(A::add(A::mul(A::sub(A::sub(vertex.screen[0], 2048.0f), cx), kInward), cx), push);
            const float lift = A::mul(A::mul(A::mul(face.normal[1], 500.0f), vertex.q), rod.refraction);
            const float v = A::sub(A::add(A::mul(A::sub(A::sub(vertex.screen[1], 2048.0f), cy), kInward), cy), lift);
            const int32_t ui = clampTo(A::toInt(A::mul(A::add(halfW, u), 16.0f)), input.width * 16);
            const int32_t vi = clampTo(A::toInt(A::mul(A::sub(A::add(halfH, v), half), 16.0f)), input.height * 16);
            RodVertex& out = draw.strip[k];
            out = position(vertex);
            out.u = static_cast<float>(ui) / 16.0f;
            out.v = static_cast<float>(vi) / 16.0f;
            out.q = 1.0f;
            paint(out, channel(rod.base[0]), channel(rod.base[1]), channel(rod.base[2]), 0x80);
        }
        return draw;
    }

    // facts/clock-rod-draw.md, "Textured emitter".
    RodFaceDraw textured(const RodFace& face, const Colour& colour, float ds, float dt, RodPiece piece) const {
        RodFaceDraw draw{face.index, piece, false, {}};
        for (size_t k = 0; k < 4; ++k) {
            const RodFaceVertex& vertex = face.vertices[k];
            RodVertex& out = draw.strip[k];
            out = position(vertex);
            out.u = A::mul(A::add(vertex.s, ds), vertex.q);
            out.v = A::mul(A::add(vertex.t, dt), vertex.q);
            out.q = vertex.q;
            paint(out, colour[0], colour[1], colour[2], colour[3]);
        }
        return draw;
    }

    // facts/clock-extra-passes.md, "The reflection emitter".
    RodFaceDraw reflected(const RodFace& face, const Colour& colour, RodPiece piece, bool edgeSmoothing = false) const {
        RodFaceDraw draw{face.index, piece, edgeSmoothing, {}};
        const Vec3 normal{face.normal[0], face.normal[1], face.normal[2]};
        for (size_t k = 0; k < 4; ++k) {
            const RodFaceVertex& vertex = face.vertices[k];
            const Vec3 eye = M::normalize({vertex.eye[0], vertex.eye[1], vertex.eye[2]});
            const float d = M::dot(eye, normal);
            const float twice = A::add(d, d);
            const float amount = twice < 0 ? -twice : twice;
            const float r0 = A::add(eye[0], A::mul(face.normal[0], amount));
            const float r1 = A::add(eye[1], A::mul(face.normal[1], amount));
            RodVertex& out = draw.strip[k];
            out = position(vertex);
            out.u = static_cast<float>(A::toUnsigned(A::mul(A::add(r0, 1.0f), 512.0f))) / 16.0f;
            out.v = static_cast<float>(A::toUnsigned(A::mul(A::add(r1, 1.0f), 256.0f))) / 16.0f;
            out.q = 1.0f;
            paint(out, colour[0], colour[1], colour[2], colour[3]);
        }
        return draw;
    }

    // facts/clock-rod-draw.md, "Texture offsets handed to the textured emitter".
    static std::pair<float, float> offsets(const RodRecord& rod, const RodFace& face, float lift, bool paired) {
        const float stepped = A::add(A::cut(static_cast<double>(rod.number) * kTenth), A::cut(static_cast<double>(face.index) * kTenth));
        if (!paired) return {stepped, truthy(lift) ? A::add(stepped, lift) : stepped};
        return {A::add(stepped, rod.pair[0]), truthy(lift) ? A::add(A::add(stepped, rod.pair[1]), lift) : A::add(stepped, rod.pair[1])};
    }
};

}
