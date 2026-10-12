#include "Assets/Resources.hpp"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <optional>
#include <utility>

#include "Assets/ClockTextures.hpp"
#include "Assets/ElfImage.hpp"
#include "Assets/Expand.hpp"
#include "Assets/ImageCipher.hpp"
#include "Assets/Program.hpp"
#include "Assets/Romdir.hpp"

namespace fs = std::filesystem;

namespace assets {

namespace {

// The files the decode reads, in this order.
constexpr std::array<std::string_view, 4> kDecoded{"TEXIMAGE", "FNTOSD", kProgramName, "SNDIMAGE"};

// The rod mesh in HDD OSD 1.10U's data (facts/data/rod-mesh.json): 64 positions, 16 normals, 64 texture coordinates.
constexpr uint32_t kFaces = 16, kPositions = 0x002b4b90, kNormals = 0x002b5390, kCoordinates = 0x002b4f90;

// The menus' cube mesh in the same data: 6 faces.
constexpr uint32_t kCubeFaces = 6, kCubePositions = 0x002b5790, kCubeNormals = 0x002b5910, kCubeCoordinates = 0x002b5970;

struct ReadFile {
    SourceFile source;
    Bytes data;
};

std::vector<ReadFile> readSources(const fs::path& folder) {
    std::vector<ReadFile> files;
    std::error_code error;
    for (std::string_view name : kDecoded) {
        const fs::path path = folder / name;
        if (!fs::is_regular_file(path, error)) continue;
        Bytes data = readFile(path);
        SourceFile source{std::string(name), fs::absolute(path).generic_string(), data.size(), hashOf(data)};
        files.push_back({std::move(source), std::move(data)});
    }
    return files;
}

}  // namespace

const Asset* AssetSet::find(std::string_view name) const {
    for (const Asset& a : assets)
        if (a.name == name) return &a;
    return nullptr;
}

std::vector<SourceFile> folderSources(const fs::path& folder) {
    std::vector<SourceFile> sources;
    for (ReadFile& f : readSources(folder)) sources.push_back(std::move(f.source));
    return sources;
}

AssetSet decodeFolder(const fs::path& folder) {
    const std::vector<ReadFile> files = readSources(folder);
    AssetSet set;
    const auto index = [&](std::string_view name) -> std::optional<uint32_t> {
        for (uint32_t i = 0; i < files.size(); ++i)
            if (files[i].source.name == name) return i;
        return std::nullopt;
    };
    for (const ReadFile& f : files) set.sources.push_back(f.source);
    const auto texImage = index("TEXIMAGE");
    if (!texImage) throw std::runtime_error("no TEXIMAGE in " + folder.string());
    // Only HDD OSD 1.10U's program holds the tables, the mesh and the text data at the addresses read here.
    std::optional<uint32_t> program = index(kProgramName);
    std::optional<ElfImage> elf;
    std::string refused;
    if (program) {
        try {
            elf.emplace(files[*program].data);
        } catch (const std::runtime_error&) {
        }
        if (!elf || !isHddOsd110U(*elf)) {
            refused = "hddosd.elf is not HDD OSD 1.10U";
            std::fprintf(stderr, "assets: %s: its mesh and text are not read\n", refused.c_str());
            elf.reset();
            program.reset();
        }
    }

    // A ROM's TEXIMAGE is a plain ROMDIR archive; an installed HDD OSD's is encrypted (facts/hddosd-boot.md).
    Bytes container = files[*texImage].data;
    if (romdirStart(container) < 0) {
        if (!elf) throw std::runtime_error(refused.empty() ? "TEXIMAGE is encrypted: its hddosd.elf is needed beside it" : refused + ": the encrypted TEXIMAGE cannot be read");
        container = decryptImage(container, CipherTables::fromProgram(*elf));
        if (romdirStart(container) < 0) throw std::runtime_error("TEXIMAGE holds no directory, plain or decrypted with the tables of hddosd.elf");
    }
    const auto entries = romdirEntries(container, size_t(romdirStart(container)));
    for (const ClockTextureInfo& info : kClockTextures) {
        const size_t need = rawTextureSize(info.form, info.width, info.height);
        const Expanded raw = expand(romdirMember(container, entries, std::string(info.name)), 0, need);
        if (raw.size != need) throw std::runtime_error(std::string(info.name) + ": " + std::to_string(raw.size) + " bytes, its form needs " + std::to_string(need));
        set.assets.push_back({std::string(info.name), AssetKind::TextureRgba32, info.width, info.height, *texImage, convertTexture(raw.out, info.width, info.height, info.form)});
    }
    for (const OpeningTextureInfo& info : kOpeningTextures) {
        const size_t need = rawTextureSize(info.form, info.width, info.height);
        const Expanded raw = expand(romdirMember(container, entries, std::string(info.name)), 0, need);
        if (raw.size != need) throw std::runtime_error(std::string(info.name) + ": " + std::to_string(raw.size) + " bytes, its form needs " + std::to_string(need));
        set.assets.push_back({std::string(info.name), AssetKind::TextureRgba32, info.width, info.height, *texImage, convertTexture(raw.out, info.width, info.height, info.form)});
    }
    if (const auto font = index("FNTOSD")) set.assets.push_back({"FNTOSD", AssetKind::Font, 0, 0, *font, files[*font].data});
    if (program) {
        set.assets.push_back({"PROGRAM", AssetKind::Program, 0, 0, *program, files[*program].data});
        const auto meshOf = [&](uint32_t faces, uint32_t positions, uint32_t normals, uint32_t coordinates) {
            Bytes mesh;
            for (const auto& [address, count] : {std::pair{positions, faces * 4}, std::pair{normals, faces}, std::pair{coordinates, faces * 4}}) {
                const View v = elf->bytes(address, count * 16);
                mesh.insert(mesh.end(), v.begin(), v.end());
            }
            return mesh;
        };
        set.assets.push_back({"RODMESH", AssetKind::Mesh, kFaces, 0, *program, meshOf(kFaces, kPositions, kNormals, kCoordinates)});
        set.assets.push_back({"CUBEMESH", AssetKind::Mesh, kCubeFaces, 0, *program, meshOf(kCubeFaces, kCubePositions, kCubeNormals, kCubeCoordinates)});
    }
    if (const auto sound = index("SNDIMAGE")) {
        Bytes sounds = files[*sound].data;
        bool readable = romdirStart(sounds) >= 0;
        if (!readable && elf) {
            sounds = decryptImage(sounds, CipherTables::fromProgram(*elf));
            readable = romdirStart(sounds) >= 0;
        }
        if (readable) set.assets.push_back({"SNDIMAGE", AssetKind::SoundContainer, 0, 0, *sound, std::move(sounds)});
        else std::fprintf(stderr, "assets: SNDIMAGE holds no directory, plain or decrypted: the sound is not read\n");
    }
    return set;
}

std::vector<std::string> extractBios(const fs::path& rom, const fs::path& folder) {
    const Bytes image = readFile(rom);
    const int64_t start = romdirStart(image, 0x100000);
    if (start < 0) throw std::runtime_error(rom.string() + " is not a BIOS ROM image: no ROMDIR");
    const auto entries = romdirEntries(image, size_t(start));
    // Every target is checked before any is written: a refusal leaves the folder as it was.
    std::vector<std::pair<std::string, View>> members;
    std::vector<std::string> names;
    for (std::string_view name : kResourceNames) {
        if (!romdirFind(entries, std::string(name))) continue;
        const View member = romdirMember(image, entries, std::string(name));
        const fs::path path = folder / name;
        if (fs::exists(path)) {
            const Bytes there = readFile(path);
            if (there.size() != member.size() || !std::equal(member.begin(), member.end(), there.begin()))
                throw std::runtime_error(path.string() + " exists with other bytes: nothing extracted");
        } else {
            members.push_back({std::string(name), member});
        }
        names.emplace_back(name);
    }
    if (names.empty()) throw std::runtime_error(rom.string() + " holds none of the OSD's resource files");
    for (const auto& [name, member] : members) writeFile(folder / name, member);
    return names;
}

fs::path userDataDirectory() {
    const auto variable = [](const char* name) -> fs::path {
#ifdef _WIN32
        char* value = nullptr;
        size_t length = 0;
        if (_dupenv_s(&value, &length, name) != 0 || !value) return {};
        fs::path path = value;
        std::free(value);
        return path;
#else
        const char* value = std::getenv(name);
        return value ? fs::path(value) : fs::path();
#endif
    };
    if (fs::path base = variable("LOCALAPPDATA"); !base.empty()) return base / "CrystalOSD";
    if (fs::path base = variable("XDG_CACHE_HOME"); !base.empty()) return base / "CrystalOSD";
    if (fs::path base = variable("HOME"); !base.empty()) return base / ".cache" / "CrystalOSD";
    return fs::current_path() / "cache";
}

}
