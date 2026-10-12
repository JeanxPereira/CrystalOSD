#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <functional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>
#include <stb_image.h>

#include "../Check.hpp"
#include "Assets/ClockTextures.hpp"
#include "Assets/ElfImage.hpp"
#include "Assets/Expand.hpp"
#include "Assets/ImageCipher.hpp"
#include "Assets/Program.hpp"
#include "Assets/Resources.hpp"
#include "Assets/Romdir.hpp"
#include "Scene/Rods.hpp"

namespace fs = std::filesystem;
using assets::Bytes;
using assets::View;

namespace {

bool equalBytes(View a, View b, const std::string& what) {
    if (a.size() == b.size() && std::memcmp(a.data(), b.data(), a.size()) == 0) return true;
    size_t at = 0;
    while (at < a.size() && at < b.size() && a[at] == b[at]) ++at;
    std::fprintf(stderr, "%s: %zu vs %zu bytes, first difference at %zu\n", what.c_str(), a.size(), b.size(), at);
    return false;
}

// One directory listing and its members' Expand output against the model's (tests/assets/model_outputs.mjs).
int compareDirectory(const nlohmann::json& want, View image, int64_t start, const fs::path& members, size_t& expanded) {
    CHECK(start == want.at("start").get<int64_t>());
    const auto entries = assets::romdirEntries(image, size_t(start));
    CHECK(entries.size() == want.at("entries").size());
    for (size_t i = 0; i < entries.size(); ++i) {
        const auto& w = want["entries"][i];
        CHECK(entries[i].name == w.at("name").get<std::string>());
        CHECK(entries[i].size == w.at("size").get<uint32_t>());
        CHECK(entries[i].offset == w.at("offset").get<uint32_t>());
        if (w.contains("error")) {
            bool threw = false;
            try {
                (void)assets::expand(image, entries[i].offset);
            } catch (const std::runtime_error&) {
                threw = true;
            }
            CHECK(threw);
            ++expanded;
            continue;
        }
        if (!w.contains("expanded")) continue;
        const assets::Expanded e = assets::expand(image, entries[i].offset);
        CHECK(e.size == w.at("expanded").get<uint32_t>());
        CHECK(e.produced == w.at("produced").get<size_t>());
        CHECK(e.consumed == w.at("consumed").get<size_t>());
        CHECK(equalBytes(e.out, assets::readFile(members / (entries[i].name + ".expanded")), entries[i].name));
        ++expanded;
    }
    return 0;
}

// (a) Expand, the HDD container decrypt and the ROMDIR reader, byte-equal to References/model/sound_data.mjs.
int ports(const fs::path& model, const fs::path& folder, const fs::path& biosPath) {
    std::ifstream in(model / "listing.json");
    const nlohmann::json listing = nlohmann::json::parse(in);
    const Bytes elf = assets::readFile(folder / assets::kProgramName);
    const assets::CipherTables tables = assets::CipherTables::fromProgram(assets::ElfImage(elf));
    char key[32];
    std::snprintf(key, sizeof key, "%llx", static_cast<unsigned long long>(tables.key));
    CHECK(listing.at("key").get<std::string>() == key);
    size_t expanded = 0, decrypted = 0;
    for (const char* name : {"TEXIMAGE", "SNDIMAGE"}) {
        const std::string tag = std::string("hdd-") + name;
        const Bytes image = assets::decryptImage(assets::readFile(folder / name), tables);
        CHECK(equalBytes(image, assets::readFile(model / (tag + ".decrypted")), tag));
        decrypted += image.size();
        CHECK(compareDirectory(listing.at(tag), image, assets::romdirStart(image), model / tag, expanded) == 0);
    }
    const Bytes bios = assets::readFile(biosPath);
    const int64_t start = assets::romdirStart(bios, 0x100000);
    size_t none = 0;
    CHECK(compareDirectory(listing.at("bios"), bios, start, model, none) == 0);
    const auto entries = assets::romdirEntries(bios, size_t(start));
    for (const char* name : {"TEXIMAGE", "SNDIMAGE", "ICOIMAGE"}) {
        const std::string tag = std::string("bios-") + name;
        const View member = assets::romdirMember(bios, entries, name);
        CHECK(equalBytes(member, assets::readFile(model / (tag + ".member")), tag));
        CHECK(compareDirectory(listing.at(tag), member, assets::romdirStart(member), model / tag, expanded) == 0);
    }
    std::printf("ports: key %s, %zu bytes decrypted, 6 directories, %zu members expanded, all equal to sound_data.mjs\n", key, decrypted, expanded);
    return 0;
}

int texturesEqualPngs(const assets::AssetSet& set, const fs::path& pngs, const std::string& what) {
    for (const auto& info : assets::kClockTextures) {
        const assets::Asset* a = set.find(info.name);
        CHECK(a != nullptr);
        CHECK(a->kind == assets::AssetKind::TextureRgba32 && a->width == info.width && a->height == info.height);
        char file[64];
        std::snprintf(file, sizeof file, "tbp-%x-%ux%u.png", info.tbp, info.width, info.height);
        int w = 0, h = 0, channels = 0;
        stbi_uc* pixels = stbi_load((pngs / file).string().c_str(), &w, &h, &channels, 4);
        CHECK(pixels != nullptr);
        const bool same = uint32_t(w) == info.width && uint32_t(h) == info.height && equalBytes(a->data, View(pixels, size_t(w) * h * 4), std::string(info.name));
        stbi_image_free(pixels);
        CHECK(same);
    }
    std::printf("textures from %s: the ten equal References/textures, pixel for pixel\n", what.c_str());
    return 0;
}

int openingEqualPngs(const assets::AssetSet& set, const fs::path& pngs, const std::string& what) {
    int differing = 0;
    for (const auto& info : assets::kOpeningTextures) {
        const assets::Asset* a = set.find(info.name);
        CHECK(a != nullptr);
        CHECK(a->kind == assets::AssetKind::TextureRgba32 && a->width == info.width && a->height == info.height);
        char file[64];
        std::snprintf(file, sizeof file, "tex%d-%ux%u.png", info.index, info.width, info.height);
        int w = 0, h = 0, channels = 0;
        stbi_uc* pixels = stbi_load((pngs / "opening" / file).string().c_str(), &w, &h, &channels, 4);
        CHECK(pixels != nullptr);
        const bool same = uint32_t(w) == info.width && uint32_t(h) == info.height && equalBytes(a->data, View(pixels, size_t(w) * h * 4), std::string(info.name));
        stbi_image_free(pixels);
        std::printf("opening index %d %s: %s\n", info.index, std::string(info.name).c_str(), same ? "equal" : "DIFFERS");
        differing += same ? 0 : 1;
    }
    CHECK(differing == 0);
    std::printf("opening textures from %s: the nine equal the GS-memory PNGs, byte for byte\n", what.c_str());
    return 0;
}

// (b) The extractor writes the BIOS's members unchanged; decoding them, and the HDD OSD folder, gives the ten
// textures of References/textures.
int textures(const fs::path& model, const fs::path& folder, const fs::path& biosPath, const fs::path& pngs, const fs::path& meshPath, const fs::path& scratch) {
    fs::remove_all(scratch);
    const fs::path extracted = scratch / "rom-0230a";
    const auto written = assets::extractBios(biosPath, extracted);
    CHECK(written.size() == 3);
    for (const char* name : {"TEXIMAGE", "SNDIMAGE", "ICOIMAGE"}) CHECK(equalBytes(assets::readFile(extracted / name), assets::readFile(model / (std::string("bios-") + name + ".member")), name));
    CHECK(assets::extractBios(biosPath, extracted).size() == 3);
    fs::create_directories(scratch / "other");
    assets::writeFile(scratch / "other" / "TEXIMAGE", Bytes{1, 2, 3});
    bool refused = false;
    try {
        assets::extractBios(biosPath, scratch / "other");
    } catch (const std::exception& e) {
        refused = true;
        std::printf("refused: %s\n", e.what());
    }
    CHECK(refused);

    const assets::AssetSet rom = assets::decodeFolder(extracted);
    CHECK(rom.find("FNTOSD") == nullptr && rom.find("RODMESH") == nullptr);
    CHECK(rom.sourceOf(*rom.find("TEXCFLOW")).name == "TEXIMAGE");
    CHECK(texturesEqualPngs(rom, pngs, "the ROM 2.30 BIOS's TEXIMAGE") == 0);
    if (fs::exists(pngs / "opening" / "tex0-256x64.png")) CHECK(openingEqualPngs(rom, pngs, "the ROM 2.30 BIOS's TEXIMAGE") == 0);

    const assets::AssetSet hdd = assets::decodeFolder(folder);
    CHECK(texturesEqualPngs(hdd, pngs, "HDD OSD 1.10U's encrypted TEXIMAGE") == 0);
    if (fs::exists(pngs / "opening" / "tex0-256x64.png")) CHECK(openingEqualPngs(hdd, pngs, "HDD OSD 1.10U's encrypted TEXIMAGE") == 0);
    CHECK(equalBytes(hdd.find("FNTOSD")->data, assets::readFile(folder / "FNTOSD"), "FNTOSD"));
    CHECK(equalBytes(hdd.find("PROGRAM")->data, assets::readFile(folder / assets::kProgramName), "hddosd.elf"));
    CHECK(hdd.sourceOf(*hdd.find("PROGRAM")).name == assets::kProgramName);

    const assets::Asset* mesh = hdd.find("RODMESH");
    CHECK(mesh != nullptr && mesh->kind == assets::AssetKind::Mesh && mesh->width == 16);
    const scene::RodMesh json = scene::loadRodMesh(meshPath);
    std::vector<float> want;
    for (const auto* list : {&json.positions, &json.normals, &json.coordinates})
        for (const scene::Vec4& v : *list) want.insert(want.end(), v.begin(), v.end());
    CHECK(equalBytes(mesh->data, View(reinterpret_cast<const uint8_t*>(want.data()), want.size() * 4), "rod mesh"));
    std::printf("rod mesh from hddosd.elf: %zu floats, equal to facts/data/rod-mesh.json\n", want.size());
    return 0;
}

// The program check: the original HDD OSD 1.10U ELF and the host copy pass; a changed byte in what is read fails, and then
// an encrypted TEXIMAGE is refused and a plain one gives the textures alone.
int program(const fs::path& folder, const fs::path& original, const fs::path& scratch) {
    fs::remove_all(scratch);
    const Bytes host = assets::readFile(folder / assets::kProgramName), first = assets::readFile(original);
    std::printf("program digest: host copy 0x%016llx, original 0x%016llx\n", static_cast<unsigned long long>(assets::programDigest(assets::ElfImage(host))),
                static_cast<unsigned long long>(assets::programDigest(assets::ElfImage(first))));
    CHECK(assets::isHddOsd110U(assets::ElfImage(host)));
    CHECK(assets::isHddOsd110U(assets::ElfImage(first)));
    const auto withProgram = [&](const fs::path& dir, const Bytes& elf, const fs::path& texImage) {
        fs::create_directories(dir);
        assets::writeFile(dir / "TEXIMAGE", assets::readFile(texImage));
        assets::writeFile(dir / assets::kProgramName, elf);
    };
    withProgram(scratch / "original", first, folder / "TEXIMAGE");
    const assets::AssetSet set = assets::decodeFolder(scratch / "original");
    CHECK(set.find("PROGRAM") && set.find("RODMESH") && set.find("TEXCMARU"));
    for (const uint32_t address : {0x0036d940u, 0x002ad970u, 0x002b4b90u, 0x002b2460u}) {
        Bytes changed = host;
        changed[address - 0x00200000 + 0x1000] ^= 0x01;
        CHECK(!assets::isHddOsd110U(assets::ElfImage(changed)));
        const fs::path bad = scratch / ("bad-" + std::to_string(address));
        withProgram(bad, changed, folder / "TEXIMAGE");
        bool refused = false;
        try {
            (void)assets::decodeFolder(bad);
        } catch (const std::runtime_error& e) {
            refused = std::string(e.what()).find("hddosd.elf is not HDD OSD 1.10U") != std::string::npos;
        }
        CHECK(refused);
    }
    std::printf("program check: the original and the host copy pass, four changed bytes fail\n");
    return 0;
}

// --- Without the console's files: synthetic inputs built here, truncated and corrupted. ---

// Literal-only Expand stream: {u32 size, then per 30 bytes a zero flag word and the bytes}.
Bytes literalStream(View raw, uint32_t size) {
    Bytes out{uint8_t(size), uint8_t(size >> 8), uint8_t(size >> 16), uint8_t(size >> 24)};
    for (size_t i = 0; i < raw.size(); ++i) {
        if (i % 30 == 0) out.insert(out.end(), 4, 0);
        out.push_back(raw[i]);
    }
    return out;
}

void put32(Bytes& b, size_t at, uint32_t v) {
    for (int i = 0; i < 4; ++i) b[at + size_t(i)] = uint8_t(v >> (8 * i));
}

// A ROMDIR image: `lead` bytes of RESET data (0, or the BIOS's boot code), the directory (RESET, ROMDIR, EXTINFO, the
// members), then each member at a multiple of 16.
Bytes romdirImage(const std::vector<std::pair<std::string, Bytes>>& members, uint32_t lead = 0) {
    const uint32_t directory = uint32_t((members.size() + 4) * 16);
    Bytes out(lead + directory, 0);
    std::vector<std::pair<std::string, uint32_t>> entries{{"RESET", lead}, {"ROMDIR", directory}, {"EXTINFO", 0}};
    for (const auto& [name, data] : members) entries.push_back({name, uint32_t(data.size())});
    for (size_t i = 0; i < entries.size(); ++i) {
        std::memcpy(out.data() + lead + 16 * i, entries[i].first.data(), entries[i].first.size());
        put32(out, lead + 16 * i + 12, entries[i].second);
    }
    for (const auto& [name, data] : members) {
        out.resize((out.size() + 15) / 16 * 16, 0);
        out.insert(out.end(), data.begin(), data.end());
    }
    return out;
}

// The ten TEXC* members, each a literal stream of the bytes its form needs (a pattern).
std::vector<std::pair<std::string, Bytes>> clockMembers(std::string_view wrongSize = {}) {
    std::vector<std::pair<std::string, Bytes>> members;
    for (const auto& info : assets::kClockTextures) {
        Bytes raw(assets::rawTextureSize(info.form, info.width, info.height));
        for (size_t i = 0; i < raw.size(); ++i) raw[i] = uint8_t(i * 7 + info.width);
        if (info.name == wrongSize) raw.push_back(0);
        members.push_back({std::string(info.name), literalStream(raw, uint32_t(raw.size()))});
    }
    for (const auto& info : assets::kOpeningTextures) {
        Bytes raw(assets::rawTextureSize(info.form, info.width, info.height));
        for (size_t i = 0; i < raw.size(); ++i) raw[i] = uint8_t(i * 5 + info.height);
        members.push_back({std::string(info.name), literalStream(raw, uint32_t(raw.size()))});
    }
    return members;
}

// A minimal EE ELF: one loadable segment of `size` bytes at `address`.
Bytes tinyElf(uint32_t address, uint32_t size) {
    Bytes elf(0x100 + size, 0);
    std::memcpy(elf.data(), "\x7f" "ELF\x01\x01\x01", 7);
    put32(elf, 24, address);
    put32(elf, 28, 52);
    elf[42] = 32;
    elf[44] = 1;
    put32(elf, 52, 1);
    put32(elf, 56, 0x100);
    put32(elf, 60, address);
    put32(elf, 68, size);
    put32(elf, 72, size);
    return elf;
}

// Runs `work` and reports a failure unless it returns or throws std::runtime_error.
template <class F>
bool survives(F&& work, size_t& threw) {
    try {
        work();
    } catch (const std::runtime_error&) {
        ++threw;
    } catch (const std::exception& e) {
        std::fprintf(stderr, "not a runtime_error: %s\n", e.what());
        return false;
    }
    return true;
}

bool throwsRuntime(const std::function<void()>& work) {
    try {
        work();
    } catch (const std::runtime_error&) {
        return true;
    }
    return false;
}

uint32_t g_seed = 12345;
uint32_t nextRandom() { return g_seed = g_seed * 1664525u + 1013904223u; }
const Bytes kText{'h', 'e', 'l', 'l', 'o'};
const Bytes kMatch{10, 0, 0, 0, 0x40, 0, 0, 0, 'a', 0xc0, 0x00, 'b', 'c', 'd'};

int robustExpand() {

    // Expand: literals, one match, a match before the output (the model throws there too), sizes out of bounds.
    const Bytes& text = kText;
    const Bytes& match = kMatch;
    CHECK(assets::expand(literalStream(text, 5)).out == text);
    CHECK((assets::expand(match).out == Bytes{'a', 'a', 'a', 'a', 'a', 'a', 'a', 'b', 'c', 'd'}));
    const Bytes before{4, 0, 0, 0, 0x80, 0, 0, 0, 0x00, 0x00};
    CHECK(throwsRuntime([&] { (void)assets::expand(before); }));
    CHECK(throwsRuntime([&] { (void)assets::expand(Bytes{0xff, 0xff, 0xff, 0x7f, 0, 0, 0, 0, 1}); }));
    CHECK(throwsRuntime([&] { (void)assets::expand(literalStream(text, 5), 0, 4); }));

    return 0;
}

int robustRomdir() {
    const Bytes& text = kText;
    const Bytes& match = kMatch;
    // ROMDIR: a tiny directory, every prefix and byte flips.
    const Bytes tiny = romdirImage({{"MEMBER", literalStream(text, 5)}});
    CHECK(assets::romdirStart(tiny) == 0);
    CHECK(assets::romdirEntries(tiny, 0).size() == 4);
    size_t threw = 0, runs = 0;
    for (size_t n = 0; n <= tiny.size(); ++n, ++runs) {
        const View prefix = View(tiny).first(n);
        CHECK(survives([&] {
            const int64_t start = assets::romdirStart(prefix);
            if (start < 0) return;
            for (const auto& e : assets::romdirEntries(prefix, size_t(start)))
                if (e.name == "MEMBER") (void)assets::expand(assets::romdirMember(prefix, assets::romdirEntries(prefix, size_t(start)), e.name));
        }, threw));
    }
    for (size_t n = 0; n <= match.size(); ++n, ++runs) CHECK(survives([&] { (void)assets::expand(View(match).first(n)); }, threw));
    for (int k = 0; k < 4000; ++k, ++runs) {
        Bytes flipped = (k & 1) ? tiny : match;
        flipped[nextRandom() % flipped.size()] ^= uint8_t(1 + nextRandom() % 255);
        CHECK(survives([&] {
            const int64_t start = assets::romdirStart(flipped);
            if (start >= 0) (void)assets::romdirEntries(flipped, size_t(start));
            (void)assets::expand(flipped);
        }, threw));
    }
    std::printf("robust: ROMDIR and Expand, %zu runs on prefixes and flips, %zu refused, none crashed\n", runs, threw);

    return 0;
}

int robustDecode(const fs::path& scratch) {
    // decodeFolder on a synthetic TEXIMAGE: the textures come out; wrong sizes, prefixes and flips are refused cleanly.
    const fs::path folder = scratch / "folder";
    const Bytes texImage = romdirImage(clockMembers());
    assets::writeFile(folder / "TEXIMAGE", texImage);
    const assets::AssetSet synthetic = assets::decodeFolder(folder);
    CHECK(synthetic.assets.size() == 19 && synthetic.find("TEXOREF")->data.size() == 128 * 128 * 4 && synthetic.find("TEXCKABE")->data.size() == 128 * 128 * 4);
    assets::writeFile(scratch / "wrong" / "TEXIMAGE", romdirImage(clockMembers("TEXCNAVI")));
    CHECK(throwsRuntime([&] { (void)assets::decodeFolder(scratch / "wrong"); }));
    // A program that is not HDD OSD 1.10U beside a plain TEXIMAGE: the textures alone.
    assets::writeFile(folder / assets::kProgramName, tinyElf(0x00200000, 0x200000));
    const assets::AssetSet foreign = assets::decodeFolder(folder);
    CHECK(foreign.find("TEXCFLOW") && !foreign.find("PROGRAM") && !foreign.find("RODMESH"));
    fs::remove(folder / assets::kProgramName);
    size_t threw = 0, runs = 0;
    const fs::path cut = scratch / "cut";
    for (size_t n = 0; n <= texImage.size(); n += (n < 2048 ? 1 : 131), ++runs) {
        assets::writeFile(cut / "TEXIMAGE", View(texImage).first(n));
        CHECK(survives([&] { (void)assets::decodeFolder(cut); }, threw));
    }
    for (int k = 0; k < 300; ++k, ++runs) {
        Bytes flipped = texImage;
        flipped[nextRandom() % 2048] ^= uint8_t(1 + nextRandom() % 255);
        assets::writeFile(cut / "TEXIMAGE", flipped);
        CHECK(survives([&] { (void)assets::decodeFolder(cut); }, threw));
    }
    std::printf("robust: decodeFolder, %zu runs on prefixes and flips, %zu refused, none crashed\n", runs, threw);

    return 0;
}

int robustExtract(const fs::path& scratch) {
    // extractBios: every target is checked before any is written.
    const Bytes bios = romdirImage({{"SNDIMAGE", Bytes(40, 1)}, {"TEXIMAGE", Bytes(24, 2)}}, 0x40);
    assets::writeFile(scratch / "bios.bin", bios);
    assets::writeFile(scratch / "target" / "TEXIMAGE", Bytes{9});
    CHECK(throwsRuntime([&] { (void)assets::extractBios(scratch / "bios.bin", scratch / "target"); }));
    CHECK(!fs::exists(scratch / "target" / "SNDIMAGE"));
    CHECK(assets::extractBios(scratch / "bios.bin", scratch / "clean").size() == 2);
    CHECK(assets::readFile(scratch / "clean" / "SNDIMAGE") == Bytes(40, 1));
    std::printf("robust: extractBios refuses before writing anything\n");
    return 0;
}

// Each part runs whatever the others give, so every failure shows.
int robust(const fs::path& scratch) {
    fs::remove_all(scratch);
    int failed = 0;
    failed += robustExpand();
    failed += robustRomdir();
    failed += robustDecode(scratch / "decode");
    failed += robustExtract(scratch / "extract");
    std::printf("robust: %d of 6 parts failed\n", failed);
    return failed == 0 ? 0 : 1;
}

}  // namespace

#if defined(_MSC_VER) && defined(_DEBUG)
#include <crtdbg.h>
#include <cstdlib>
// A debug-iterator or bounds failure ends the test with a message instead of a dialog.
void invalidParameter(const wchar_t*, const wchar_t*, const wchar_t*, unsigned, uintptr_t) {
    std::fprintf(stderr, "invalid parameter (out-of-bounds access)\n");
    std::_Exit(3);
}
const bool kQuietFailures = [] {
    _CrtSetReportMode(_CRT_ASSERT, _CRTDBG_MODE_FILE);
    _CrtSetReportFile(_CRT_ASSERT, _CRTDBG_FILE_STDERR);
    _CrtSetReportMode(_CRT_ERROR, _CRTDBG_MODE_FILE);
    _CrtSetReportFile(_CRT_ERROR, _CRTDBG_FILE_STDERR);
    _set_invalid_parameter_handler(invalidParameter);
    _set_abort_behavior(0, _WRITE_ABORT_MSG | _CALL_REPORTFAULT);
    return true;
}();
#endif

int main(int argc, char** argv) {
    try {
        const std::string mode = argc > 1 ? argv[1] : "";
        if (mode == "ports" && argc == 5) return ports(argv[2], argv[3], argv[4]);
        if (mode == "textures" && argc == 8) return textures(argv[2], argv[3], argv[4], argv[5], argv[6], argv[7]);
        if (mode == "program" && argc == 5) return program(argv[2], argv[3], argv[4]);
        if (mode == "robust" && argc == 3) return robust(argv[2]);
        std::fprintf(stderr, "usage: AssetsTest ports <model dir> <resource folder> <bios.bin>\n"
                             "       AssetsTest textures <model dir> <resource folder> <bios.bin> <png dir> <rod-mesh.json> <scratch>\n"
                             "       AssetsTest pack <resource folder> <bios.bin> <scratch>\n");
        return 1;
    } catch (const std::exception& e) {
        std::fprintf(stderr, "exception: %s\n", e.what());
        return 1;
    }
}
