#include "Parity/Fixture.hpp"
#include <nlohmann/json.hpp>
#include <stb_image.h>
#include <fstream>
#include <stdexcept>

namespace parity {
namespace {

template <typename Enum>
Enum pick(const std::string& value, std::initializer_list<std::pair<const char*, Enum>> names, const char* what) {
    for (const auto& [name, e] : names) if (value == name) return e;
    throw std::runtime_error(std::string("unknown ") + what + ": " + value);
}

std::vector<uint8_t> readFile(const std::filesystem::path& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot read " + path.string());
    return std::vector<uint8_t>(std::istreambuf_iterator<char>(in), {});
}

parity::GsBlendTerm term(const std::string& v) {
    return pick<parity::GsBlendTerm>(v, {{"Source", parity::GsBlendTerm::Source}, {"Destination", parity::GsBlendTerm::Destination}, {"Zero", parity::GsBlendTerm::Zero}}, "blend term");
}

parity::GsAddress address(const nlohmann::json& j) {
    return {pick<parity::GsAddressMode>(j.at("mode"), {{"Repeat", parity::GsAddressMode::Repeat}, {"Clamp", parity::GsAddressMode::Clamp},
                {"RegionClamp", parity::GsAddressMode::RegionClamp}, {"RegionRepeat", parity::GsAddressMode::RegionRepeat}}, "address mode"),
            j.at("min"), j.at("max")};
}

DepthImage depthFromPair(const Image& pair) {
    DepthImage out{pair.width, pair.height, std::vector<uint32_t>(size_t(pair.width) * pair.height)};
    for (size_t i = 0; i < out.depth.size(); i++) {
        const uint8_t* p = &pair.rgba[i * 4];
        out.depth[i] = uint32_t(p[0]) | uint32_t(p[1]) << 8 | uint32_t(p[2]) << 16 | uint32_t(p[3]) << 24;
    }
    return out;
}

}  // namespace

Image loadPngPair(const std::filesystem::path& prefix) {
    int w = 0, h = 0, n = 0, aw = 0, ah = 0;
    const std::string colourPath = prefix.string() + ".png", alphaPath = prefix.string() + "_alpha.png";
    stbi_uc* colour = stbi_load(colourPath.c_str(), &w, &h, &n, 3);
    if (!colour) throw std::runtime_error("cannot read " + colourPath);
    stbi_uc* alpha = stbi_load(alphaPath.c_str(), &aw, &ah, &n, 1);
    if (!alpha || aw != w || ah != h) { stbi_image_free(colour); throw std::runtime_error("cannot read " + alphaPath + " at the size of its colour file"); }
    Image out{uint32_t(w), uint32_t(h), std::vector<uint8_t>(size_t(w) * h * 4)};
    for (size_t i = 0; i < size_t(w) * h; i++) {
        out.rgba[i * 4 + 0] = colour[i * 3 + 0];
        out.rgba[i * 4 + 1] = colour[i * 3 + 1];
        out.rgba[i * 4 + 2] = colour[i * 3 + 2];
        out.rgba[i * 4 + 3] = alpha[i];
    }
    stbi_image_free(colour);
    stbi_image_free(alpha);
    return out;
}

GsPass readPass(const nlohmann::json& p) {
    GsPass pass{};
    pass.index = p.at("index");
    pass.name = p.at("name");
    pass.target = p.at("target");
    pass.primitive = pick<GsPrimitive>(p.at("primitive"), {{"Triangles", GsPrimitive::Triangles}, {"Sprites", GsPrimitive::Sprites}, {"Lines", GsPrimitive::Lines}}, "primitive");
    const auto& s = p.at("scissor");
    pass.scissor = {s[0], s[1], s[2], s[3]};
    if (!p.at("blend").is_null()) {
        const auto& b = p.at("blend");
        pass.blend = GsBlend{term(b.at("a")), term(b.at("b")),
            pick<GsBlendFactor>(b.at("c"), {{"SourceAlpha", GsBlendFactor::SourceAlpha}, {"DestinationAlpha", GsBlendFactor::DestinationAlpha}, {"Fixed", GsBlendFactor::Fixed}}, "blend factor"),
            term(b.at("d")), b.at("fixed")};
    }
    pass.antialias = p.at("antialias");
    pass.depth = {pick<GsDepthTest>(p.at("depth").at("test"), {{"Never", GsDepthTest::Never}, {"Always", GsDepthTest::Always},
                      {"GreaterEqual", GsDepthTest::GreaterEqual}, {"Greater", GsDepthTest::Greater}}, "depth test"),
                  p.at("depth").at("write"), p.at("depth").value("format", "Z32") == "Z24"};
    pass.perPixelAlpha = p.value("perPixelAlpha", false);
    pass.alphaCorrection = p.value("alphaCorrection", false);
    if (!p.at("texture").is_null()) {
        const auto& t = p.at("texture");
        GsTexture texture{};
        texture.sourceIsTarget = t.at("source").contains("target");
        texture.source = t.at("source").at(texture.sourceIsTarget ? "target" : "image");
        texture.width = t.at("width");
        texture.height = t.at("height");
        texture.coordinates = pick<GsCoordinates>(t.at("coordinates"), {{"Texel", GsCoordinates::Texel}, {"Projective", GsCoordinates::Projective}}, "coordinates");
        texture.addressU = address(t.at("addressU"));
        texture.addressV = address(t.at("addressV"));
        texture.level = t.value("level", 0);
        texture.filter = pick<GsFilter>(t.at("filter"), {{"Nearest", GsFilter::Nearest}, {"Bilinear", GsFilter::Bilinear}}, "filter");
        const auto& a = t.at("alpha");
        if (a.at("mode") == "Constant") texture.alpha = {true, a.at("value"), a.at("zeroWhenBlack")};
        else if (a.at("mode") == "Texel16") texture.alpha = {false, a.at("value"), a.at("zeroWhenBlack"), true, a.at("valueHigh")};
        else if (a.at("mode") != "Texel") throw std::runtime_error("unknown texture alpha mode " + a.at("mode").dump());
        pass.texture = std::move(texture);
    }
    if (!p.at("skip").is_null()) pass.skip = p.at("skip");
    for (const auto& v : p.at("vertices")) pass.vertices.push_back({v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9]});
    return pass;
}

nlohmann::json writePass(const GsPass& pass) {
    static const char* primitives[] = {"Triangles", "Sprites", "Lines"};
    static const char* terms[] = {"Source", "Destination", "Zero"};
    static const char* factors[] = {"SourceAlpha", "DestinationAlpha", "Fixed"};
    static const char* tests[] = {"Never", "Always", "GreaterEqual", "Greater"};
    static const char* modes[] = {"Repeat", "Clamp", "RegionClamp", "RegionRepeat"};
    const auto place = [](const GsAddress& a) { return nlohmann::json{{"mode", modes[int(a.mode)]}, {"min", a.min}, {"max", a.max}}; };
    nlohmann::json j{{"index", pass.index}, {"name", pass.name}, {"target", pass.target}, {"primitive", primitives[int(pass.primitive)]},
                     {"scissor", {pass.scissor.x0, pass.scissor.y0, pass.scissor.x1, pass.scissor.y1}}, {"antialias", pass.antialias},
                     {"depth", {{"test", tests[int(pass.depth.test)]}, {"write", pass.depth.write}, {"format", pass.depth.z24 ? "Z24" : "Z32"}}},
                     {"perPixelAlpha", pass.perPixelAlpha}, {"alphaCorrection", pass.alphaCorrection}, {"blend", nullptr}, {"texture", nullptr},
                     {"skip", pass.skip.empty() ? nlohmann::json(nullptr) : nlohmann::json(pass.skip)}, {"vertices", nlohmann::json::array()}};
    if (pass.blend) j["blend"] = {{"a", terms[int(pass.blend->a)]}, {"b", terms[int(pass.blend->b)]}, {"c", factors[int(pass.blend->c)]}, {"d", terms[int(pass.blend->d)]}, {"fixed", pass.blend->fixed}};
    if (pass.texture) {
        const GsTexture& t = *pass.texture;
        j["texture"] = {{"source", {{t.sourceIsTarget ? "target" : "image", t.source}}}, {"width", t.width}, {"height", t.height},
                        {"coordinates", t.coordinates == GsCoordinates::Texel ? "Texel" : "Projective"}, {"addressU", place(t.addressU)}, {"addressV", place(t.addressV)},
                        {"filter", t.filter == GsFilter::Bilinear ? "Bilinear" : "Nearest"}, {"level", t.level},
                        {"alpha", t.alpha.sixteen ? nlohmann::json{{"mode", "Texel16"}, {"value", t.alpha.value}, {"valueHigh", t.alpha.valueHigh}, {"zeroWhenBlack", t.alpha.zeroWhenBlack}}
                                  : t.alpha.constant ? nlohmann::json{{"mode", "Constant"}, {"value", t.alpha.value}, {"zeroWhenBlack", t.alpha.zeroWhenBlack}} : nlohmann::json{{"mode", "Texel"}}}};
    }
    for (const GsVertex& v : pass.vertices) j["vertices"].push_back({v.x, v.y, v.depth, v.r, v.g, v.b, v.a, v.s, v.t, v.q});
    return j;
}

Image Fixture::oracleColour(size_t pass) const { return loadPngPair(root / oracle.at(pass).colour); }
DepthImage Fixture::oracleDepth(size_t pass) const { return depthFromPair(loadPngPair(root / oracle.at(pass).depth)); }
DepthImage Fixture::startDepth() const { return depthFromPair(loadPngPair(root / depthStart)); }

Fixture loadFixture(const std::filesystem::path& directory) {
    std::ifstream in(directory / "frame.json");
    if (!in) throw std::runtime_error("no frame.json in " + directory.string());
    const nlohmann::json j = nlohmann::json::parse(in);

    Fixture fixture;
    fixture.root = directory;
    fixture.frame.field = j.at("field");
    fixture.depthStart = j.at("depthStart");

    for (const auto& t : j.at("targets")) {
        parity::GsTarget target{t.at("id"), t.at("width"), t.at("height")};
        Image start{target.width, target.height, readFile(directory / t.at("start").get<std::string>())};
        if (start.rgba.size() != size_t(target.width) * target.height * 4) throw std::runtime_error("start buffer of " + target.id + " has the wrong size");
        fixture.targetStart.emplace(target.id, std::move(start));
        fixture.frame.targets.push_back(std::move(target));
    }
    for (const auto& t : j.at("textures")) {
        Image image{t.at("width"), t.at("height"), readFile(directory / t.at("file").get<std::string>())};
        if (image.rgba.size() != size_t(image.width) * image.height * 4) throw std::runtime_error("texture " + t.at("id").get<std::string>() + " has the wrong size");
        fixture.textures.emplace(t.at("id").get<std::string>(), std::move(image));
    }

    for (const auto& p : j.at("passes")) {
        fixture.frame.passes.push_back(readPass(p));
        fixture.oracle.push_back({p.at("oracle").at("colour"), p.at("oracle").at("depth")});
    }
    return fixture;
}

}  // namespace parity
