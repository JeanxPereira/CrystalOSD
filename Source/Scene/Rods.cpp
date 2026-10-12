#include "Scene/Rods.hpp"

#include <array>
#include <fstream>
#include <stdexcept>
#include <string>
#include <utility>

#include <nlohmann/json.hpp>

#include "Scene/RodEmitters.hpp"

namespace scene {

namespace {

std::vector<Vec4> vectors(const nlohmann::json& part) {
    const nlohmann::json& bits = part.at("bits");
    if (bits.size() % 4 != 0) throw std::runtime_error("rod mesh: a part is not whole vectors");
    std::vector<Vec4> out(bits.size() / 4);
    for (size_t i = 0; i < bits.size(); ++i) out[i / 4][i % 4] = asFloat(static_cast<uint32_t>(std::stoul(bits.at(i).get<std::string>(), nullptr, 16)));
    return out;
}

constexpr float kRodsShownAbove = 0.05f;

struct Set {
    RodPiece piece;
    RodRecord rod;
    std::vector<const RodFace*> faces;
    float lift;
};

using Sided = std::vector<std::pair<const Set*, const RodFace*>>;

struct SetList {
    std::array<Set, 2> items;
    size_t count = 0;
    const Set* begin() const { return items.data(); }
    const Set* end() const { return items.data() + count; }
};

void sideOf(Sided& faces, const SetList& sets, bool side) {
    faces.clear();
    for (const Set& set : sets)
        for (const RodFace* face : set.faces)
            if ((face->flag != 0) == side) faces.push_back({&set, face});
}

void reset(Set& set, RodPiece piece, const RodRecord& rod, float lift) {
    set.piece = piece;
    set.rod = rod;
    set.faces.clear();
    set.lift = lift;
}

// The pieces drawn: the whole rod, or piece A's faces 8 and up and piece B's all but 8 and 9.
void setsOf(SetList& sets, const Rod& rod, const RodRecord& a, const RodRecord& b, float lift) {
    if (rod.pieces.empty()) {
        Set& whole = sets.items[0];
        reset(whole, RodPiece::Whole, rod.record, 0.0f);
        for (const RodFace& face : rod.whole.faces) whole.faces.push_back(&face);
        sets.count = 1;
        return;
    }
    Set& first = sets.items[0];
    reset(first, RodPiece::A, a, 0.0f);
    for (const RodFace& face : rod.pieces[0].transform.faces)
        if (face.index >= 8) first.faces.push_back(&face);
    Set& second = sets.items[1];
    reset(second, RodPiece::B, b, lift);
    for (const RodFace& face : rod.pieces[1].transform.faces)
        if (face.index != 8 && face.index != 9) second.faces.push_back(&face);
    sets.count = 2;
}

}

RodMesh loadRodMesh(const std::filesystem::path& file) {
    std::ifstream in(file, std::ios::binary);
    if (!in) throw std::runtime_error("cannot open " + file.string());
    const nlohmann::json j = nlohmann::json::parse(in);
    RodMesh mesh{vectors(j.at("positions")), vectors(j.at("normals")), vectors(j.at("coordinates"))};
    const size_t faces = j.at("faces").get<size_t>();
    if (mesh.normals.size() < faces || mesh.positions.size() < faces * 4 || mesh.coordinates.size() < faces * 4)
        throw std::runtime_error("rod mesh: fewer vectors than faces");
    return mesh;
}

template <class A>
Rods<A>::Rods(RodMesh mesh, const RodRecord& rodTemplate) : m_mesh(std::move(mesh)), m_template(rodTemplate) {}

// facts/clock-scene.md, "Submitting the rods": the rod's matrix chain.
template <class A>
Mat4 Rods<A>::rodMatrix(int32_t i, int32_t ring, int32_t spin) {
    using M = Matrix<A>;
    Mat4 m = M::rotateY(M::rotateZ(M::identity(), ring), spin);
    m = M::rotateZ(m, s16(((i << 16) / 12) - 0x8000));
    m = M::move(m, 0.0f, 20.0f, 0.0f);
    return M::rotateY(m, s16(s16(spin) << 2));
}

// facts/clock-rod-draw.md, "Transform".
template <class A>
RodTransform Rods<A>::transform(const RodRecord& rod, const Mat4& view, const Mat4& screen, const RodMesh& mesh) {
    using M = Matrix<A>;
    const Mat4 m = M::multiply(view, rod.local);
    Vec4 centre = M::apply(screen, M::apply(m, {0, 0, 0, 1}));
    const float inverse = A::div(1.0f, centre[3]);
    for (float& x : centre) x = A::mul(x, inverse);
    RodTransform out{A::sub(centre[0], 2048.0f), A::sub(centre[1], 2048.0f), centre[2], {}};
    out.faces.reserve(static_cast<size_t>(rod.faces));
    for (int32_t i = 0; i < rod.faces; ++i) {
        RodFace face;
        face.index = i;
        face.normal = M::apply(m, mesh.normals.at(static_cast<size_t>(i)));
        for (size_t k = 0; k < 4; ++k) {
            const size_t at = static_cast<size_t>(i) * 4 + k;
            const Vec4& p = mesh.positions.at(at);
            RodFaceVertex& v = face.vertices[k];
            v.eye = M::apply(m, {A::mul(p[0], rod.sx), A::mul(p[1], rod.sy), A::mul(p[2], rod.sz), 1.0f});
            Vec4 on = M::apply(screen, v.eye);
            v.q = A::div(1.0f, on[3]);
            for (float& x : on) x = A::mul(x, v.q);
            v.screen = on;
            const Vec4& st = mesh.coordinates.at(at);
            v.s = st[0];
            v.t = A::mul(st[1], rod.sy);
            for (size_t n = 0; n < 3; ++n) v.fixed[n] = A::toInt(A::mul(on[n], 16.0f));
        }
        const Vec4& v0 = face.vertices[0].screen;
        const float e2x = A::sub(face.vertices[2].screen[0], v0[0]), e2y = A::sub(face.vertices[2].screen[1], v0[1]);
        const float e1x = A::sub(face.vertices[1].screen[0], v0[0]), e1y = A::sub(face.vertices[1].screen[1], v0[1]);
        face.flag = A::sub(A::mul(e2x, e1y), A::mul(e2y, e1x)) > 0 ? 0 : 1;
        out.faces.push_back(face);
    }
    return out;
}

// facts/clock-rod-draw.md: 1 - |eye direction . normal| at the face's first vertex.
template <class A>
float Rods<A>::edgeTerm(const RodFace& face) {
    using M = Matrix<A>;
    const Vec4& eye = face.vertices[0].eye;
    const float d = M::dot(M::normalize({eye[0], eye[1], eye[2]}), {face.normal[0], face.normal[1], face.normal[2]});
    return A::sub(1.0f, d < 0 ? -d : d);
}

// References/model/clock_frame.mjs scene(): the rods' part, in its order (facts/clock-scene.md).
template <class A>
RodsFrame Rods<A>::frame(const RodsInput& input, const Mat4& view, const Mat4& screen) {
    RodsFrame out;
    if (!(kRodsShownAbove < input.rods[0].appearance)) return out;
    out.rods.reserve(12);
    out.list.reserve(12);
    SetList sets;
    Sided side;

    for (int32_t i = 0; i < 12; ++i) {
        const uint32_t number = (static_cast<uint32_t>(i) + static_cast<uint32_t>(input.currentRod)) % 12u;
        const RodLight& light = input.rods[number];
        m_template.local = rodMatrix(i, input.rodAngle, input.secondsAngle);
        m_template.number = static_cast<int32_t>(number);
        m_template.sy = light.appearance;
        m_template.base = light.base;
        m_template.reflection = light.reflection;
        m_template.strength = i == 0 ? 200.0f : 160.0f;
        Rod rod;
        rod.placement = i;
        rod.record = m_template;
        rod.t = i == 0 ? light.progress : -1.0f;
        rod.key = depthKey(view, rod.record.local);
        rod.matrix = Matrix<A>::multiply(view, rod.record.local);
        out.rods.push_back(rod);
        insertByDepth(out.list, {false, i, rod.key});
    }

    using E = RodEmitters<A>;
    const E emit{input};
    // Piece B's texture offsets move by 2 t s (facts/clock-rod-draw.md).
    const auto liftOf = [](const Rod& rod) { return A::add(A::mul(rod.t, rod.record.sy), A::mul(rod.t, rod.record.sy)); };

    for (const DepthNode& node : out.list) {
        Rod& rod = out.rods[static_cast<size_t>(node.index)];
        if (rod.record.sy < 0) continue;
        rod.drawn = true;
        rod.whole = transform(rod.record, view, screen, m_mesh);
        rod.cx = A::mul(rod.whole.cx, E::kNineTenths);
        rod.cy = A::mul(rod.whole.cy, E::kNineTenths);
        if (rod.t > 0) {
            const float s = rod.record.sy;
            RodRecord a = rod.record, b = rod.record;
            a.sy = A::mul(rod.t, s);
            a.strength = rod.placement == 0 ? 100.0f : 0.0f;
            a.base = input.accent;
            b.sy = A::mul(A::sub(1.0f, rod.t), s);
            b.local[3] = Matrix<A>::apply(rod.record.local, {0.0f, A::mul(A::mul(s, 26.0f), rod.t), 0.0f, 1.0f});
            rod.pieces.reserve(2);
            rod.pieces.push_back({RodPiece::A, a, transform(a, view, screen, m_mesh)});
            rod.pieces.push_back({RodPiece::B, b, transform(b, view, screen, m_mesh)});
        }
        if (rod.pieces.empty()) setsOf(sets, rod, rod.record, rod.record, 0.0f);
        else setsOf(sets, rod, rod.pieces[0].record, rod.pieces[1].record, liftOf(rod));
        const auto bent = [&](RodSendKind kind, bool nearSide, int32_t extra) {
            RodSend send{kind, {}};
            sideOf(side, sets, nearSide);
            send.faces.reserve(side.size());
            for (const auto& [set, face] : side) send.faces.push_back(emit.refracted(*face, set->rod, rod.cx, rod.cy, extra, set->piece));
            return send;
        };
        const auto grain = [&](RodSendKind kind, bool paired) {
            RodSend send{kind, {}};
            sideOf(side, sets, false);
            send.faces.reserve(side.size());
            for (const auto& [set, face] : side) {
                const auto [ds, dt] = E::offsets(set->rod, *face, set->lift, paired);
                send.faces.push_back(emit.textured(*face, set->rod.textured, ds, dt, set->piece));
            }
            return send;
        };
        rod.sends.reserve(5);
        rod.sends.push_back(bent(RodSendKind::RefractedFar, false, 0));
        rod.sends.push_back(grain(RodSendKind::GrainSubtracted, false));
        rod.sends.push_back(grain(RodSendKind::GrainAdded, true));
        rod.sends.push_back(bent(RodSendKind::RefractedNearToFrame, true, 0));
        rod.sends.push_back(bent(RodSendKind::RefractedNearToRefraction, true, 0xff));
    }

    // facts/clock-extra-passes.md: two passes over the list. A split rod's pieces take the
    // fourth colour as their reflection; a whole rod keeps its own.
    for (int32_t pass = 0; pass < 2; ++pass)
        for (const DepthNode& node : out.list) {
            const Rod& rod = out.rods[static_cast<size_t>(node.index)];
            if (!rod.drawn) continue;
            const bool split = !rod.pieces.empty();
            if (split) {
                RodRecord a = rod.pieces[0].record, b = rod.pieces[1].record;
                a.strength = rod.record.strength;
                a.base = rod.record.base;
                a.reflection = input.fourth;
                b.reflection = input.fourth;
                setsOf(sets, rod, a, b, liftOf(rod));
            } else {
                setsOf(sets, rod, rod.record, rod.record, 0.0f);
            }
            RodExtraDraw draw{static_cast<size_t>(node.index), split, (pass != 0) == split ? 3 : 2, {RodSendKind::Reflection, {}}, {RodSendKind::Grain, {}}};
            sideOf(side, sets, true);
            draw.reflection.faces.reserve(side.size());
            draw.grain.faces.reserve(side.size());
            for (const auto& [set, face] : side) draw.reflection.faces.push_back(emit.reflected(*face, set->rod.reflection, set->piece));
            for (const auto& [set, face] : side) {
                const auto [ds, dt] = E::offsets(set->rod, *face, set->lift, pass != 0);
                draw.grain.faces.push_back(emit.textured(*face, set->rod.extra, ds, dt, set->piece));
            }
            out.extraPasses[static_cast<size_t>(pass)].push_back(std::move(draw));
        }
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template class Rods<EeArithmetic>;
#endif
template class Rods<NativeArithmetic>;

}
