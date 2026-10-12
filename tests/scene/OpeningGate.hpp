#pragma once
#include <cstdio>
#include <string>
#include <vector>

#include "Parity/GsFrame.hpp"

namespace scenegate {

inline std::string vertexText(const parity::GsVertex& v) {
    char text[256];
    std::snprintf(text, sizeof text, "(%.9g, %.9g, z %u, rgba %g %g %g %g, stq %.9g %.9g %.9g)", v.x, v.y, v.depth, v.r, v.g, v.b, v.a, v.s, v.t, v.q);
    return text;
}

inline bool regionMode(parity::GsAddressMode mode) { return mode == parity::GsAddressMode::RegionClamp || mode == parity::GsAddressMode::RegionRepeat; }

inline bool sameAddress(const parity::GsAddress& a, const parity::GsAddress& b) {
    return a.mode == b.mode && (!regionMode(a.mode) || (a.min == b.min && a.max == b.max));
}

inline bool sameVertex(const parity::GsVertex& a, const parity::GsVertex& b, bool textured) {
    const bool position = a.x == b.x && a.y == b.y && a.depth == b.depth && a.r == b.r && a.g == b.g && a.b == b.b && a.a == b.a;
    return position && (!textured || (a.s == b.s && a.t == b.t && a.q == b.q));
}

// The first difference of state between two passes, or empty. The texture's address limits count only in the
// region modes, where the GS uses them; s, t, q count only when the pass is textured.
inline std::string stateDifference(const parity::GsPass& ours, const parity::GsPass& theirs) {
    if (ours.target != theirs.target) return "target " + ours.target + " vs " + theirs.target;
    if (ours.primitive != theirs.primitive) return "primitive";
    if (ours.scissor.x0 != theirs.scissor.x0 || ours.scissor.y0 != theirs.scissor.y0 || ours.scissor.x1 != theirs.scissor.x1 || ours.scissor.y1 != theirs.scissor.y1) return "scissor";
    if (ours.blend.has_value() != theirs.blend.has_value()) return std::string("blend ") + (ours.blend ? "on" : "off") + " vs " + (theirs.blend ? "on" : "off");
    if (ours.blend && (ours.blend->a != theirs.blend->a || ours.blend->b != theirs.blend->b || ours.blend->c != theirs.blend->c || ours.blend->d != theirs.blend->d ||
                       ours.blend->fixed != theirs.blend->fixed))
        return "blend terms";
    if (ours.antialias != theirs.antialias) return "antialias";
    if (ours.depth.test != theirs.depth.test || ours.depth.write != theirs.depth.write) return "depth";
    if (ours.texture.has_value() != theirs.texture.has_value()) return "texture presence";
    if (ours.texture) {
        const parity::GsTexture &a = *ours.texture, &b = *theirs.texture;
        if (a.source != b.source || a.sourceIsTarget != b.sourceIsTarget) return "texture source " + a.source + " vs " + b.source;
        if (a.width != b.width || a.height != b.height) return "texture size";
        if (a.coordinates != b.coordinates) return "texture coordinates";
        if (!sameAddress(a.addressU, b.addressU) || !sameAddress(a.addressV, b.addressV)) return "texture address";
        if (a.filter != b.filter) return "texture filter";
        if (a.alpha.constant != b.alpha.constant || a.alpha.value != b.alpha.value || a.alpha.zeroWhenBlack != b.alpha.zeroWhenBlack) return "texture alpha";
    }
    if (ours.skip != theirs.skip) return "skip '" + ours.skip + "' vs '" + theirs.skip + "'";
    return {};
}

inline std::string passDifference(const parity::GsPass& ours, const parity::GsPass& theirs) {
    if (std::string state = stateDifference(ours, theirs); !state.empty()) return state;
    if (ours.vertices.size() != theirs.vertices.size()) return "vertex count " + std::to_string(ours.vertices.size()) + " vs " + std::to_string(theirs.vertices.size());
    for (size_t v = 0; v < ours.vertices.size(); ++v)
        if (!sameVertex(ours.vertices[v], theirs.vertices[v], ours.texture.has_value()))
            return "vertex " + std::to_string(v) + " " + vertexText(ours.vertices[v]) + " vs " + vertexText(theirs.vertices[v]);
    return {};
}

inline std::string passLabel(const parity::GsPass& pass) {
    static const char* primitives[] = {"triangles", "sprites", "lines"};
    return pass.name + " " + primitives[int(pass.primitive)] + " " + (pass.texture ? pass.texture->source : std::string("flat"));
}


// Adjacent passes of equal state are one draw: the scene may send a layer in several packets where the dump holds it as one pass.
inline std::vector<parity::GsPass> coalesce(const std::vector<parity::GsPass>& passes) {
    std::vector<parity::GsPass> out;
    for (const parity::GsPass& pass : passes) {
        if (!out.empty() && stateDifference(out.back(), pass).empty()) {
            out.back().vertices.insert(out.back().vertices.end(), pass.vertices.begin(), pass.vertices.end());
            continue;
        }
        out.push_back(pass);
    }
    return out;
}

// The scene's passes against the dump's, in order: every dump pass is a scene pass, state and every vertex equal. `taken` sees each
// scene pass that matched.
template <class Taken>
int comparePasses(const std::vector<parity::GsPass>& ours, const std::vector<parity::GsPass>& dump, const std::string& at, Taken taken) {
    size_t j = 0;
    for (const parity::GsPass& theirs : dump) {
        if (j >= ours.size()) {
            std::fprintf(stderr, "%s: dump %s after the last scene pass\n", at.c_str(), passLabel(theirs).c_str());
            return 1;
        }
        const std::string difference = passDifference(ours[j], theirs);
        if (!difference.empty()) {
            std::fprintf(stderr, "%s: scene pass %zu (%s) differs from dump %s: %s\n", at.c_str(), j, ours[j].name.c_str(), passLabel(theirs).c_str(), difference.c_str());
            return 1;
        }
        taken(ours[j]);
        ++j;
    }
    if (j != ours.size()) {
        std::fprintf(stderr, "%s: scene pass %zu (%s) is not in the dump\n", at.c_str(), j, ours[j].name.c_str());
        return 1;
    }
    return 0;
}

}
