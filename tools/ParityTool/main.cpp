#include "Core/HeadlessContext.hpp"
#include "Parity/Compare.hpp"
#include "Parity/Fixture.hpp"
#include "Parity/FromScene.hpp"
#include "Parity/GsParityRenderer.hpp"
#include "Render/Device.hpp"
#include "Render/NativeRenderer.hpp"
#include "Scene/Clock.hpp"
#include "Scene/SceneInputs.hpp"
#include <nlohmann/json.hpp>
#include <algorithm>
#include <cstdio>
#include <fstream>
#include <map>
#include <set>
#include <stdexcept>
#include <tuple>
#include <vector>

namespace {

std::string groupOf(const parity::GsPass& pass) {
    static const char* primitives[] = {"triangles", "sprites", "lines"};
    static const char* tests[] = {"never", "always", "gequal", "greater"};
    static const char* terms[] = {"Cs", "Cd", "0"};
    static const char* factors[] = {"As", "Ad", "FIX"};
    static const char* modes[] = {"repeat", "clamp", "region-clamp", "region-repeat"};
    std::string group = primitives[int(pass.primitive)];
    if (pass.texture) {
        group += std::string(" tex(") + (pass.texture->sourceIsTarget ? "target" : "image") + "," + (pass.texture->coordinates == parity::GsCoordinates::Texel ? "texel" : "projective") + "," +
                 modes[int(pass.texture->addressU.mode)] + "," + (pass.texture->filter == parity::GsFilter::Bilinear ? "bilinear" : "nearest") + ")";
    } else {
        group += " flat";
    }
    if (pass.blend) group += std::string(" (") + terms[int(pass.blend->a)] + "-" + terms[int(pass.blend->b)] + ")*" + factors[int(pass.blend->c)] + "+" + terms[int(pass.blend->d)];
    else group += " opaque";
    if (pass.antialias) group += " aa";
    group += std::string(" z-") + tests[int(pass.depth.test)];
    return group;
}

nlohmann::json toJson(const parity::Difference& d) {
    return {{"pixels", d.pixels}, {"differing", d.differing}, {"largest", d.largest}, {"buckets", d.buckets}};
}

void writeRaw(const std::filesystem::path& path, const std::vector<uint8_t>& bytes) {
    std::ofstream out(path, std::ios::binary);
    out.write(reinterpret_cast<const char*>(bytes.data()), std::streamsize(bytes.size()));
}

// The oracle dumps the top-left w x h corner of each buffer ((0,0) to the bottom-right of the bounding box clipped to the scissor); the rest of the buffer is untouched by the draw.
parity::Image cropOf(const parity::Image& full, uint32_t w, uint32_t h) {
    if (w > full.width || h > full.height) throw std::runtime_error("the oracle rectangle does not fit the buffer");
    parity::Image out{w, h, std::vector<uint8_t>(size_t(w) * h * 4)};
    for (uint32_t y = 0; y < h; y++) std::copy_n(&full.rgba[size_t(y) * full.width * 4], size_t(w) * 4, &out.rgba[size_t(y) * w * 4]);
    return out;
}

parity::DepthImage cropOf(const parity::DepthImage& full, uint32_t w, uint32_t h) {
    if (w > full.width || h > full.height) throw std::runtime_error("the oracle rectangle does not fit the buffer");
    parity::DepthImage out{w, h, std::vector<uint32_t>(size_t(w) * h)};
    for (uint32_t y = 0; y < h; y++) std::copy_n(&full.depth[size_t(y) * full.width], w, &out.depth[size_t(y) * w]);
    return out;
}

void paste(parity::Image& full, const parity::Image& part) {
    if (part.width > full.width || part.height > full.height) throw std::runtime_error("the oracle rectangle does not fit the buffer");
    for (uint32_t y = 0; y < part.height; y++) std::copy_n(&part.rgba[size_t(y) * part.width * 4], size_t(part.width) * 4, &full.rgba[size_t(y) * full.width * 4]);
}

void paste(parity::DepthImage& full, const parity::DepthImage& part) {
    if (part.width > full.width || part.height > full.height) throw std::runtime_error("the oracle rectangle does not fit the buffer");
    for (uint32_t y = 0; y < part.height; y++) std::copy_n(&part.depth[size_t(y) * part.width], part.width, &full.depth[size_t(y) * full.width]);
}

struct Observed {
    std::string scope, target;
    uint32_t x, y, delta;
};

void observe(std::vector<Observed>& list, const std::string& scope, const std::string& target, const std::vector<parity::PixelDifference>& pixels) {
    for (const auto& p : pixels) list.push_back({scope, target, p.x, p.y, p.delta});
}

// A distance, not a gate: Clock<NativeArithmetic> frame 0 drawn by the native renderer at 640 x 224, without and
// with MSAA 4x, against the oracle's buffers at the end of the frame (the text included, which the scene does not
// draw). Every target is overwritten whole early in the frame (clear, copies), so no start buffer is needed.
// Colour and alpha are measured apart.
int nativeReport(const std::filesystem::path& fixtureDirectory, const std::filesystem::path& shaders, const std::filesystem::path& mesh, const std::filesystem::path& textures, const std::filesystem::path& out) {
    const parity::Fixture fixture = parity::loadFixture(fixtureDirectory);
    const nlohmann::json input = scene::firstInput((fixtureDirectory / ".." / "scene.json").string());
    scene::Clock<scene::NativeArithmetic> clock(scene::clockInputs(input, scene::loadRodMesh(mesh)));
    const scene::Frame frame = clock.frame(scene::frameInputs(input));
    const parity::GsFrameLayout layout = parity::clockLayout(frame.width, frame.height, frame.displayIndex);

    std::map<std::string, parity::Image> oracle = fixture.targetStart;
    for (size_t i = 0; i < fixture.frame.passes.size(); i++) paste(oracle.at(fixture.frame.passes[i].target), fixture.oracleColour(i));

    render::Device device(nullptr, {true});
    render::NativeRenderer renderer(device, shaders);
    renderer.loadClockTextures(textures);
    const std::string capture = std::filesystem::absolute(fixtureDirectory).parent_path().filename().string();
    std::printf("native frame 0 of %s: %zu passes at %dx%d (text not drawn)\n", capture.c_str(), frame.passes.size(), frame.width, frame.height);
    std::printf("%-5s %-17s %-7s %22s %22s %8s %22s %8s\n", "MSAA", "target", "id", "colour differing", "by 16 or more", "largest", "alpha differing", "largest");
    static const char* names[] = {"Display", "RefractionSource", "Work"};
    for (const uint32_t samples : {1u, 4u}) {
        renderer.configure({uint32_t(frame.width), uint32_t(frame.height), samples});
        renderer.draw(frame);
        for (size_t t = 0; t < 3; t++) {
            const std::string& id = layout.targets[t];
            const parity::Image& want = oracle.at(id);
            const parity::Image ours{want.width, want.height, renderer.readTarget(scene::TargetName(t))};
            parity::Image oursColour = ours, wantColour = want, oursAlpha = ours, wantAlpha = want;
            for (size_t i = 0; i < ours.rgba.size(); i += 4) {
                oursColour.rgba[i + 3] = wantColour.rgba[i + 3] = 0;
                for (size_t c = 0; c < 3; c++) oursAlpha.rgba[i + c] = wantAlpha.rgba[i + c] = 0;
            }
            if (!out.empty()) {
                std::filesystem::create_directories(out);
                writeRaw(out / ("native-" + id + "-msaa" + std::to_string(samples) + ".ours.rgba"), ours.rgba);
                writeRaw(out / ("native-" + id + ".oracle.rgba"), want.rgba);
            }
            const parity::Difference colour = parity::compare(oursColour, wantColour), alpha = parity::compare(oursAlpha, wantAlpha);
            const auto share = [](uint64_t n, uint64_t of) { return 100.0 * double(n) / double(of); };
            std::printf("%-5s %-17s %-7s %9llu (%7.3f%%) %9llu (%7.3f%%) %8u %9llu (%7.3f%%) %8u\n", (std::to_string(samples) + "x").c_str(), names[t], id.c_str(),
                        (unsigned long long)colour.differing, share(colour.differing, colour.pixels), (unsigned long long)colour.buckets[4], share(colour.buckets[4], colour.pixels),
                        colour.largest, (unsigned long long)alpha.differing, share(alpha.differing, alpha.pixels), alpha.largest);
        }
    }
    std::printf("validation errors: %u\n", device.validationErrors());
    return 0;
}

// A scene::Frame as the opening's assembly writes it for this report: the enums as their numbers, a vertex as
// [x, y, z, u, v, q, r, g, b, a].
scene::Frame readSceneFrame(const std::filesystem::path& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot open the scene frame " + path.string());
    const nlohmann::json j = nlohmann::json::parse(in);
    scene::Frame frame;
    frame.width = j.at("width");
    frame.height = j.at("height");
    frame.field = j.at("field");
    frame.displayIndex = j.at("displayIndex");
    frame.depthBits = j.at("depthBits");
    frame.textureSet = static_cast<scene::TextureSet>(j.at("textureSet").get<int>());
    for (const nlohmann::json& p : j.at("passes")) {
        scene::Pass pass;
        pass.name = p.at("name");
        pass.target = static_cast<scene::TargetName>(p.at("target").get<int>());
        pass.topology = static_cast<scene::PassTopology>(p.at("topology").get<int>());
        pass.edgeSmoothing = p.at("edgeSmoothing");
        pass.halfLine = p.at("halfLine");
        const nlohmann::json& m = p.at("material");
        scene::Material& material = pass.material;
        material.source = static_cast<scene::SourceKind>(m.at("source").get<int>());
        material.texture = m.at("texture");
        material.sourceTarget = static_cast<scene::TargetName>(m.at("sourceTarget").get<int>());
        material.colourOnly = m.at("colourOnly");
        material.coordinates = static_cast<scene::CoordinateKind>(m.at("coordinates").get<int>());
        material.sampling = static_cast<scene::Sampling>(m.at("sampling").get<int>());
        for (size_t k = 0; k < 4; ++k) material.region[k] = m.at("region").at(k);
        material.bilinear = m.at("bilinear");
        material.blend = static_cast<scene::BlendOp>(m.at("blend").get<int>());
        material.blendConstant = m.at("blendConstant");
        material.depthTest = static_cast<scene::DepthTest>(m.at("depthTest").get<int>());
        material.depthWrite = m.at("depthWrite");
        material.gouraud = m.at("gouraud");
        material.perPixelAlpha = m.at("perPixelAlpha");
        material.alphaCorrection = m.at("alphaCorrection");
        for (const nlohmann::json& v : p.at("vertices"))
            pass.vertices.push_back({v.at(0), v.at(1), v.at(2).get<uint32_t>(), v.at(3), v.at(4), v.at(5), v.at(6), v.at(7), v.at(8), v.at(9)});
        frame.passes.push_back(std::move(pass));
    }
    frame.textAt = frame.passes.size();
    return frame;
}

// A distance, not a gate: an opening scene frame drawn by the native renderer at 640 x 224 against the oracle's
// buffers at the end of the same frame, per target: the differing share, the share off by 16 or more, the largest
// difference. The frame starts from black targets, so a target that carries content from earlier frames (Store,
// Extra) shows that as distance. Text-free, report only.
int nativeOpeningReport(const std::filesystem::path& fixtureDirectory, const std::filesystem::path& shaders, const std::filesystem::path& textures, const std::filesystem::path& framePath,
                        const std::filesystem::path& out) {
    const parity::Fixture fixture = parity::loadFixture(fixtureDirectory);
    const scene::Frame frame = readSceneFrame(framePath);
    const parity::GsFrameLayout layout = parity::openingLayout(frame.displayIndex);
    std::map<std::string, parity::Image> oracle = fixture.targetStart;
    for (size_t i = 0; i < fixture.frame.passes.size(); i++) paste(oracle.at(fixture.frame.passes[i].target), fixture.oracleColour(i));

    render::Device device(nullptr, {true});
    render::NativeRenderer renderer(device, shaders);
    renderer.loadOpeningTextures(textures);
    const std::string capture = std::filesystem::absolute(fixtureDirectory).parent_path().filename().string();
    std::printf("native opening frame for %s: %zu passes at %dx%d\n", capture.c_str(), frame.passes.size(), frame.width, frame.height);
    std::printf("%-5s %-17s %-7s %22s %22s %8s\n", "MSAA", "target", "id", "colour differing", "by 16 or more", "largest");
    static const char* names[] = {"Display", "RefractionSource", "Work", "Store", "Extra"};
    for (const uint32_t samples : {1u, 4u}) {
        renderer.configure({uint32_t(frame.width), uint32_t(frame.height), samples});
        renderer.draw(frame);
        for (size_t t = 0; t < layout.targets.size(); t++) {
            const std::string& id = layout.targets[t];
            if (id.empty() || !oracle.contains(id)) continue;
            const parity::Image& want = oracle.at(id);
            const std::vector<uint8_t> all = renderer.readTarget(scene::TargetName(t));
            parity::Image ours{want.width, want.height, std::vector<uint8_t>(size_t(want.width) * want.height * 4)};
            for (uint32_t y = 0; y < want.height; ++y) std::copy_n(&all[size_t(y) * frame.width * 4], size_t(want.width) * 4, &ours.rgba[size_t(y) * want.width * 4]);
            parity::Image oursColour = ours, wantColour = want;
            for (size_t i = 0; i < ours.rgba.size(); i += 4) oursColour.rgba[i + 3] = wantColour.rgba[i + 3] = 0;
            if (!out.empty()) {
                std::filesystem::create_directories(out);
                writeRaw(out / ("native-opening-" + id + "-msaa" + std::to_string(samples) + ".ours.rgba"), ours.rgba);
                writeRaw(out / ("native-opening-" + id + ".oracle.rgba"), want.rgba);
            }
            const parity::Difference colour = parity::compare(oursColour, wantColour);
            const auto share = [](uint64_t n, uint64_t of) { return 100.0 * double(n) / double(of); };
            std::printf("%-5s %-17s %-7s %9llu (%7.3f%%) %9llu (%7.3f%%) %8u\n", (std::to_string(samples) + "x").c_str(), names[t], id.c_str(), (unsigned long long)colour.differing,
                        share(colour.differing, colour.pixels), (unsigned long long)colour.buckets[4], share(colour.buckets[4], colour.pixels), colour.largest);
        }
    }
    std::printf("validation errors: %u\n", device.validationErrors());
    return 0;
}

}  // namespace

int main(int argc, char** argv) {
    if ((argc == 6 || argc == 7) && std::string(argv[1]) == "--native-opening") {
        try {
            return nativeOpeningReport(argv[2], argv[3], argv[4], argv[5], argc == 7 ? argv[6] : "");
        } catch (const std::exception& error) {
            std::fprintf(stderr, "ParityTool: %s\n", error.what());
            return 1;
        }
    }
    if ((argc == 6 || argc == 7) && std::string(argv[1]) == "--native") {
        try {
            return nativeReport(argv[2], argv[3], argv[4], argv[5], argc == 7 ? argv[6] : "");
        } catch (const std::exception& error) {
            std::fprintf(stderr, "ParityTool: %s\n", error.what());
            return 1;
        }
    }
    if (argc != 4 && argc != 5) { std::fprintf(stderr, "usage: ParityTool <fixture dir> <out dir> <shader dir> [budgets.json]\n       ParityTool --native <fixture dir> <shader dir> <rod-mesh.json> <textures dir> [out dir]\n       ParityTool --native-opening <fixture dir> <shader dir> <opening textures dir> <scene frame.json> [out dir]\n"); return 1; }
    try {
        const parity::Fixture fixture = parity::loadFixture(argv[1]);
        const std::filesystem::path out = argv[2];
        std::filesystem::create_directories(out);
        HeadlessContext context(true);
        GsParityRenderer renderer(context.gpu(), argv[3]);
        for (const auto& [id, image] : fixture.textures) renderer.setTexture(id, image.width, image.height, image.rgba);

        nlohmann::json report{{"passes", nlohmann::json::array()}, {"images", nlohmann::json::array()}};
        auto keep = [&](const std::string& name, const parity::Image& ours, const parity::Image& oracle) {
            writeRaw(out / (name + ".ours.rgba"), ours.rgba);
            writeRaw(out / (name + ".oracle.rgba"), oracle.rgba);
            writeRaw(out / (name + ".difference.rgba"), parity::differenceImage(ours, oracle, 16).rgba);
            report["images"].push_back({{"name", name}, {"width", ours.width}, {"height", ours.height},
                {"ours", name + ".ours.rgba"}, {"oracle", name + ".oracle.rgba"}, {"difference", name + ".difference.rgba"}});
        };

        // Isolated: each pass starts from the oracle's buffers before it, so a difference belongs to that pass alone.
        std::map<std::string, parity::Image> state = fixture.targetStart;
        parity::DepthImage depth = fixture.startDepth();
        struct Group { uint32_t passes{0}; parity::Difference colour, depth; };
        std::map<std::string, Group> groups;
        std::vector<Observed> observed;
        size_t worst = 0;
        uint64_t worstDiffering = 0;
        for (size_t i = 0; i < fixture.frame.passes.size(); i++) {
            const parity::GsPass& pass = fixture.frame.passes[i];
            const parity::Image oracle = fixture.oracleColour(i);
            const parity::DepthImage oracleDepth = fixture.oracleDepth(i);
            nlohmann::json entry{{"index", pass.index}, {"name", pass.name}, {"group", groupOf(pass)}, {"skipped", pass.skip}};
            if (pass.skip.empty()) {
                for (const auto& [id, image] : state) renderer.setTarget(id, image.width, image.height, image.rgba);
                renderer.setDepth(depth.width, depth.height, depth.depth);
                renderer.draw(pass);
                const parity::Image& before = state.at(pass.target);
                const parity::Image ours = cropOf(parity::Image{before.width, before.height, renderer.readTarget(pass.target)}, oracle.width, oracle.height);
                const parity::DepthImage oursDepth = cropOf(parity::DepthImage{depth.width, depth.height, renderer.readDepth()}, oracleDepth.width, oracleDepth.height);
                const parity::Difference colour = parity::compare(ours, oracle), z = parity::compare(oursDepth, oracleDepth);
                entry["colour"] = toJson(colour);
                entry["depth"] = toJson(z);
                observe(observed, pass.name, pass.target, parity::differingPixels(ours, oracle));
                observe(observed, pass.name, "depth", parity::differingPixels(oursDepth, oracleDepth));
                Group& group = groups[groupOf(pass)];
                group.passes++;
                group.colour += colour;
                group.depth += z;
                if (colour.differing > worstDiffering) { worstDiffering = colour.differing; worst = i; }
            }
            report["passes"].push_back(std::move(entry));
            paste(state.at(pass.target), oracle);
            paste(depth, oracleDepth);
        }
        report["groups"] = nlohmann::json::array();
        for (const auto& [name, group] : groups) report["groups"].push_back({{"group", name}, {"passes", group.passes}, {"colour", toJson(group.colour)}, {"depth", toJson(group.depth)}});

        if (worstDiffering) {
            const parity::GsPass& pass = fixture.frame.passes[worst];
            std::map<std::string, parity::Image> before = fixture.targetStart;
            parity::DepthImage depthBefore = fixture.startDepth();
            for (size_t i = 0; i < worst; i++) { paste(before.at(fixture.frame.passes[i].target), fixture.oracleColour(i)); paste(depthBefore, fixture.oracleDepth(i)); }
            for (const auto& [id, image] : before) renderer.setTarget(id, image.width, image.height, image.rgba);
            renderer.setDepth(depthBefore.width, depthBefore.height, depthBefore.depth);
            renderer.draw(pass);
            const parity::Image oracle = fixture.oracleColour(worst);
            keep("worst-" + pass.name, cropOf(parity::Image{before.at(pass.target).width, before.at(pass.target).height, renderer.readTarget(pass.target)}, oracle.width, oracle.height), oracle);
        }

        // Chained: the whole frame from the start buffers, as the application will draw it.
        for (const auto& [id, image] : fixture.targetStart) renderer.setTarget(id, image.width, image.height, image.rgba);
        const parity::DepthImage startDepth = fixture.startDepth();
        renderer.setDepth(startDepth.width, startDepth.height, startDepth.depth);
        uint32_t skipped = 0;
        for (size_t i = 0; i < fixture.frame.passes.size(); i++) {
            const parity::GsPass& pass = fixture.frame.passes[i];
            if (pass.skip.empty()) { renderer.draw(pass); continue; }
            const parity::Image oracle = fixture.oracleColour(i);
            const parity::DepthImage oracleDepth = fixture.oracleDepth(i);
            const parity::Image& shape = fixture.targetStart.at(pass.target);
            parity::Image merged{shape.width, shape.height, renderer.readTarget(pass.target)};
            paste(merged, oracle);
            renderer.setTarget(pass.target, merged.width, merged.height, merged.rgba);
            parity::DepthImage mergedDepth{startDepth.width, startDepth.height, renderer.readDepth()};
            paste(mergedDepth, oracleDepth);
            renderer.setDepth(mergedDepth.width, mergedDepth.height, mergedDepth.depth);
            skipped++;
        }
        report["chained"] = nlohmann::json::array();
        for (const auto& [id, oracle] : state) {
            const parity::Image ours{oracle.width, oracle.height, renderer.readTarget(id)};
            report["chained"].push_back({{"target", id}, {"colour", toJson(parity::compare(ours, oracle))}});
            observe(observed, "chained", id, parity::differingPixels(ours, oracle));
            keep("chained-" + id, ours, oracle);
        }
        const parity::DepthImage chainedDepth{depth.width, depth.height, renderer.readDepth()};
        report["chainedDepth"] = toJson(parity::compare(chainedDepth, depth));
        observe(observed, "chained", "depth", parity::differingPixels(chainedDepth, depth));
        {
            std::ifstream frameFile(std::filesystem::path(argv[1]) / "frame.json");
            const nlohmann::json frameJson = nlohmann::json::parse(frameFile);
            report["capture"] = frameJson.at("capture");
            report["frame"] = frameJson.at("frame");
        }
        report["skipped"] = skipped;
        report["validationErrors"] = context.validationErrors();

        std::ofstream(out / "report.json") << report.dump(1);
        std::printf("%-78s %6s %9s %9s %5s %9s\n", "group", "passes", "pixels", "differ", "max", "depth");
        for (const auto& [name, group] : groups) {
            std::printf("%-78s %6u %9llu %9llu %5u %9llu\n", name.c_str(), group.passes, (unsigned long long)group.colour.pixels,
                        (unsigned long long)group.colour.differing, group.colour.largest, (unsigned long long)group.depth.differing);
        }
        for (const auto& chained : report["chained"]) {
            std::printf("chained %s: %llu of %llu pixels differ, largest %u\n", chained["target"].get<std::string>().c_str(),
                        chained["colour"]["differing"].get<unsigned long long>(), chained["colour"]["pixels"].get<unsigned long long>(), chained["colour"]["largest"].get<unsigned>());
        }
        std::printf("skipped passes taken from the oracle: %u; validation errors: %u\n", skipped, context.validationErrors());

        nlohmann::json observedJson = nlohmann::json::array();
        for (const auto& o : observed) observedJson.push_back({{"scope", o.scope}, {"target", o.target}, {"x", o.x}, {"y", o.y}, {"delta", o.delta}});
        std::ofstream(out / "observed.json") << nlohmann::json{{"differences", observedJson}}.dump(1);

        if (argc == 5) {
            std::ifstream in(argv[4]);
            if (!in) throw std::runtime_error(std::string("no budget at ") + argv[4]);
            const nlohmann::json budget = nlohmann::json::parse(in);
            std::map<std::tuple<std::string, std::string, uint32_t, uint32_t>, uint32_t> allowed;
            for (const auto& e : budget.at("differences")) {
                const auto key = std::make_tuple(e.at("scope").get<std::string>(), e.at("target").get<std::string>(), e.at("x").get<uint32_t>(), e.at("y").get<uint32_t>());
                if (!allowed.emplace(key, e.at("delta").get<uint32_t>()).second) throw std::runtime_error("duplicate budget entry");
            }
            uint32_t breaches = 0;
            for (const auto& o : observed) {
                const auto found = allowed.find({o.scope, o.target, o.x, o.y});
                if (found == allowed.end()) {
                    std::printf("unexpected difference: %s %s (%u,%u) delta %u\n", o.scope.c_str(), o.target.c_str(), o.x, o.y, o.delta);
                    breaches++;
                } else if (o.delta > found->second) {
                    std::printf("larger difference: %s %s (%u,%u) delta %u, budget %u\n", o.scope.c_str(), o.target.c_str(), o.x, o.y, o.delta, found->second);
                    breaches++;
                } else if (o.delta < found->second) {
                    std::printf("tighten: %s %s (%u,%u) delta %u, budget %u\n", o.scope.c_str(), o.target.c_str(), o.x, o.y, o.delta, found->second);
                    breaches++;
                }
            }
            std::set<std::tuple<std::string, std::string, uint32_t, uint32_t>> seen;
            for (const auto& o : observed) seen.insert({o.scope, o.target, o.x, o.y});
            for (const auto& entry : allowed) {
                const auto& key = entry.first;
                if (seen.count(key)) continue;
                std::printf("stale budget entry: %s %s (%u,%u)\n", std::get<0>(key).c_str(), std::get<1>(key).c_str(), std::get<2>(key), std::get<3>(key));
                breaches++;
            }
            if (context.validationErrors()) { std::printf("validation errors: %u\n", context.validationErrors()); breaches++; }
            std::printf("budget: %zu differing pixels observed, %zu budgeted, %u breaches\n", observed.size(), allowed.size(), breaches);
            if (breaches) return 1;
        }
        return 0;
    } catch (const std::exception& error) {
        std::fprintf(stderr, "ParityTool: %s\n", error.what());
        return 1;
    }
}
