#include "Scene/Orbs.hpp"

#include <utility>

namespace scene {

namespace {

constexpr uint32_t kDepthToSize = 0x36da1a93u;

// JS `(value < 0 ? value + (1 << by) - 1 : value) >> by`: a division by 2^by toward zero.
int32_t shift(int32_t value, int by) { return (value < 0 ? value + (1 << by) - 1 : value) >> by; }

int32_t imul(int32_t a, int32_t b) { return static_cast<int32_t>(static_cast<uint32_t>(a) * static_cast<uint32_t>(b)); }

int32_t faded(const Ramp& ramp, int32_t alpha) { return ramp.length == 0 ? 0 : (ramp.counter * alpha) / ramp.length; }

}

// facts/clock-camera.md: the orbit of orb k (clock_frame.mjs orbMatrix).
template <class A>
Mat4 Orbs<A>::orbitMatrix(int k, int32_t hourHand, int32_t secondHand, float minuteTurn, float secondsTurn, float factor, float radius) {
    using M = Matrix<A>;
    Mat4 m = M::rotateZ(M::rotateY(M::rotateZ(M::identity(), hourHand), secondHand), -0x8000);
    m = M::rotateY(m, s16(A::toInt(A::mul(minuteTurn, factor))));
    m = M::rotateX(m, s16(A::toInt(A::mul(static_cast<float>(k + 0x15), secondsTurn))));
    m = M::move(m, 0, radius, 0);
    return M::rotateY(m, 0x2000);
}

// facts/clock-orbs.md: the orb part of HDD module_clock_22FE98 (clock_frame.mjs scene, drawOrb).
template <class A>
OrbFrame Orbs<A>::frame(OrbState& state, const OrbInputs& in, const Mat4& view, const Mat4& screen) {
    using M = Matrix<A>;
    OrbFrame out;

    const float seconds = A::add(static_cast<float>(in.seconds), A::div(in.milliseconds, 1000.0f));
    const float minutes = A::add(static_cast<float>(in.minutes), A::div(seconds, 60.0f));
    const float secondsTurn = A::div(A::mul(seconds, 65536.0f), 60.0f);
    const float minuteTurn = A::div(A::mul(minutes, 65536.0f), 60.0f);
    const float fraction = state.fraction;
    const float radius = A::mul(A::add(A::mul(fraction, 7.25f), 10.0f), in.sceneScale);
    state.fraction = A::add(A::mul(A::sub(A::sub(1.0f, in.progress), fraction), in.fractionEasing), fraction);

    int listed = 0;
    for (int k = 0; k < kOrbCount; ++k) {
        OrbDraw& orb = out.orbs[k];
        orb.k = k;
        orb.local = orbitMatrix(k, in.hourHand, in.secondHand, minuteTurn, secondsTurn, in.minuteFactor, radius);
        orb.depthKey = M::apply(view, orb.local[3])[2];
        int at = 0;
        while (at < listed && orb.depthKey < out.orbs[out.order[at]].depthKey) ++at;
        for (int n = listed; n > at; --n) out.order[n] = out.order[n - 1];
        out.order[at] = k;
        ++listed;
    }

    const int32_t halfW = in.width / 2, halfH = in.height / 2;
    const float cornerX = static_cast<float>((0x800 - (in.width >> 1)) << 4);
    const float cornerY = static_cast<float>((0x800 - (in.height >> 1)) << 4);
    const auto pixelX = [&](int32_t gs) { return (static_cast<float>(gs) - cornerX) * 0.0625f; };
    const auto pixelY = [&](int32_t gs) { return (static_cast<float>(gs) - cornerY) * 0.0625f; };

    for (int drawn = 0; drawn < kOrbCount; ++drawn) {
        OrbDraw& orb = out.orbs[out.order[drawn]];
        orb.drawn = drawn;
        tickRamp(state.spriteFade);

        Mat4 placed{};
        for (int r = 0; r < 4; ++r) placed[r] = M::apply(view, orb.local[r]);
        Vec4 centre = M::apply(screen, M::apply(placed, {0, 0, 0, 1}));
        const float q = A::div(1.0f, centre[3]);
        for (float& c : centre) c = A::mul(c, q);
        orb.cx = A::sub(centre[0], 2048.0f);
        orb.cy = A::sub(centre[1], 2048.0f);
        orb.cz = centre[2];

        OrbRing& ring = state.rings[orb.k];
        float px = orb.cx, py = orb.cy;
        std::array<int32_t, 4> colour = in.colour;
        if (in.hasEntryData && (in.mode == 2 || in.mode == 3)) {
            const int32_t weight = in.overlayLevel;
            const int k = orb.k;
            if ((in.mode == 2 && (in.wide == 1 || k == 0)) || (in.mode == 3 && k == 0)) {
                const int32_t angle = s16(A::toInt(A::mul(static_cast<float>(weight << 14), 0.0078125f)));
                const int32_t turn = s16(in.random[static_cast<size_t>(k)]);
                const float rest = A::sub(1.0f, A::sin16(angle));
                const float dx = A::mul(A::mul(static_cast<float>(halfW), A::cos16(turn)), rest);
                const float dy = A::mul(A::mul(static_cast<float>(halfH), A::sin16(turn)), rest);
                if (in.mode == 2) {
                    px = A::add(px, dx);
                    py = A::add(py, dy);
                } else {
                    const float w = A::mul(static_cast<float>(weight), 0.0078125f);
                    py = A::add(A::mul(py, w), A::mul(dy, 1.5f));
                    px = A::add(A::mul(px, w), A::mul(dx, 1.5f));
                }
            }
            const bool own = in.mode == 2 || k == 0;
            const int32_t mine = own ? 128 - weight : 0, other = own ? weight : 128;
            const auto& base = in.colours[static_cast<size_t>(in.mode == 3 ? 0 : k)];
            for (size_t i = 0; i < 4; ++i) colour[i] = (imul(base[i], mine) + imul(in.colour[i], other)) >> 7;
        }
        const auto write = [&] { ring.entries[ring.head] = {px, py, orb.cz, colour}; };
        write();
        ring.count += 1;
        if (ring.count == 3) {
            ring.count = 0;
            ring.head += 1;
            if (ring.head == kRingLength) {
                ring.head = 0;
                ring.full = 1;
            }
            write();
        }

        OrbTrail trail;
        trail.headerAlpha = static_cast<float>(faded(state.spriteFade, 0x80)) / 128.0f;
        const bool full = ring.full != 0;
        const int32_t points = full ? kRingLength - 1 : (ring.head > 1 ? ring.head - 1 : 0);
        trail.points.reserve(static_cast<size_t>(points));
        for (int32_t i = 0; i < points; ++i) {
            const OrbEntry& e = ring.entries[full ? (ring.head + 100 - i) % kRingLength : ring.head - i];
            const int32_t step = full ? i : (i * 50) / (ring.head - 1);
            int32_t t = A::toInt(A::sub(128.0f, A::cut(static_cast<double>(step) * 3.0)));
            if (t < 0) t = 0;
            const int32_t red = shift(imul(shift(imul(shift(imul(imul(e.colour[0], t), t), 7), t), 7), t), 14);
            const int32_t green = shift(imul(imul(e.colour[1], t), t), 14);
            const int32_t blue = shift(imul(e.colour[2], t), 7);
            OrbVertex p;
            p.x = pixelX(A::toInt(A::mul(A::add(e.x, 2048.0f), 16.0f)));
            p.y = pixelY(A::toInt(A::mul(A::add(e.y, 2048.0f), 16.0f)));
            p.z = static_cast<float>(A::toInt(A::mul(e.z, 16.0f))) * 0.0625f;
            p.r = static_cast<float>(red) / 255.0f;
            p.g = static_cast<float>(green) / 255.0f;
            p.b = static_cast<float>(blue) / 255.0f;
            p.a = static_cast<float>(t >> 1) / 128.0f;
            trail.points.push_back(p);
        }

        const OrbEntry& head = ring.entries[ring.head];
        const float size = A::mul(head.z, asFloat(kDepthToSize));
        const auto rect = [&](float factor, const std::array<int32_t, 4>& c) {
            const float hw = A::mul(size, factor), hh = A::mul(hw, 0.5f);
            const auto at = [&](float centre, float delta, int32_t middle) {
                return static_cast<float>(A::toInt(A::mul(A::add(A::add(centre, delta), static_cast<float>(middle)), 16.0f))) * 0.0625f;
            };
            OrbSprite s;
            s.first = {at(head.x, -hw, halfW), at(head.y, -hh, halfH), 0, 0, 0, 1};
            s.second = {at(head.x, hw, halfW), at(head.y, hh, halfH), 0, 63.0f / 64.0f, 63.0f / 64.0f, 1};
            for (OrbVertex* v : {&s.first, &s.second}) {
                v->r = static_cast<float>(c[0]) / 128.0f;
                v->g = static_cast<float>(c[1]) / 128.0f;
                v->b = static_cast<float>(c[2]) / 128.0f;
                v->a = static_cast<float>(c[3]) / 128.0f;
            }
            return s;
        };
        const int32_t r = head.colour[0], g = head.colour[1], b = head.colour[2], a = head.colour[3];
        const int32_t shown = faded(state.spriteFade, 0x80);
        orb.sends[0] = {trail, rect(30.0f, {r, g, b, faded(state.spriteFade, a)}), rect(4.5f, {0x80, 0x80, 0x80, shown})};
        orb.sends[1] = {std::move(trail), rect(30.0f, {r, g, b, shown}), rect(4.5f, {0xff, 0xff, 0xff, shown})};
    }
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template struct Orbs<EeArithmetic>;
#endif
template struct Orbs<NativeArithmetic>;

}
