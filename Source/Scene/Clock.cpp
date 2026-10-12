#include "Scene/Clock.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <iterator>
#include <span>
#include <stdexcept>
#include <string>
#include <utility>

#include "Scene/Camera.hpp"

namespace scene {

namespace {

struct Header {
    std::string name;
    TargetName target = TargetName::Display;
    PassTopology topology = PassTopology::Triangles;
    Material material;
    bool edgeSmoothing = false;
    bool halfLine = false;
    bool primBlend = false;
};

// Primitives into passes: a pass is a run of primitives under one state, as the GS draws them. A strip becomes
// its triangles (i, i + 1, i + 2) or lines (i, i + 1); a flat primitive takes its last vertex's colour and a
// sprite its second corner's colour and depth, as the GS does.
class Builder {
public:
    Builder(Frame& frame, bool names) : m_frame(frame), m_names(names) {}
    bool names() const { return m_names; }
    void use(Header header) { m_header = std::move(header); }
    // What is drawn between (the text) keeps the next primitives out of the last pass.
    void cut() { m_cut = true; }

    std::vector<Vertex>& scratch() {
        m_scratch.clear();
        return m_scratch;
    }
    std::vector<Vertex>& held() { return m_held; }

    void triangles(std::span<const Vertex> strip) {
        for (size_t i = 0; i + 2 < strip.size(); ++i) put(std::array<Vertex, 3>{strip[i], strip[i + 1], strip[i + 2]});
    }
    void lines(std::span<const Vertex> strip) {
        for (size_t i = 0; i + 1 < strip.size(); ++i) put(std::array<Vertex, 2>{strip[i], strip[i + 1]});
    }
    // A triangle fan: triangle i is the centre, vertex i and vertex i + 1.
    void fan(std::span<const Vertex> vertices) {
        for (size_t i = 1; i + 1 < vertices.size(); ++i) put(std::array<Vertex, 3>{vertices[0], vertices[i], vertices[i + 1]});
    }
    void sprite(Vertex first, const Vertex& second) {
        first.z = second.z;
        put(std::array<Vertex, 2>{first, second});
    }

private:
    template <size_t N>
    void put(std::array<Vertex, N> primitive) {
        if (!m_header.material.gouraud || m_header.topology == PassTopology::Sprites)
            for (Vertex& v : primitive) {
                v.r = primitive.back().r;
                v.g = primitive.back().g;
                v.b = primitive.back().b;
                v.a = primitive.back().a;
            }
        Pass* last = m_frame.passes.empty() ? nullptr : &m_frame.passes.back();
        if (!last || m_cut || last->target != m_header.target || last->topology != m_header.topology || !(last->material == m_header.material) ||
            last->edgeSmoothing != m_header.edgeSmoothing || last->halfLine != m_header.halfLine || last->primBlend != m_header.primBlend) {
            m_frame.passes.push_back({m_header.name, m_header.target, m_header.topology, m_header.material, m_header.edgeSmoothing, m_header.halfLine, m_header.primBlend, {}});
            last = &m_frame.passes.back();
            m_cut = false;
        }
        last->vertices.insert(last->vertices.end(), primitive.begin(), primitive.end());
    }

    Frame& m_frame;
    bool m_names;
    Header m_header;
    bool m_cut = false;
    std::vector<Vertex> m_scratch;
    std::vector<Vertex> m_held;
};

uint8_t byteOf(float value, float scale) { return static_cast<uint8_t>(std::lround(value * scale)); }
uint32_t depthOf(float z) { return static_cast<uint32_t>(static_cast<int64_t>(z * 16.0f)) & 0xffffff; }

Material sampled(SourceKind source, CoordinateKind coordinates, Sampling sampling) {
    Material m;
    m.source = source;
    m.coordinates = coordinates;
    m.sampling = sampling;
    m.bilinear = true;
    return m;
}

Material fromTarget(TargetName target, bool colourOnly, int32_t width, int32_t height) {
    Material m = sampled(SourceKind::Target, CoordinateKind::Texel, Sampling::ClampToRegion);
    m.sourceTarget = target;
    m.colourOnly = colourOnly;
    m.region = {0, width - 1, 0, height - 1};
    return m;
}

Material fromTexture(int32_t texture, CoordinateKind coordinates, Sampling sampling) {
    Material m = sampled(SourceKind::Texture, coordinates, sampling);
    m.texture = texture;
    return m;
}

Material withState(Material m, BlendOp blend, DepthTest depth) {
    m.blend = blend;
    m.depthTest = depth;
    return m;
}

const char* partName(Part part) {
    switch (part) {
    case Part::Background: return "background";
    case Part::Blur: return "blur";
    case Part::Copy: return "copy";
    case Part::Tint: return "tint";
    case Part::Vignette: return "vignette";
    case Part::Fade: return "fade";
    case Part::BlurAfter: return "blur after";
    case Part::Bars: return "bars";
    case Part::Column: return "column";
    case Part::CubeHalf: return "cube half";
    case Part::CubeAdded: return "cubes added";
    case Part::CubeChainShrink: return "cubes chain shrink";
    case Part::CubeChainStretch: return "cubes chain stretch";
    case Part::CubeToDisplay: return "cubes to display";
    }
    return "?";
}

TargetName targetOf(Target target) {
    return target == Target::Display ? TargetName::Display : target == Target::Work0 ? TargetName::RefractionSource : TargetName::Work;
}

// facts/clock-frame-rest.md: a head draw's state. Only the background is drawn with the field's half line
// (clock_rest.mjs head: the display environment with the clear); the others use offset 0.
Header headHeader(const HeadDraw& d, int32_t width, int32_t height) {
    Material m;
    if (d.textured) {
        const CoordinateKind coordinates = d.coordinates == Coordinates::St ? CoordinateKind::Projective : CoordinateKind::Texel;
        switch (d.source) {
        case Source::Background: m = fromTexture(1, coordinates, Sampling::Repeat); break;
        case Source::Frame: m = fromTarget(TargetName::Display, true, width, height); break;
        case Source::Work0: m = fromTarget(TargetName::RefractionSource, false, width, height); break;
        case Source::Work1: m = fromTarget(TargetName::Work, false, width, height); break;
        case Source::None: throw std::runtime_error("a textured head draw without a source");
        }
        m.coordinates = coordinates;
    }
    static const BlendOp modes[] = {BlendOp::Add, BlendOp::AlphaOver, BlendOp::Subtract, BlendOp::FixedOver, BlendOp::FixedAdd};
    m.blend = d.blended ? modes[static_cast<int>(d.alpha)] : BlendOp::Opaque;
    m.blendConstant = d.blended && d.alpha == AlphaMode::Constant ? 0x28 : 0;
    m.depthTest = d.depthTest == 2 ? DepthTest::GreaterEqual : d.depthTest == 3 ? DepthTest::Greater : DepthTest::Always;
    m.gouraud = d.gouraud;
    return {partName(d.part), targetOf(d.target), d.topology == Topology::Sprite ? PassTopology::Sprites : PassTopology::Triangles, m, false, d.part == Part::Background};
}

Vertex headVertex(const HeadVertex& h, Coordinates coordinates) {
    Vertex v{h.x, h.y, h.z, 0, 0, 1, byteOf(h.r, 128), byteOf(h.g, 128), byteOf(h.b, 128), byteOf(h.a, 128)};
    if (coordinates == Coordinates::St) {
        v.u = h.s;
        v.v = h.t;
        v.q = h.q;
    } else if (coordinates == Coordinates::Uv) {
        v.u = h.u;
        v.v = h.v;
    }
    return v;
}

// The vignette's sectors continue one strip: its PRIM is sent once (clock_rest.mjs vignette).
void emitHead(Builder& out, const std::vector<HeadDraw>& draws, int32_t width, int32_t height) {
    std::vector<Vertex>& vignette = out.held();
    vignette.clear();
    const auto endVignette = [&] {
        if (!vignette.empty()) out.triangles(vignette);
        vignette.clear();
    };
    for (const HeadDraw& d : draws) {
        std::vector<Vertex>& vertices = out.scratch();
        for (const HeadVertex& h : d.vertices) vertices.push_back(headVertex(h, d.coordinates));
        if (d.part == Part::Vignette) {
            if (vignette.empty()) out.use(headHeader(d, width, height));
            vignette.insert(vignette.end(), vertices.begin(), vertices.end());
            continue;
        }
        endVignette();
        out.use(headHeader(d, width, height));
        if (d.topology == Topology::Sprite) {
            for (size_t i = 0; i + 1 < vertices.size(); i += 2) out.sprite(vertices[i], vertices[i + 1]);
        } else {
            out.triangles(vertices);
        }
    }
    endVignette();
}

// facts/clock-rod-draw.md "Per send" and facts/clock-extra-passes.md: the state of each send. The refracted
// faces have no blending; AA1 blends their edges with the ALPHA register as it stands.
std::string label(bool names, const std::string& name, const char* suffix) { return names ? name + suffix : std::string(); }

Header rodHeader(const std::string& name, bool names, RodSendKind kind, bool edge, bool split, int32_t grainTexture, int32_t width, int32_t height) {
    const BlendOp bent = edge ? BlendOp::AlphaOver : BlendOp::Opaque;
    switch (kind) {
    case RodSendKind::RefractedFar:
        return {label(names, name, " refracted far"), TargetName::Work, PassTopology::Triangles, withState(fromTarget(TargetName::RefractionSource, false, width, height), bent, DepthTest::Always), edge,
                true};
    case RodSendKind::GrainSubtracted:
        return {label(names, name, " grain subtracted"), TargetName::Work, PassTopology::Triangles,
                withState(fromTexture(2, CoordinateKind::Projective, Sampling::Repeat), BlendOp::Subtract, DepthTest::GreaterEqual), false, true};
    case RodSendKind::GrainAdded:
        return {label(names, name, " grain added"), TargetName::Work, PassTopology::Triangles,
                withState(fromTexture(2, CoordinateKind::Projective, Sampling::Repeat), BlendOp::Add, DepthTest::GreaterEqual), false, true};
    case RodSendKind::RefractedNearToFrame:
        return {label(names, name, " refracted near to the frame"), TargetName::Display, PassTopology::Triangles,
                withState(fromTarget(TargetName::Work, false, width, height), bent, DepthTest::GreaterEqual), edge, true};
    case RodSendKind::RefractedNearToRefraction:
        return {label(names, name, " refracted near to the refraction buffer"), TargetName::RefractionSource, PassTopology::Triangles,
                withState(fromTarget(TargetName::Work, false, width, height), bent, DepthTest::GreaterEqual), edge, true};
    case RodSendKind::Reflection:
        return {label(names, name, " reflection"), TargetName::Work, PassTopology::Triangles,
                withState(fromTexture(0, CoordinateKind::Texel, Sampling::Clamp), BlendOp::Opaque, split ? DepthTest::GreaterEqual : DepthTest::Always), false, true};
    case RodSendKind::Grain:
        return {label(names, name, " grain"), TargetName::Work, PassTopology::Triangles,
                withState(fromTexture(grainTexture, CoordinateKind::Projective, Sampling::Repeat), BlendOp::Subtract, DepthTest::Always), false, true};
    }
    throw std::runtime_error("unknown rod send");
}

Vertex rodVertex(const RodVertex& r) {
    return {r.x, r.y, depthOf(r.z), r.u, r.v, r.q, byteOf(r.r, 128), byteOf(r.g, 128), byteOf(r.b, 128), byteOf(r.a, 128)};
}

void emitRodSend(Builder& out, const std::string& name, const RodSend& send, bool split, int32_t grainTexture, int32_t width, int32_t height) {
    for (const RodFaceDraw& face : send.faces) {
        out.use(rodHeader(name, out.names(), send.kind, face.edgeSmoothing, split, grainTexture, width, height));
        std::vector<Vertex>& strip = out.scratch();
        for (const RodVertex& r : face.strip) strip.push_back(rodVertex(r));
        out.triangles(strip);
    }
}

// facts/clock-orbs.md: the trail (an antialiased line strip) and the two sprites, to the frame and to the refraction buffer.
void emitOrb(Builder& out, const OrbDraw& orb) {
    const std::string name = out.names() ? "orb " + std::to_string(orb.k) : std::string();
    for (size_t s = 0; s < orb.sends.size(); ++s) {
        const OrbSend& send = orb.sends[s];
        const TargetName target = s == 0 ? TargetName::Display : TargetName::RefractionSource;
        out.use({label(out.names(), name, " trail"), target, PassTopology::Lines, withState(Material{}, BlendOp::Add, DepthTest::Greater), true, true});
        std::vector<Vertex>& points = out.scratch();
        for (const OrbVertex& p : send.trail.points)
            points.push_back({p.x, p.y, depthOf(p.z), 0, 0, 1, byteOf(p.r, 255), byteOf(p.g, 255), byteOf(p.b, 255), byteOf(p.a, 128)});
        out.lines(points);
        const auto sprite = [&](const char* what, int32_t texture, const OrbSprite& corners) {
            out.use({out.names() ? name + " " + what : std::string(), target, PassTopology::Sprites, withState(fromTexture(texture, CoordinateKind::Texel, Sampling::Clamp), BlendOp::Add, DepthTest::Always), false,
                     true});
            const auto corner = [](const OrbVertex& c) {
                return Vertex{c.x, c.y, depthOf(c.z), c.u * 64.0f, c.v * 64.0f, 1, byteOf(c.r, 128), byteOf(c.g, 128), byteOf(c.b, 128), byteOf(c.a, 128)};
            };
            out.sprite(corner(corners.first), corner(corners.second));
        };
        sprite("glow", 7, send.glow);
        sprite("disc", 6, send.disc);
    }
}

// facts/config-cubes.md "Drawing one cube" and "The pass", clock_cubes.mjs drawing(): the state of each send. The far faces
// sample the frame (gs.frameTexture) into the work buffer, the near ones the work buffer into the refraction buffer;
// the grain sends add with an offset and subtract without; the layer's reflection is clock texture 5.
Header cubeHeader(CubeSend send, bool edge, int32_t width, int32_t height) {
    const BlendOp bent = edge ? BlendOp::AlphaOver : BlendOp::Opaque;
    const Material grain = fromTexture(2, CoordinateKind::Projective, Sampling::Repeat);
    switch (send) {
    case CubeSend::RefractedFar:
        return {"cube refracted far", TargetName::Work, PassTopology::Triangles, withState(fromTarget(TargetName::Display, true, width, height), bent, DepthTest::Always), edge, true};
    case CubeSend::GrainOffsetFar:
        return {"cube grain offset far", TargetName::Work, PassTopology::Triangles, withState(grain, BlendOp::Add, DepthTest::GreaterEqual), false, true};
    case CubeSend::GrainPlainFar:
        return {"cube grain plain far", TargetName::Work, PassTopology::Triangles, withState(grain, BlendOp::Subtract, DepthTest::GreaterEqual), false, true};
    case CubeSend::EdgeColour:
        return {"cube edge colour", TargetName::RefractionSource, PassTopology::Triangles, withState(Material{}, BlendOp::AlphaOver, DepthTest::Always), true, true, true};
    case CubeSend::Depth:
        return {"cube depth", TargetName::RefractionSource, PassTopology::Triangles, withState(Material{}, BlendOp::Add, DepthTest::GreaterEqual), true, true, true};
    case CubeSend::RefractedNear:
        return {"cube refracted near", TargetName::RefractionSource, PassTopology::Triangles, withState(fromTarget(TargetName::Work, false, width, height), bent, DepthTest::Always), edge,
                true};
    case CubeSend::GrainOffsetNear:
        return {"cube grain offset near", TargetName::RefractionSource, PassTopology::Triangles, withState(grain, BlendOp::Add, DepthTest::GreaterEqual), false, true};
    case CubeSend::GrainPlainNear:
        return {"cube grain plain near", TargetName::RefractionSource, PassTopology::Triangles, withState(grain, BlendOp::Subtract, DepthTest::GreaterEqual), false, true};
    case CubeSend::LayerReflection:
        return {"cube layer reflection", TargetName::Work, PassTopology::Triangles, withState(fromTexture(5, CoordinateKind::Texel, Sampling::Clamp), bent, DepthTest::Always), edge, true};
    case CubeSend::LayerAlpha:
        return {"cube layer alpha", TargetName::Work, PassTopology::Triangles, withState(Material{}, BlendOp::Add, DepthTest::GreaterEqual), edge, true, true};
    case CubeSend::LayerClear:
    case CubeSend::HalfBuffer:
    case CubeSend::Added:
    case CubeSend::ChainShrink:
    case CubeSend::ChainStretch:
    case CubeSend::ToDisplay:
        break;
    }
    throw std::runtime_error("a cube send that is not a face send");
}

void clearTarget(Builder& out, const std::string& name, TargetName target, const Colour& colour, int32_t width, int32_t height);

void emitCubes(Builder& out, const std::vector<CubeDraw>& draws, int32_t width, int32_t height) {
    for (const CubeDraw& d : draws) {
        if (d.send == CubeSend::LayerClear) {
            clearTarget(out, out.names() ? "cubes layer clear" : "", TargetName::Work, d.clear, width, height);
        } else if (d.rectangle) {
            emitHead(out, {*d.rectangle}, width, height);
        } else {
            for (const RodFaceDraw& face : d.faces) {
                out.use(cubeHeader(d.send, face.edgeSmoothing, width, height));
                std::vector<Vertex>& strip = out.scratch();
                for (const RodVertex& r : face.strip) strip.push_back(rodVertex(r));
                out.triangles(strip);
            }
        }
    }
}

// facts/text.md: the text's draws, all to the display with its field half line. A glyph is a Gouraud, textured,
// blended fan (PRIM 0x5D) of the glyph cache, ST, region clamp to its cell, bilinear (TEX1 0x60), blend 0x44, depth
// test always (Font_PutsPackets' TEST 0x30000); the hint's picture is DrawIcon's rectangle (func_00233770) of a clock
// texture bound with blend 0x44 and depth test always (func_002349E0).
void emitText(Builder& out, const TextFrame& text) {
    for (const TextDraw& d : text.draws) {
        if (d.kind == TextDraw::Kind::Glyph) {
            Material m = fromTexture(kGlyphTexture, CoordinateKind::Projective, Sampling::ClampToRegion);
            m.region = d.glyph.region;
            m.blend = BlendOp::AlphaOver;
            m.gouraud = true;
            out.use({"text", TargetName::Display, PassTopology::Triangles, m, false, true});
            std::vector<Vertex>& fan = out.scratch();
            for (const GlyphVertex& g : d.glyph.fan) fan.push_back({g.x, g.y, 0, g.s, g.t, g.q, g.colour[0], g.colour[1], g.colour[2], g.colour[3]});
            out.fan(fan);
            continue;
        }
        const Rect& r = d.icon;
        out.use({"hint picture", TargetName::Display, PassTopology::Sprites, withState(fromTexture(d.texture, CoordinateKind::Texel, Sampling::Clamp), BlendOp::AlphaOver, DepthTest::Always),
                 false, true});
        const auto corner = [&](int32_t x, int32_t y, int32_t u, int32_t v) {
            return Vertex{float(x) / 16.0f, float(y) / 16.0f, static_cast<uint32_t>(r.z) & 0xffffff, float(u & 0xffff) / 16.0f, float(v & 0xffff) / 16.0f, 1,
                          static_cast<uint8_t>(r.colour[0]), static_cast<uint8_t>(r.colour[1]), static_cast<uint8_t>(r.colour[2]), static_cast<uint8_t>(r.colour[3])};
        };
        out.sprite(corner(r.x0, r.y0, r.u0, r.v0), corner(r.x1, r.y1, r.u1, r.v1));
    }
}

// clock_frame.mjs stateWriters work/display with a clear: a sprite over the whole target at depth 0.
void clearTarget(Builder& out, const std::string& name, TargetName target, const Colour& colour, int32_t width, int32_t height) {
    out.use({name, target, PassTopology::Sprites, Material{}, false, true});
    const auto byte = [](int32_t c) { return static_cast<uint8_t>(c); };
    const Vertex first{0, 0, 0, 0, 0, 1, byte(colour[0]), byte(colour[1]), byte(colour[2]), byte(colour[3])};
    Vertex second = first;
    second.x = static_cast<float>(width);
    second.y = static_cast<float>(height);
    out.sprite(first, second);
}

}

template <class A>
Clock<A>::Clock(const ClockInputs& in)
    : m_state(in.state), m_head(in.head), m_rods(in.mesh, in.rodTemplate), m_orbs(in.orbs), m_clearColour(in.clearColour), m_firstDisplayClear(in.firstDisplayClear), m_tube(in.tube),
      m_minuteFactor(in.minuteFactor), m_fractionEasing(in.fractionEasing), m_orbColour(in.orbColour), m_hasEntryData(in.hasEntryData), m_wide(in.wide), m_orbRandom(in.orbRandom), m_orbColours(in.orbColours), m_width(in.width), m_height(in.height), m_textRamps(in.text.ramps), m_passNames(in.passNames) {
    if (in.font && in.program) m_text.emplace(in.font, in.program, in.text);
    if (in.menus) {
        m_menus.emplace(in.menus->options);
        m_cubes.emplace(in.menus->cubeMesh);
        m_menusState = in.menus->menus;
        m_cubeState = in.menus->cubes;
        m_items = in.menus->items;
    }
}

template <class A>
MenuWorld Clock<A>::menuWorld() {
    return {m_state, m_head.state(), m_orbs.spriteFade, m_menusState, m_cubeState, m_items, m_width, m_height, &m_sounds, &m_rtcWrite};
}

// References/model/clock_frame.mjs frame(), the clock screen's parts, in its order.
template <class A>
Frame Clock<A>::frame(const FrameInputs& in) {
    Frame frame;
    frame.width = m_width;
    frame.height = m_height;
    frame.field = in.field;
    frame.displayIndex = in.displayIndex;
    Builder out(frame, m_passNames);

    m_state.time = in.time;
    if (!m_menus) m_state.timeFilled = in.timeFilled.value_or(1);
    m_state.scene.field = in.field;
    m_strings.clear();
    m_notes.clear();
    m_sounds.clear();
    m_rtcWrite.reset();
    MenuExternals ext;
    if (m_menus) {
        ext = in.menu;
        if (in.timeFilled) m_state.timeFilled = *in.timeFilled;
        if (in.configItems) {
            const bool modelsItem0 = m_menusState.configGate.has_value() && ext.mechaconParam.has_value();
            for (size_t i = modelsItem0 ? 1 : 0; i < m_items.size(); ++i) m_items[i] = (*in.configItems)[i];
        }
        if (in.threadStep) {
            MenuWorld world = menuWorld();
            Menus::between(world, ext, m_notes);
        }
    }
    const CameraMatrices camera = Camera<A>::matrices(m_state);

    HeadInputs head;
    head.width = m_width;
    head.height = m_height;
    head.mode = m_state.mode;
    head.overlayLevel = m_state.overlayLevel;
    head.level = static_cast<uint32_t>(m_state.level);
    head.counter = m_state.counter;
    head.item0 = m_menus ? m_items[0] : in.item0;
    head.proportionX = m_state.proportions.ax;
    head.proportionY = m_state.proportions.ay;
    head.clearColour = m_clearColour;
    head.tube = m_tube;

    clearTarget(out, "clear", TargetName::Display, in.displayIndex == 0 ? m_firstDisplayClear : m_clearColour, m_width, m_height);
    emitHead(out, m_head.head(head, camera.view, camera.screen), m_width, m_height);

    RodsInput rods;
    rods.currentRod = m_state.state.currentRod;
    rods.secondsAngle = m_state.state.secondsAngle;
    rods.rodAngle = m_state.state.rodAngle;
    for (size_t i = 0; i < 12; ++i) {
        const RodState& r = m_state.state.rods[i];
        rods.rods[i] = {r.appearance, r.progress, r.base, r.reflection};
    }
    rods.accent = m_state.state.accent;
    rods.fourth = m_state.state.fourth;
    rods.width = m_width;
    rods.height = m_height;
    rods.field = in.field;
    const RodsFrame rodFrame = m_rods.frame(rods, camera.view, camera.screen);

    OrbInputs orbs;
    orbs.milliseconds = m_state.time.milliseconds;
    orbs.seconds = m_state.time.seconds;
    orbs.minutes = m_state.time.minutes;
    orbs.secondHand = m_state.eased.secondHand;
    orbs.hourHand = m_state.eased.hourHand;
    orbs.progress = m_state.eased.progress;
    orbs.minuteFactor = m_minuteFactor;
    orbs.fractionEasing = m_fractionEasing;
    orbs.sceneScale = m_state.scene.scale;
    orbs.colour = m_orbColour;
    orbs.mode = m_state.mode;
    orbs.overlayLevel = m_state.overlayLevel;
    orbs.hasEntryData = m_hasEntryData;
    orbs.wide = m_wide;
    orbs.random = m_orbRandom;
    for (size_t k = 0; k < kOrbCount; ++k) orbs.colours[k] = m_orbColours[k];
    orbs.width = m_width;
    orbs.height = m_height;
    m_orbs.fraction = m_state.eased.fraction;
    const OrbFrame orbFrame = Orbs<A>::frame(m_orbs, orbs, camera.view, camera.screen);
    m_state.eased.fraction = m_orbs.fraction;
    m_rods.rodTemplate().local = orbFrame.orbs[kOrbCount - 1].local;

    // facts/clock-scene.md "The draw list": the rods, then the orbs 0 to 6, by the depth of their origin.
    std::vector<DepthNode> list = rodFrame.list;
    for (int k = 0; k < kOrbCount; ++k) insertByDepth(list, {true, k, orbFrame.orbs[static_cast<size_t>(k)].depthKey});
    for (const DepthNode& node : list) {
        if (node.orb) {
            emitOrb(out, orbFrame.orbs[static_cast<size_t>(node.index)]);
            continue;
        }
        const Rod& rod = rodFrame.rods[static_cast<size_t>(node.index)];
        if (!rod.drawn) continue;
        for (const RodSend& send : rod.sends) emitRodSend(out, out.names() ? "rod " + std::to_string(rod.record.number) : std::string(), send, !rod.pieces.empty(), 2, m_width, m_height);
    }
    for (size_t pass = 0; pass < rodFrame.extraPasses.size(); ++pass) {
        const std::string name = out.names() ? "extra pass " + std::to_string(pass) : std::string();
        clearTarget(out, label(out.names(), name, " clear"), TargetName::Work, {0, 0, 0, 0x80}, m_width, m_height);
        for (const RodExtraDraw& draw : rodFrame.extraPasses[pass]) {
            const std::string rod = out.names() ? name + " rod " + std::to_string(rodFrame.rods[draw.rod].record.number) : std::string();
            emitRodSend(out, rod, draw.reflection, draw.split, draw.grainTexture, m_width, m_height);
            emitRodSend(out, rod, draw.grain, draw.split, draw.grainTexture, m_width, m_height);
        }
        out.use({label(out.names(), name, " added to the frame"), TargetName::Display, PassTopology::Sprites,
                 withState(fromTarget(TargetName::Work, false, m_width, m_height), BlendOp::Add, DepthTest::Always), false, false});
        const float w = static_cast<float>(m_width), h = static_cast<float>(m_height);
        out.sprite({0, 0, 0, 0.5f, 0.5f, 1, 0x80, 0x80, 0x80, 30}, {w, h, 0, w + 0.5f, h + 0.5f, 1, 0x80, 0x80, 0x80, 30});
    }

    m_head.state().vignetteRamp = m_state.vignetteRamp;
    emitHead(out, m_head.overlay(head), m_width, m_height);
    m_state.vignetteRamp = m_head.state().vignetteRamp;
    emitHead(out, m_head.tripsAfter(head), m_width, m_height);

    ClockState atMenus;
    ConfigItems atItems{};
    TextRamps pageRamps;
    std::optional<PagesInputs> pages;
    if (m_menus) {
        emitCubes(out, m_cubes->frame(m_cubeState, m_head.state(), m_state, {m_width, m_height, in.field, m_menusState.body}), m_width, m_height);
        MenuWorld world = menuWorld();
        Menus::menuStep(world, ext);
        atMenus = m_state;
        atItems = m_items;
        MenusState before = m_menusState;
        {
            // The pages' function runs before the page's input: its list crossfade is the step's without a move (clock_menus.mjs).
            ClockState probeClock = m_state;
            HeadState probeHead = m_head.state();
            Ramp probeFade = m_orbs.spriteFade;
            MenusState probeMenus = m_menusState;
            CubeState probeCubes = m_cubeState;
            ConfigItems probeItems = m_items;
            MenuWorld probe{probeClock, probeHead, probeFade, probeMenus, probeCubes, probeItems, m_width, m_height};
            MenuExternals masked = ext;
            masked.pad.pressed &= ~(pad::Up | pad::Down);
            std::vector<std::string> sink;
            m_menus->step(probe, masked, sink);
            before.listFade = probeMenus.listFade;
        }
        const ConfigEntry& chosen = m_menusState.entries.at(static_cast<size_t>(std::clamp(m_menusState.page.selected, 0, 8)));
        if ((ext.pad.pressed & pad::Cross) && m_menusState.page.ramp.state == 2 && m_menusState.page.level == 0 &&
            std::find(m_unmodelled.begin(), m_unmodelled.end(), chosen.stringCallback) != m_unmodelled.end()) {
            ext.pad.pressed &= ~pad::Cross;
            m_notes.push_back("an entry whose value is not modelled cannot be entered");
        }
        m_menus->step(world, ext, m_notes);
        const TextRamps& constants = in.textRamps ? *in.textRamps : m_textRamps;
        pageRamps = textRampsOf(menusAtPages(before, m_menusState), constants);
        pages = pagesOf(menusAtPages(before, m_menusState), atMenus, atItems, pageRamps, m_width, m_height);
        out.cut();
        if (m_text) {
            PagesFrame drawn = m_text->pages(*pages);
            emitText(out, drawn.text);
            m_strings = std::move(drawn.text.strings);
            m_unmodelled = std::move(drawn.unmodelled);
            if (drawn.titleWidth) m_menusState.page.titleWidth = *drawn.titleWidth;
            out.cut();
        }
    }
    emitHead(out, m_head.bars(head), m_width, m_height);
    frame.textAt = frame.passes.size();
    out.cut();
    if (m_text) {
        TextFrameInputs text;
        text.items = in.items;
        text.item0 = in.item0;
        text.overlayLevel = m_state.overlayLevel;
        text.tail = m_state.tail;
        text.menu = m_state.menuRamp;
        text.width = m_width;
        text.height = m_height;
        if (m_menus) {
            text.items = {m_items[6], m_items[7], m_items[8], m_items[9], m_items[10], m_items[11]};
            text.item0 = m_items[0];
            text.overlayLevel = atMenus.overlayLevel;
            text.tail = atMenus.tail;
            text.menu = atMenus.menuRamp;
            text.ramps = textRampsOf(m_menusState, in.textRamps ? *in.textRamps : m_textRamps);
        }
        TextFrame drawn = m_text->frame(text);
        emitText(out, drawn);
        frame.glyphs = std::move(drawn.glyphs);
        m_strings.insert(m_strings.end(), std::make_move_iterator(drawn.strings.begin()), std::make_move_iterator(drawn.strings.end()));
        out.cut();
    }
    emitHead(out, m_head.column(head), m_width, m_height);

    ClockLogic<A>::step(m_state);
    if (m_menus) {
        MenuWorld world = menuWorld();
        Menus::endOfFrame(world, ext);
        m_external = ext;
    }
    return frame;
}

#ifndef SCENE_NATIVE_ONLY
template class Clock<EeArithmetic>;
#endif
template class Clock<NativeArithmetic>;

}
