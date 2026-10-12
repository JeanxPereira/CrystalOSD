#include "SceneGate.hpp"

#include <cstdio>
#include <fstream>
#include <map>

#include "SceneFixture.hpp"

namespace scenetest {

using nlohmann::json;

std::string vertexText(const parity::GsVertex& v) {
    char text[256];
    std::snprintf(text, sizeof text, "(%.9g, %.9g, z %u, rgba %g %g %g %g, stq %.9g %.9g %.9g)", v.x, v.y, v.depth, v.r, v.g, v.b, v.a, v.s, v.t, v.q);
    return text;
}

bool regionMode(parity::GsAddressMode mode) { return mode == parity::GsAddressMode::RegionClamp || mode == parity::GsAddressMode::RegionRepeat; }

bool sameAddress(const parity::GsAddress& a, const parity::GsAddress& b) {
    return a.mode == b.mode && (!regionMode(a.mode) || (a.min == b.min && a.max == b.max));
}

bool sameVertex(const parity::GsVertex& a, const parity::GsVertex& b, bool textured) {
    const bool position = a.x == b.x && a.y == b.y && a.depth == b.depth && a.r == b.r && a.g == b.g && a.b == b.b && a.a == b.a;
    return position && (!textured || (a.s == b.s && a.t == b.t && a.q == b.q));
}

// The first difference of state between two passes, or empty. The texture's address limits count only in the
// region modes, where the GS uses them; s, t, q count only when the pass is textured.
std::string stateDifference(const parity::GsPass& ours, const parity::GsPass& theirs) {
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

std::string passDifference(const parity::GsPass& ours, const parity::GsPass& theirs) {
    if (std::string state = stateDifference(ours, theirs); !state.empty()) return state;
    if (ours.vertices.size() != theirs.vertices.size()) return "vertex count " + std::to_string(ours.vertices.size()) + " vs " + std::to_string(theirs.vertices.size());
    for (size_t v = 0; v < ours.vertices.size(); ++v)
        if (!sameVertex(ours.vertices[v], theirs.vertices[v], ours.texture.has_value()))
            return "vertex " + std::to_string(v) + " " + vertexText(ours.vertices[v]) + " vs " + vertexText(theirs.vertices[v]);
    return {};
}

std::string passLabel(const parity::GsPass& pass) {
    static const char* primitives[] = {"triangles", "sprites", "lines"};
    return pass.name + " " + primitives[int(pass.primitive)] + " " + (pass.texture ? pass.texture->source : std::string("flat"));
}

bool TextCount::isText(const parity::GsPass& pass) {
    if (!pass.texture || pass.texture->sourceIsTarget) return false;
    const std::string& source = pass.texture->source;
    if (pass.primitive == parity::GsPrimitive::Triangles) return source.ends_with("-20-9x9");
    return pass.primitive == parity::GsPrimitive::Sprites && (source == "t2ec0-1-0-6x6" || source == "t2e80-1-0-6x6");
}

void TextCount::take(const parity::GsPass& pass) {
    if (!isText(pass)) return;
    if (pass.primitive == parity::GsPrimitive::Triangles) font += 1;
    else hint += 1;
}

// frame_passes.mjs marks the paletted texture as a format the parity rule's fixtures do not carry; the scene's pass
// draws it from the glyph cache image instead.
parity::GsPass dumpPass(const json& p) {
    parity::GsPass pass = parity::readPass(p);
    if (pass.skip == "texture format 0x14") pass.skip.clear();
    return pass;
}

// The scene's passes against the dump's, in order: every dump pass is a scene pass, state and every vertex equal.
int compareFrame(const parity::GsFrame& ours, const json& dump, TextCount& count, const std::string& at, bool absorbText) {
    size_t j = 0;
    for (const json& p : dump.at("passes")) {
        const parity::GsPass theirs = dumpPass(p);
        if (absorbText && TextCount::isText(theirs) && (j >= ours.passes.size() || !passDifference(ours.passes[j], theirs).empty())) {
            ++count.absorbed;
            continue;
        }
        if (j >= ours.passes.size()) {
            std::fprintf(stderr, "%s: dump %s after the last scene pass\n", at.c_str(), passLabel(theirs).c_str());
            return 1;
        }
        const std::string difference = passDifference(ours.passes[j], theirs);
        if (!difference.empty()) {
            std::fprintf(stderr, "%s: scene pass %zu (%s) differs from dump %s: %s\n", at.c_str(), j, ours.passes[j].name.c_str(), passLabel(theirs).c_str(), difference.c_str());
            return 1;
        }
        count.take(ours.passes[j]);
        ++j;
    }
    if (j != ours.passes.size()) {
        std::fprintf(stderr, "%s: scene pass %zu (%s) is not in the dump\n", at.c_str(), j, ours.passes[j].name.c_str());
        return 1;
    }
    return 0;
}

// The state the frame leaves, against the model's: every piece the clock screen steps.
int compareAfter(const EeClock& clock, const json& after, const std::string& at) {
    const scene::ClockState& s = clock.state();
    const auto ramp = [&](const scene::Ramp& r, const json& j, const char* what) {
        if (r.length == j.at("length") && r.counter == j.at("counter") && r.changed == j.at("changed") && r.state == j.at("state")) return true;
        std::fprintf(stderr, "%s: %s differs\n", at.c_str(), what);
        return false;
    };
    const auto integer = [&](int32_t v, const json& j, const char* what) {
        if (v == j.get<int32_t>()) return true;
        std::fprintf(stderr, "%s: %s %d vs %d\n", at.c_str(), what, v, j.get<int32_t>());
        return false;
    };
    bool ok = integer(s.counter, after.at("counter"), "counter") && integer(s.level, after.at("level"), "level") && integer(s.mode, after.at("mode"), "mode") &&
              integer(s.overlayLevel, after.at("overlayLevel"), "overlayLevel") && ramp(s.vignetteRamp, after.at("vignetteRamp"), "vignetteRamp") &&
              ramp(s.menuRamp, after.at("menuRamp"), "menuRamp") && ramp(s.appearance, after.at("appearance"), "appearance") &&
              ramp(clock.head().greyRamp, after.at("greyRamp"), "greyRamp") && ramp(clock.orbs().spriteFade, after.at("spriteFade"), "spriteFade") &&
              integer(s.eased.secondHand, after.at("eased").at("secondHand"), "eased.secondHand") && integer(s.eased.hourHand, after.at("eased").at("hourHand"), "eased.hourHand") &&
              sameBits(s.eased.progress, after.at("eased").at("progress"), at + " eased.progress") &&
              sameBits(s.eased.fraction, after.at("eased").at("fraction"), at + " eased.fraction") && sameBits(s.cameraOffset, after.at("cameraOffset"), at + " cameraOffset") &&
              sameBits(s.scene.scale, after.at("scene").at("scale"), at + " scene.scale") && integer(s.state.currentRod, after.at("state").at("currentRod"), "currentRod");
    for (int i = 0; ok && i < 3; ++i) ok = integer(clock.head().greys[i], after.at("greys").at(i), "greys");
    for (int k = 0; ok && k < scene::kOrbCount; ++k) {
        const scene::OrbRing& r = clock.orbs().rings[k];
        const json& j = after.at("rings").at(k);
        ok = integer(r.head, j.at("head"), "ring head") && integer(r.count, j.at("count"), "ring count") && integer(r.full, j.at("full"), "ring full");
    }
    ok = ok && sameBits(clock.rodTemplate().local, after.at("template").at("local"), at + " template.local");
    return ok ? 0 : 1;
}

bool primitivesMatch(const parity::GsPass& ours, const parity::GsPass& oracle) {
    if (!stateDifference(ours, oracle).empty()) return false;
    const size_t size = oracle.primitive == parity::GsPrimitive::Triangles ? 3 : 2;
    size_t at = 0;
    for (size_t p = 0; p < oracle.vertices.size(); p += size) {
        bool found = false;
        for (; !found && at + size <= ours.vertices.size(); at += size) {
            found = true;
            for (size_t k = 0; k < size; ++k) found = found && sameVertex(ours.vertices[at + k], oracle.vertices[p + k], ours.texture.has_value());
        }
        if (!found) return false;
    }
    return true;
}

// Frame 0 as a fixture for ParityTool: the scene's passes, the text's among them, with the oracle's results of the
// draws they match (a pass the oracle culled whole takes the results before it), and the glyph cache's image.
int writeSceneFixture(const parity::GsFrame& ours, const scene::Frame& frame, const scene::Font* font, const std::filesystem::path& f0, const std::filesystem::path& out, bool absorbText) {
    std::ifstream in(f0 / "frame.json");
    if (!in) { std::fprintf(stderr, "no frame.json in %s\n", f0.string().c_str()); return 1; }
    json fixture = json::parse(in);
    const auto absolute = [&](const json& relative) { return (f0 / relative.get<std::string>()).generic_string(); };
    for (json& t : fixture.at("targets")) t["start"] = absolute(t.at("start"));
    for (json& t : fixture.at("textures")) t["file"] = absolute(t.at("file"));
    fixture["depthStart"] = absolute(fixture.at("depthStart"));
    const json& theirs = fixture.at("passes");

    // The glyph cache as the frame's text samples it, from the font file and the cells the scene says it holds.
    std::string glyphs = "none";
    if (font) {
        std::filesystem::create_directories(out / "textures");
        glyphs = parity::glyphTextureId(frame.glyphs);
        const std::vector<uint8_t> image = scene::glyphCacheImage(*font, frame.glyphs);
        const std::filesystem::path glyphFile = out / "textures" / (glyphs + ".rgba");
        std::ofstream(glyphFile, std::ios::binary).write(reinterpret_cast<const char*>(image.data()), static_cast<std::streamsize>(image.size()));
        fixture.at("textures").push_back({{"id", glyphs}, {"width", 1 << frame.glyphs.logWidth}, {"height", 1 << frame.glyphs.logHeight}, {"file", glyphFile.generic_string()}});
    }

    json passes = json::array();
    std::map<std::string, json> lastColour;
    json lastDepth;
    size_t i = 0, j = 0, culled = 0;
    const auto matchesLater = [&](const parity::GsPass& pass) {
        for (size_t k = i; k < theirs.size(); ++k)
            if (primitivesMatch(pass, parity::readPass(theirs[k]))) return true;
        return false;
    };
    while (i < theirs.size()) {
        const json* oracle = i < theirs.size() ? &theirs[i] : nullptr;
        if (j < ours.passes.size() && oracle && primitivesMatch(ours.passes[j], dumpPass(*oracle))) {
            json p = parity::writePass(ours.passes[j]);
            p["index"] = oracle->at("index");
            p["name"] = oracle->at("name");
            p["oracle"] = {{"colour", absolute(oracle->at("oracle").at("colour"))}, {"depth", absolute(oracle->at("oracle").at("depth"))}};
            lastColour[ours.passes[j].target] = p["oracle"]["colour"];
            lastDepth = p["oracle"]["depth"];
            passes.push_back(std::move(p));
            ++i, ++j;
        } else if (absorbText && oracle && TextCount::isText(parity::readPass(*oracle))) {
            json p = *oracle;
            p["skip"] = "text from the oracle";
            p["oracle"] = {{"colour", absolute(oracle->at("oracle").at("colour"))}, {"depth", absolute(oracle->at("oracle").at("depth"))}};
            lastColour[p.at("target").get<std::string>()] = p["oracle"]["colour"];
            lastDepth = p["oracle"]["depth"];
            passes.push_back(std::move(p));
            ++i;
        } else if (j < ours.passes.size() && !matchesLater(ours.passes[j])) {
            if (!lastColour.contains(ours.passes[j].target) || lastDepth.is_null()) { std::fprintf(stderr, "scene pass %zu is culled before any oracle result of its target\n", j); return 1; }
            json p = parity::writePass(ours.passes[j]);
            p["index"] = 1000 + j;
            p["name"] = "scene-" + std::to_string(j);
            p["oracle"] = {{"colour", lastColour.at(ours.passes[j].target)}, {"depth", lastDepth}};
            passes.push_back(std::move(p));
            ++j, ++culled;
        } else {
            std::fprintf(stderr, "frame 0: oracle %s has no scene pass (scene pass %zu)\n", oracle ? oracle->at("name").get<std::string>().c_str() : "(none)", j);
            return 1;
        }
    }
    // The oracle's frame ends with its last draw: what the scene draws after it has no result to compare.
    std::string beyond;
    for (; j < ours.passes.size(); ++j) beyond += (beyond.empty() ? "" : ", ") + ours.passes[j].name;
    fixture["passes"] = std::move(passes);
    std::filesystem::create_directories(out);
    std::ofstream(out / "frame.json") << fixture.dump();
    std::printf("scene fixture: %zu scene passes (%zu culled whole by the oracle; after the oracle's last draw: %s), glyph cache %s, in %s\n",
                ours.passes.size(), culled, beyond.empty() ? "none" : beyond.c_str(), glyphs.c_str(), out.string().c_str());
    return 0;
}


}
