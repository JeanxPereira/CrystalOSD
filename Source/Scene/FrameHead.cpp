#include "Scene/FrameHead.hpp"

#include <cmath>
#include <utility>

namespace scene {

namespace {

constexpr int32_t kBlurX = 0x13f4, kBlurY = 0x954, kStretchY = 0x95c;

uint64_t wide(int32_t v) { return static_cast<uint64_t>(static_cast<int64_t>(v)); }
uint64_t pair(uint32_t low, uint32_t high) { return static_cast<uint64_t>(low) | (static_cast<uint64_t>(high) << 32); }

struct Origin {
    float x, y;
};

Origin originOf(int32_t width, int32_t height) { return {static_cast<float>(0x800 - (width >> 1)), static_cast<float>(0x800 - (height >> 1))}; }
Origin originOf(const HeadInputs& in) { return originOf(in.width, in.height); }

// One vertex from the registers the OSD wrote: RGBAQ, ST or UV, XYZF2.
HeadVertex vertexOf(const Origin& origin, uint64_t rgbaq, uint64_t coordinate, Coordinates kind, uint64_t xyz) {
    HeadVertex v;
    const uint32_t colour = static_cast<uint32_t>(rgbaq);
    v.r = static_cast<float>(colour & 0xff) / 128.0f;
    v.g = static_cast<float>((colour >> 8) & 0xff) / 128.0f;
    v.b = static_cast<float>((colour >> 16) & 0xff) / 128.0f;
    v.a = static_cast<float>(colour >> 24) / 128.0f;
    v.q = asFloat(static_cast<uint32_t>(rgbaq >> 32));
    if (kind == Coordinates::St) {
        v.s = asFloat(static_cast<uint32_t>(coordinate));
        v.t = asFloat(static_cast<uint32_t>(coordinate >> 32));
    } else if (kind == Coordinates::Uv) {
        const uint32_t uv = static_cast<uint32_t>(coordinate);
        v.u = static_cast<float>(uv & 0xffff) / 16.0f;
        v.v = static_cast<float>(uv >> 16) / 16.0f;
    }
    const uint32_t low = static_cast<uint32_t>(xyz), high = static_cast<uint32_t>(xyz >> 32);
    v.x = static_cast<float>(low & 0xffff) / 16.0f - origin.x;
    v.y = static_cast<float>(low >> 16) / 16.0f - origin.y;
    v.z = high & 0xffffff;
    v.fog = static_cast<uint8_t>(high >> 24);
    return v;
}

void setPrim(HeadDraw& d, uint32_t prim) {
    d.topology = (prim & 7) == 6 ? Topology::Sprite : Topology::TriangleStrip;
    d.gouraud = prim & 8;
    d.textured = prim & 0x10;
    d.blended = prim & 0x40;
    d.coordinates = (prim & 0x100) ? Coordinates::Uv : (d.textured ? Coordinates::St : Coordinates::None);
}

void setState(HeadDraw& d, Target target, Source source, AlphaMode alpha, int32_t depthTest) {
    d.target = target;
    d.source = source;
    d.alpha = alpha;
    d.depthTest = depthTest;
}

HeadDraw rectangle(const Rect& r, const HeadInputs& in, Part part) { return headRectangle(r, in.width, in.height, part); }

// facts/clock-frame-rest.md section 2 (HDD func_00236490): shrink into work buffer 1, stretch back.
void blurTrips(HeadState& s, const HeadInputs& in, int64_t trips, Part part, std::vector<HeadDraw>& out) {
    for (int64_t k = 0; k < trips; ++k) {
        const int32_t x = kBlurX - 0x20 * static_cast<int32_t>(k);
        s.blur.x1 = x;
        s.blur.y1 = kBlurY - 0x10 * static_cast<int32_t>(k);
        s.blur.u1 = (in.width << 4) + 8;
        s.blur.v1 = ((in.height - 1) << 4) + 8;
        HeadDraw shrink = rectangle(s.blur, in, part);
        setState(shrink, Target::Work1, Source::Frame, AlphaMode::AlphaOver, 1);
        out.push_back(std::move(shrink));
        s.blur.x1 = in.width << 4;
        s.blur.y1 = (in.height - 1) << 4;
        s.blur.u1 = x + 8;
        s.blur.v1 = kStretchY - 0x10 * static_cast<int32_t>(k);
        HeadDraw stretch = rectangle(s.blur, in, part);
        setState(stretch, Target::Display, Source::Work1, AlphaMode::AlphaOver, 1);
        out.push_back(std::move(stretch));
    }
}

// HDD func_00236230: what is bound, over the whole target.
void copy(HeadState& s, const HeadInputs& in, Target target, std::vector<HeadDraw>& out) {
    s.copy.x1 = in.width << 4;
    s.copy.y1 = in.height << 4;
    s.copy.u1 = (in.width << 4) + 8;
    s.copy.v1 = (in.height << 4) + 8;
    s.copy.blend = 0;
    HeadDraw d = rectangle(s.copy, in, Part::Copy);
    setState(d, target, Source::Frame, AlphaMode::AlphaOver, 1);
    out.push_back(std::move(d));
}

template <class A>
std::pair<Vec4, float> project(const Mat4& screen, const Vec4& v) {
    Vec4 p = Matrix<A>::apply(screen, v);
    const float q = A::div(1.0f, p[3]);
    for (float& c : p) c = A::mul(c, q);
    return {p, q};
}

uint64_t rgbaqOf(int32_t r, int32_t g, int32_t b, float q) {
    return wide(r) | (static_cast<uint64_t>(floatBits(q)) << 32) | (wide(b) << 16) | (wide(g) << 8) | 0x40000000ull;
}

template <class A>
uint64_t coordinate(float u, float v, float q) {
    return pair(floatBits(A::mul(A::mul(u, 3.0f), q)), floatBits(A::mul(A::mul(v, 3.0f), q)));
}

template <class A>
uint64_t xyzOf(const Vec4& v) {
    const int32_t x = A::toInt(v[0] * 16.0f), y = A::toInt(v[1] * 16.0f), z = A::toInt(v[2] * 16.0f);
    return wide(x) | (wide(y) << 16) | (wide(z) << 32);
}

// facts/clock-frame-rest.md section 1 (HDD func_00233110): 33 ring pairs, those in view kept, and the closing pair.
template <class A>
HeadDraw strip(const Mat4& view, const Mat4& screen, int32_t angle0, int32_t angle1, int32_t counter, const std::array<int32_t, 3>& greys, const TubeConstants& K,
               const Origin& origin) {
    using M = Matrix<A>;
    const int32_t a = s16(angle0), b = s16(angle1);
    const Vec4 P0{A::mul(K.radius, A::sin16(a)), A::mul(K.radius, A::cos16(a)), 0, 1};
    const Vec4 P1{A::mul(K.radius, A::sin16(b)), A::mul(K.radius, A::cos16(b)), 0, 1};
    const float u0 = A::div(static_cast<float>(angle0), K.turn), u1 = A::div(static_cast<float>(angle1), K.turn);
    const int32_t lightA = A::toInt(A::mul(A::add(A::cos16(a), 1.0f), 10.0f)), lightB = A::toInt(A::mul(A::add(A::cos16(b), 1.0f), 10.0f));
    HeadDraw d;
    d.part = Part::Background;
    d.vertices.reserve(68);
    setPrim(d, 0x1c);
    setState(d, Target::Display, Source::Background, AlphaMode::Add, 2);
    const float scrolled = static_cast<float>(counter % 5000);
    auto outside = [](float x) { return std::fabs(A::sub(x, 2000.0f)) > 1000.0f; };
    for (int32_t i = 0; i <= 32; ++i) {
        const float v = A::add(A::mul(static_cast<float>(i), 0.03125f), A::mul(scrolled, K.scroll));
        const float wobble = A::add(A::mul(A::sin16(static_cast<int32_t>(static_cast<uint32_t>(counter) * 100u + static_cast<uint32_t>(i * 0x1400))), K.ripple), 1.0f);
        const int32_t n = 32 - i;
        const int32_t fall = (n * n * n) >> 10;
        const int32_t c1 = greys[0] + ((0xe6 * fall) >> 5), c2 = greys[1] + ((0x104 * fall) >> 5), c3 = greys[2] + ((0x104 * fall) >> 5);
        const float z = static_cast<float>(i * 0x4e2 - 0x9c4);
        const Vec4 V0 = M::apply(view, {A::mul(P0[0], wobble), A::mul(P0[1], wobble), z, P0[3]});
        const Vec4 V1 = M::apply(view, {A::mul(P1[0], wobble), A::mul(P1[1], wobble), z, P1[3]});
        if (V0[2] < K.near || V1[2] < K.near) continue;
        const auto [S0, q0] = project<A>(screen, V0);
        const auto [S1, q1] = project<A>(screen, V1);
        if (outside(S0[0]) || outside(S1[0]) || outside(S0[1]) || outside(S1[1])) continue;
        d.vertices.push_back(vertexOf(origin, rgbaqOf(c1 + lightA, c2 + lightA, c3 + lightA, q0), coordinate<A>(u0, v, q0), Coordinates::St, xyzOf<A>(S0)));
        d.vertices.push_back(vertexOf(origin, rgbaqOf(c1 + lightB, c2 + lightB, c3 + lightB, q1), coordinate<A>(u1, v, q1), Coordinates::St, xyzOf<A>(S1)));
    }
    const float vEnd = A::add(A::mul(scrolled, K.scrollEnd), 1.0f);
    const auto [E0, e0] = project<A>(screen, M::apply(view, {0, 0, K.far, 1}));
    const auto [E1, e1] = project<A>(screen, M::apply(view, {0, 0, K.far, 1}));
    d.vertices.push_back(vertexOf(origin, rgbaqOf(greys[0], greys[1], greys[2], e0), coordinate<A>(A::div(static_cast<float>(angle0), K.turnEnd), vEnd, e0), Coordinates::St, xyzOf<A>(E0)));
    d.vertices.push_back(vertexOf(origin, rgbaqOf(greys[0], greys[1], greys[2], e0), coordinate<A>(A::div(static_cast<float>(angle1), K.turnEnd), vEnd, e1), Coordinates::St, xyzOf<A>(E1)));
    return d;
}

// HDD func_00233D00: the vignette's sixteen sector draws (its PRIM packet draws nothing).
template <class A>
void vignette(const RingRecord& r, const HeadInputs& in, std::vector<HeadDraw>& out) {
    const int32_t left = (0x800 - (in.width >> 1)) << 4, top = (0x800 - (in.height >> 1)) << 4;
    auto X = [&](int32_t angle, float scale) {
        return A::toInt(A::add(A::add(static_cast<float>(r.cx), A::mul(A::mul(A::sin16(angle), static_cast<float>(r.rx)), scale)), static_cast<float>(left)));
    };
    auto Y = [&](int32_t angle, float scale) {
        return A::toInt(A::add(A::add(static_cast<float>(r.cy), A::mul(A::mul(A::cos16(angle), static_cast<float>(r.ry)), scale)), static_cast<float>(top)));
    };
    auto clamp = [](int32_t value, int32_t low, int32_t high) { return value < low ? low : high < value ? high : value; };
    auto colour = [](int32_t alpha) { return (wide(alpha) << 24) | (0x3f800000ull << 32); };
    auto point = [&](int32_t x, int32_t y) { return wide(x) | (wide(y) << 16) | (wide(r.z) << 32); };
    const Origin origin = originOf(in);
    for (int32_t angle = 0; angle <= 0xffff; angle += 0x1000) {
        const int32_t next = angle + 0x1000;
        HeadDraw d;
        d.part = Part::Vignette;
        d.vertices.reserve(6);
        setPrim(d, 0x4c);
        setState(d, Target::Display, Source::None, AlphaMode::AlphaOver, 2);
        auto put = [&](int32_t alpha, uint64_t xyz) { d.vertices.push_back(vertexOf(origin, colour(alpha), 0, Coordinates::None, xyz)); };
        put(0, point(X(angle, 1.0f), Y(angle, 1.0f)));
        put(0, point(X(next, 1.0f), Y(next, 1.0f)));
        put(r.alpha, point(X(angle, 1.5f), Y(angle, 1.5f)));
        put(r.alpha, point(X(next, 1.5f), Y(next, 1.5f)));
        put(r.alpha, point(clamp(X(angle, 10.0f), left, left + (in.width << 4)), clamp(Y(angle, 10.0f), top, top + (in.height << 4))));
        put(r.alpha, point(clamp(X(next, 10.0f), left, left + (in.width << 4)), clamp(Y(next, 10.0f), top, top + (in.height << 4))));
        out.push_back(std::move(d));
    }
}

}

// HDD func_00233770: the two packets of a rectangle record, nothing masked.
HeadDraw headRectangle(const Rect& r, int32_t width, int32_t height, Part part) {
    const int32_t ox = (0x800 - (width >> 1)) << 4, oy = (0x800 - (height >> 1)) << 4;
    const uint64_t z = wide(r.z) << 32;
    const uint32_t prim = static_cast<uint32_t>((wide(r.textured) << 4) | 0x100 | (wide(r.blend) << 6) | 6) & 0x7ff;
    const uint64_t rgbaq = wide(r.colour[0]) | (0x3f800000ull << 32) | (wide(r.colour[2]) << 16) | (wide(r.colour[1]) << 8) | (wide(r.colour[3]) << 24);
    const uint64_t uv0 = wide(r.u0) | (wide(r.v0) << 16), uv1 = wide(r.u1) | (wide(r.v1) << 16);
    const uint64_t xyz0 = wide(r.x0 + ox) | (wide(r.y0 + oy) << 16) | z, xyz1 = wide(r.x1 + ox) | (wide(r.y1 + oy) << 16) | z;
    HeadDraw d;
    d.part = part;
    d.vertices.reserve(2);
    setPrim(d, prim);
    const Origin origin = originOf(width, height);
    d.vertices.push_back(vertexOf(origin, rgbaq, uv0, Coordinates::Uv, xyz0));
    d.vertices.push_back(vertexOf(origin, rgbaq, uv1, Coordinates::Uv, xyz1));
    return d;
}

// HDD module_clock_226000 and module_clock_233338 (facts/clock-frame-rest.md sections 1 and 2).
template <class A>
std::vector<HeadDraw> FrameHead<A>::head(const HeadInputs& in, const Mat4& view, const Mat4& screen) {
    HeadState& s = m_state;
    std::vector<HeadDraw> out;
    out.reserve(in.mode == 0 ? 16 + 24 : 24);
    s.tint.x1 = in.width << 4;
    s.tint.y1 = in.height << 4;
    s.tint.u1 = (in.width << 4) + 8;
    s.tint.v1 = (in.height << 4) + 8;

    tickRamp(s.greyRamp);
    if (s.greyRamp.state != 0) {
        const int32_t grey = s.greyRamp.counter * 0x28 / s.greyRamp.length;
        s.greys = {grey, grey, grey};
    }
    if (in.mode == 0) {
        const Origin origin = originOf(in);
        for (int32_t angle = 0; angle <= 0xffff; angle += 0x1000) out.push_back(strip<A>(view, screen, angle, angle + 0x1000, in.counter, s.greys, in.tube, origin));
    }

    const int64_t trips = in.level < 6 ? static_cast<int64_t>(in.level) : 10 - static_cast<int64_t>(in.level);
    blurTrips(s, in, trips, Part::Blur, out);
    copy(s, in, Target::Work0, out);
    copy(s, in, Target::Work1, out);
    HeadDraw tint = rectangle(s.tint, in, Part::Tint);
    setState(tint, Target::Display, Source::Work0, AlphaMode::Add, 1);
    out.push_back(std::move(tint));
    return out;
}

// HDD module_clock_234E70: the vignette ramp, the vignette in mode 0, then the fade.
template <class A>
std::vector<HeadDraw> FrameHead<A>::overlay(const HeadInputs& in) {
    HeadState& s = m_state;
    std::vector<HeadDraw> out;
    tickRamp(s.vignetteRamp);
    if (in.mode == 0) {
        s.ring.alpha = s.vignetteRamp.length != 0 ? s.vignetteRamp.counter * 0x80 / s.vignetteRamp.length : 0;
        s.ring.cx = 0x10a0;
        s.ring.cy = (in.height / 2) << 4;
        if (s.vignetteRamp.state != 0) vignette<A>(s.ring, in, out);
    }
    s.fade.colour[3] = 0x80 - in.overlayLevel;
    HeadDraw fade = rectangle(s.fade, in, Part::Fade);
    setState(fade, Target::Display, Source::None, AlphaMode::AlphaOver, 1);
    out.push_back(std::move(fade));
    return out;
}

// HDD module_clock_232438: level - 5 more trips from level 5 up.
template <class A>
std::vector<HeadDraw> FrameHead<A>::tripsAfter(const HeadInputs& in) {
    std::vector<HeadDraw> out;
    if (in.level >= 5) blurTrips(m_state, in, static_cast<int64_t>(in.level) - 5, Part::BlurAfter, out);
    return out;
}

// HDD func_002262C8 / func_00226158: the two letterbox bars when item 0 is 0 or 2.
template <class A>
std::vector<HeadDraw> FrameHead<A>::bars(const HeadInputs& in) {
    HeadState& s = m_state;
    std::vector<HeadDraw> out;
    if (in.item0 != 0 && in.item0 != 2) return out;
    s.bars.x1 = in.width << 4;
    const float picture = A::mul(A::mul(A::mul(A::div(static_cast<float>(in.width), in.proportionX), 0.0625f), 9.0f), in.proportionY);
    const float margin = A::mul(A::sub(static_cast<float>(in.height), picture), 0.5f);
    s.bars.y0 = 0;
    s.bars.y1 = A::toInt(A::mul(margin, 16.0f));
    HeadDraw top = rectangle(s.bars, in, Part::Bars);
    setState(top, Target::Display, Source::None, AlphaMode::AlphaOver, 1);
    out.push_back(std::move(top));
    s.bars.y0 = A::toInt(A::mul(A::sub(static_cast<float>(in.height), margin), 16.0f));
    s.bars.y1 = in.height << 4;
    HeadDraw bottom = rectangle(s.bars, in, Part::Bars);
    setState(bottom, Target::Display, Source::None, AlphaMode::AlphaOver, 1);
    out.push_back(std::move(bottom));
    return out;
}

// HDD func_00226A88: two pixels at the right edge.
template <class A>
std::vector<HeadDraw> FrameHead<A>::column(const HeadInputs& in) {
    HeadState& s = m_state;
    s.column.x0 = (in.width << 4) - 0x28;
    s.column.y0 = 0;
    s.column.x1 = (in.width << 4) - 8;
    s.column.y1 = in.height << 4;
    HeadDraw d = rectangle(s.column, in, Part::Column);
    setState(d, Target::Display, Source::None, AlphaMode::AlphaOver, 1);
    std::vector<HeadDraw> out;
    out.push_back(std::move(d));
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template class FrameHead<EeArithmetic>;
#endif
template class FrameHead<NativeArithmetic>;

}
