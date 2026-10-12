#include "Scene/Cubes.hpp"

#include <cmath>
#include <cstdlib>
#include <utility>

#include "Scene/RodEmitters.hpp"

namespace scene {

namespace {

constexpr int32_t kStep = 3000;
constexpr int32_t kTurn = 60 * kStep;

// clock_cubes.mjs wrap: x mod m in 0..m-1.
int32_t wrap(int32_t x, int32_t m) {
    const int32_t lifted = x >= 0 ? x : x + 1 - m;
    return x - (lifted - (lifted % m));
}

// HDD module_clock_230600: A and B mixed with weight w of 128, cut toward zero.
Colour mix(const Colour& a, const Colour& b, int32_t w) {
    Colour out{};
    for (size_t i = 0; i < 4; ++i) {
        const int32_t sum = a[i] * w + b[i] * (128 - w);
        out[i] = (sum > -1 ? sum : sum + 127) >> 7;
    }
    return out;
}

// HDD module_clock_230550: the list position moving to its target, and the pulse dying down.
template <class A>
void ringStep(CubeState& c) {
    CubeList& l = c.list;
    const int32_t left = l.left;
    int32_t speed = l.speed, move;
    if (!(speed < std::abs(left))) {
        move = left;
        speed = 0;
    } else {
        const int32_t slower = speed - l.slowing;
        move = left > -1 ? speed : -speed;
        speed = slower > 0 ? slower : 1;
    }
    l.speed = speed;
    l.left = left - move;
    l.position = wrap(l.position + move, kTurn);
    l.pulse = A::mul(l.pulse, c.constants[1]);
}

// HDD module_clock_2306B0: the record's scale and matrix for a list place. The fourth word of the position is 0.
template <class A>
void place(CubeState& c, int32_t index, int32_t position, float scale, int32_t spin) {
    using M = Matrix<A>;
    RodRecord& record = c.record;
    const float size = index == c.list.pulsed ? A::add(scale, c.list.pulse) : scale;
    record.sx = record.sy = record.sz = size;
    const std::array<float, 6>& k = c.constants;
    const float raw = A::add(A::div(A::mul(A::cut(static_cast<double>(wrap(index * kStep - position, kTurn))), k[2]), k[3]), k[4]);
    const float turns = std::floor(A::div(A::sub(raw, k[5]), k[2]));
    const float angle = A::sub(raw, A::mul(turns, k[2]));
    const Vec4 at{A::add(index & 1 ? 60.0f : 70.0f, -80.0f), A::add(A::mul(A::cosf(angle), 60.0f), 0.0f), 47.5f, 0.0f};
    Mat4 moved = M::identity();
    moved[3] = M::apply(moved, at);
    const int32_t turn = s16(spin + index * 7000);
    record.local = M::rotateZ(M::rotateY(M::rotateX(moved, turn), turn), turn);
}

constexpr size_t kExpectedDraws = 96;

template <class A>
struct Pass {
    CubeState& c;
    const Mat4& view;
    const Mat4& screen;
    const RodMesh& mesh;
    const RodsInput& input;
    RodEmitters<A> emit;
    std::vector<CubeDraw>& out;

    static CubeDraw strips(CubeSend send, const char* label) {
        CubeDraw d;
        d.send = send;
        d.label = label;
        return d;
    }
    void push(CubeDraw&& d) {
        if (!d.faces.empty()) out.push_back(std::move(d));
    }

    // facts/config-cubes.md: the edge quad, base x F^2.
    RodFaceDraw edge(const RodFace& face, const RodRecord& rod) const {
        const float edgeTerm = Rods<A>::edgeTerm(face);
        const float square = A::mul(edgeTerm, edgeTerm);
        const auto channel = [&](int32_t base) {
            const int32_t value = A::toInt(A::mul(square, A::cut(static_cast<double>(base))));
            return value < 0x100 ? value : 0xff;
        };
        RodFaceDraw draw{face.index, RodPiece::Whole, true, {}};
        for (size_t k = 0; k < 4; ++k) {
            draw.strip[k] = emit.position(face.vertices[k]);
            RodEmitters<A>::paint(draw.strip[k], channel(rod.base[0]), channel(rod.base[1]), channel(rod.base[2]), 0x80);
        }
        return draw;
    }

    // facts/config-cubes.md: black, one depth step nearer, alpha 0x20.
    RodFaceDraw depth(const RodFace& face) const {
        RodFaceDraw draw{face.index, RodPiece::Whole, true, {}};
        for (size_t k = 0; k < 4; ++k) {
            draw.strip[k] = emit.position(face.vertices[k]);
            draw.strip[k].z = static_cast<float>(face.vertices[k].fixed[2] + 1) / 16.0f;
            RodEmitters<A>::paint(draw.strip[k], 0, 0, 0, 0x20);
        }
        return draw;
    }

    // facts/config-cubes.md: black with the reflection's alpha; no edge smoothing above 0x40.
    RodFaceDraw alpha(const RodFace& face, int32_t value) const {
        RodFaceDraw draw{face.index, RodPiece::Whole, !(value > 0x40), {}};
        for (size_t k = 0; k < 4; ++k) {
            draw.strip[k] = emit.position(face.vertices[k]);
            RodEmitters<A>::paint(draw.strip[k], 0, 0, 0, value);
        }
        return draw;
    }

    CubeDraw rectangle(CubeSend send, const char* label, const Rect& record, Part part, Target target, Source source, AlphaMode mode) const {
        CubeDraw d;
        d.send = send;
        d.label = label;
        d.rectangle = headRectangle(record, input.width, input.height, part);
        d.rectangle->target = target;
        d.rectangle->source = source;
        d.rectangle->alpha = mode;
        d.rectangle->depthTest = 1;
        return d;
    }

    // HDD module_clock_237350: eight sends and the half-buffer sprite.
    void cube() {
        const RodRecord& rod = c.record;
        if (rod.sy < 0) return;
        const RodTransform whole = Rods<A>::transform(rod, view, screen, mesh);
        const float cx = A::mul(whole.cx, c.centreFactors[0]), cy = A::mul(whole.cy, c.centreFactors[0]);
        std::vector<const RodFace*> far, near;
        far.reserve(whole.faces.size());
        near.reserve(whole.faces.size());
        for (const RodFace& face : whole.faces) (face.flag == 0 ? far : near).push_back(&face);
        const auto bent = [&](CubeSend send, const std::vector<const RodFace*>& faces) {
            CubeDraw d = strips(send, "cube: refracted");
            d.faces.reserve(faces.size());
            for (const RodFace* face : faces) d.faces.push_back(emit.refracted(*face, rod, cx, cy, 0, RodPiece::Whole));
            push(std::move(d));
        };
        const auto grain = [&](CubeSend send, const std::vector<const RodFace*>& faces, float ds, float dt) {
            CubeDraw d = strips(send, "cube: grain");
            d.faces.reserve(faces.size());
            for (const RodFace* face : faces) d.faces.push_back(emit.textured(*face, rod.textured, ds, dt, RodPiece::Whole));
            push(std::move(d));
        };
        bent(CubeSend::RefractedFar, far);
        grain(CubeSend::GrainOffsetFar, far, rod.pair[0], rod.pair[1]);
        grain(CubeSend::GrainPlainFar, far, 0.0f, 0.0f);
        CubeDraw edges = strips(CubeSend::EdgeColour, "cube: edge colour");
        edges.faces.reserve(far.size());
        for (const RodFace* face : far) edges.faces.push_back(edge(*face, rod));
        push(std::move(edges));
        CubeDraw depths = strips(CubeSend::Depth, "cube: depth");
        depths.faces.reserve(near.size());
        for (const RodFace* face : near) depths.faces.push_back(depth(*face));
        push(std::move(depths));
        const int32_t w = input.width, h = input.height;
        const int32_t sign = static_cast<int32_t>(static_cast<uint32_t>(w) >> 31);
        c.half.x1 = ((w + sign) >> 1) << 4;
        c.half.y1 = h << 4;
        c.half.u1 = ((w + sign) << 3) | 8;
        c.half.v1 = (h << 4) + 8;
        out.push_back(rectangle(CubeSend::HalfBuffer, "cube: half of buffer 0 added to buffer 1", c.half, Part::CubeHalf, Target::Work1, Source::Work0, AlphaMode::Add));
        bent(CubeSend::RefractedNear, near);
        grain(CubeSend::GrainOffsetNear, near, rod.pair[0], rod.pair[1]);
        grain(CubeSend::GrainPlainNear, near, 0.0f, 0.0f);
    }

    // HDD module_clock_237860: one cube in the highlight layer, two sends over the near faces.
    void layer() {
        const RodRecord& rod = c.record;
        if (rod.sy < 0) return;
        const RodTransform whole = Rods<A>::transform(rod, view, screen, mesh);
        CubeDraw reflection = strips(CubeSend::LayerReflection, "cube layer: reflection");
        CubeDraw shade = strips(CubeSend::LayerAlpha, "cube layer: alpha");
        reflection.faces.reserve(whole.faces.size());
        shade.faces.reserve(whole.faces.size());
        for (const RodFace& face : whole.faces) {
            if (face.flag == 0) continue;
            reflection.faces.push_back(emit.reflected(face, rod.reflection, RodPiece::Whole, true));
            shade.faces.push_back(alpha(face, rod.reflection[3]));
        }
        push(std::move(reflection));
        push(std::move(shade));
    }
};

}

template <class A>
Cubes<A>::Cubes(RodMesh mesh) : m_mesh(std::move(mesh)) {}

// References/model/clock_cubes.mjs cubes(): the ramp's tick, one step of the list, then the pass.
template <class A>
std::vector<CubeDraw> Cubes<A>::frame(CubeState& c, HeadState& head, const ClockState& clock, const CubeFrameInputs& in) {
    std::vector<CubeDraw> out;
    out.reserve(kExpectedDraws);
    tickRamp(c.ramp);
    ringStep<A>(c);

    const float scale = A::div(A::cut(static_cast<double>(c.ramp.counter)), A::cut(static_cast<double>(in.body)));
    if (c.ramp.state == 0) return out;

    RodsInput input;
    input.width = in.width;
    input.height = in.height;
    input.field = in.field;
    Pass<A> pass{c, c.view, c.screen, m_mesh, input, RodEmitters<A>{input}, out};
    const int32_t w = in.width, h = in.height;
    const int32_t position = c.list.position;
    const int32_t whole = position / kStep, part = position % kStep;
    const int32_t spin = clock.spin.value_or(0);

    const int32_t weight = (part << 7) / kStep;
    for (int32_t slot = 0; slot < 6; ++slot) {
        c.record.base = slot == 2 ? mix(c.colours.selected, c.colours.plain, 128 - weight) : slot == 3 ? mix(c.colours.selected, c.colours.plain, weight) : c.colours.plain;
        place<A>(c, wrap(whole + slot - 2, 60), c.list.position, scale, spin);
        pass.cube();
    }
    CubeDraw clear;
    clear.send = CubeSend::LayerClear;
    clear.label = "draw to a work buffer";
    clear.clear = c.layerClear;
    out.push_back(std::move(clear));
    for (int32_t slot = 0; slot < 6; ++slot) {
        const int32_t fade = ((std::abs(-2 * kStep + slot * kStep - part) - 2 * kStep) << 7) / kStep;
        if (!(fade < 128)) continue;
        c.record.reflection[3] = 128 - (fade > -1 ? fade : 0);
        place<A>(c, wrap(whole + slot - 2, 60), position, scale, spin);
        pass.layer();
    }

    c.added.x1 = w << 4;
    c.added.y1 = h << 4;
    c.added.u1 = (w << 4) + 8;
    c.added.v1 = (h << 4) + 8;
    out.push_back(pass.rectangle(CubeSend::Added, "cubes: buffer 1 added to buffer 0", c.added, Part::CubeAdded, Target::Work0, Source::Work1, AlphaMode::Add));
    const uint32_t level = static_cast<uint32_t>(clock.level);
    const uint32_t trips = level < 5 ? 5 - level : 0;
    for (uint32_t k = 0; k < trips; ++k) {
        const int32_t x = 0x13f4 - 0x20 * static_cast<int32_t>(k);
        c.chain.x1 = x;
        c.chain.y1 = 0x954 - 0x10 * static_cast<int32_t>(k);
        c.chain.u1 = (w << 4) + 8;
        c.chain.v1 = ((h - 1) << 4) + 8;
        out.push_back(pass.rectangle(CubeSend::ChainShrink, "cubes: blur chain, shrink", c.chain, Part::CubeChainShrink, Target::Work1, Source::Work0, AlphaMode::AlphaOver));
        c.chain.x1 = w << 4;
        c.chain.y1 = (h - 1) << 4;
        c.chain.u1 = x + 8;
        c.chain.v1 = 0x95c - 0x10 * static_cast<int32_t>(k);
        out.push_back(pass.rectangle(CubeSend::ChainStretch, "cubes: blur chain, stretch", c.chain, Part::CubeChainStretch, Target::Work0, Source::Work1, AlphaMode::AlphaOver));
    }
    head.copy.x1 = w << 4;
    head.copy.y1 = h << 4;
    head.copy.u1 = (w << 4) + 8;
    head.copy.v1 = (h << 4) + 8;
    head.copy.blend = 1;
    out.push_back(pass.rectangle(CubeSend::ToDisplay, "cubes: buffer 0 onto the display", head.copy, Part::CubeToDisplay, Target::Display, Source::Work0, AlphaMode::AlphaOver));
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template class Cubes<EeArithmetic>;
#endif
template class Cubes<NativeArithmetic>;

}
