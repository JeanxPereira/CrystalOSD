#include "App/Golden.hpp"

#include <algorithm>
#include <bit>
#include <cinttypes>
#include <cstdio>
#include <stdexcept>
#include <type_traits>

namespace app {
namespace {

struct Hasher {
    uint64_t h = 0xcbf29ce484222325ull;
    void bytes(const void* p, size_t n) {
        const auto* b = static_cast<const uint8_t*>(p);
        for (size_t i = 0; i < n; ++i) h = (h ^ b[i]) * 0x100000001b3ull;
    }
    template <class T> void value(const T& v) {
        static_assert(std::is_trivially_copyable_v<T>);
        bytes(&v, sizeof v);
    }
};

void material(Hasher& x, const scene::Material& m) {
    x.value(m.source); x.value(m.texture); x.value(m.sourceTarget); x.value(m.colourOnly); x.value(m.coordinates);
    x.value(m.sampling); x.value(m.region); x.value(m.bilinear); x.value(m.sourceHeight); x.value(m.blend);
    x.value(m.blendConstant); x.value(m.depthTest); x.value(m.depthWrite); x.value(m.gouraud); x.value(m.perPixelAlpha);
    x.value(m.alphaCorrection);
}

std::string underscored(std::string text) {
    if (text.empty()) return "-";
    std::replace(text.begin(), text.end(), ' ', '_');
    return text;
}

}

uint64_t hashBytes(std::span<const uint8_t> bytes, uint64_t seed) {
    Hasher x;
    x.h = seed;
    x.bytes(bytes.data(), bytes.size());
    return x.h;
}

uint64_t hashFrame(const scene::Frame& f) {
    Hasher x;
    x.value(f.width); x.value(f.height); x.value(f.field); x.value(f.displayIndex); x.value(f.textAt);
    x.value(f.textureSet); x.value(f.depthBits);
    x.value(f.glyphs.address); x.value(f.glyphs.cellWidth); x.value(f.glyphs.cellHeight); x.value(f.glyphs.width);
    x.value(f.glyphs.logWidth); x.value(f.glyphs.logHeight);
    x.value(f.glyphs.cells.size()); x.bytes(f.glyphs.cells.data(), f.glyphs.cells.size() * sizeof(int32_t));
    x.value(f.passes.size());
    for (const scene::Pass& p : f.passes) {
        x.value(p.target); x.value(p.topology); material(x, p.material); x.value(p.edgeSmoothing); x.value(p.halfLine);
        x.value(p.primBlend); x.value(p.scissor.has_value());
        if (p.scissor) x.value(*p.scissor);
        x.value(p.vertices.size());
        for (const scene::Vertex& v : p.vertices) {
            x.value(std::bit_cast<uint32_t>(v.x)); x.value(std::bit_cast<uint32_t>(v.y)); x.value(v.z);
            x.value(std::bit_cast<uint32_t>(v.u)); x.value(std::bit_cast<uint32_t>(v.v)); x.value(std::bit_cast<uint32_t>(v.q));
            x.value(v.r); x.value(v.g); x.value(v.b); x.value(v.a);
        }
    }
    return x.h;
}

std::string formatLine(const GoldenLine& line) {
    char text[512];
    std::snprintf(text, sizeof text, "%06llu %s %s scene=%016llx pixels=%016llx sound=%016llx", static_cast<unsigned long long>(line.frame),
                  underscored(line.phase).c_str(), underscored(line.screen).c_str(), static_cast<unsigned long long>(line.scene),
                  static_cast<unsigned long long>(line.pixels), static_cast<unsigned long long>(line.sound));
    return text;
}

std::optional<GoldenLine> parseLine(const std::string& text) {
    char phase[128], screen[128];
    unsigned long long frame = 0, scene = 0, pixels = 0, sound = 0;
    const int read = std::sscanf(text.c_str(), "%llu %127s %127s scene=%llx pixels=%llx sound=%llx", &frame, phase, screen, &scene, &pixels, &sound);
    if (read != 6) return std::nullopt;
    return GoldenLine{frame, phase, std::string(screen) == "-" ? "" : screen, scene, pixels, sound};
}

GoldenWriter::GoldenWriter(std::filesystem::path path) {
    if (path.has_parent_path()) std::filesystem::create_directories(path.parent_path());
    m_out.open(path, std::ios::trunc);
    if (!m_out) throw std::runtime_error("golden: cannot write " + path.string());
}

void GoldenWriter::add(const GoldenLine& line) { m_out << formatLine(line) << std::endl; }

GoldenChecker::GoldenChecker(std::filesystem::path path) {
    std::ifstream in(path);
    std::string text;
    while (std::getline(in, text))
        if (const auto line = parseLine(text)) m_lines.push_back(*line);
}

bool GoldenChecker::check(const GoldenLine& line) {
    if (m_compared >= m_lines.size()) {
        m_report = "frame " + std::to_string(line.frame) + ": the golden file has only " + std::to_string(m_lines.size()) + " lines";
        return false;
    }
    const GoldenLine& want = m_lines[m_compared];
    std::string what;
    if (want.scene != line.scene) what += " scene";
    if (want.pixels != line.pixels) what += " pixels";
    if (want.sound != line.sound) what += " sound";
    if (want.frame != line.frame) what += " frame-number";
    if (!what.empty()) {
        m_report = "frame " + std::to_string(line.frame) + " (" + line.screen + "): differs in" + what + "\n  golden " + formatLine(want) + "\n  now    " + formatLine(line);
        return false;
    }
    ++m_compared;
    return true;
}

}
