#pragma once
#include <array>
#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

#include "Assets/Bytes.hpp"

namespace assets {

// The resource files do_load_resources reads (facts/hddosd-boot.md), by the names the OSD gives them, and the program.
inline constexpr std::array<std::string_view, 6> kResourceNames{"FNTOSD", "JISUCS", "SNDIMAGE", "TEXIMAGE", "ICOIMAGE", "SKBIMAGE"};
inline constexpr std::string_view kProgramName = "hddosd.elf";

enum class AssetKind : uint32_t { TextureRgba32 = 1, TextureIndexed = 2, Font = 3, Program = 4, Mesh = 5, SoundContainer = 6 };

struct SourceFile {
    std::string name;
    std::string path;
    uint64_t size = 0, hash = 0;
    bool operator==(const SourceFile&) const = default;
};

// Mesh data: the rod's 64 positions, 16 normals and 64 texture coordinates, four floats each; width = faces.
struct Asset {
    std::string name;
    AssetKind kind = AssetKind::TextureRgba32;
    uint32_t width = 0, height = 0;
    uint32_t source = 0;
    Bytes data;
    bool operator==(const Asset&) const = default;
};

struct AssetSet {
    std::vector<SourceFile> sources;
    std::vector<Asset> assets;
    const Asset* find(std::string_view name) const;
    const SourceFile& sourceOf(const Asset& asset) const { return sources.at(asset.source); }
    bool operator==(const AssetSet&) const = default;
};

// The files of `folder` the decode reads (TEXIMAGE, FNTOSD, hddosd.elf, those present), hashed.
std::vector<SourceFile> folderSources(const std::filesystem::path& folder);
// The clock's assets from a folder of raw resource files: TEXIMAGE plain (a ROM's) or encrypted (an installed HDD
// OSD's, decrypted with the tables of the hddosd.elf beside it); FNTOSD and hddosd.elf as they are; the rod mesh
// from hddosd.elf.
AssetSet decodeFolder(const std::filesystem::path& folder);
// Writes the BIOS ROM's members that bear a resource name, bytes unchanged, into `folder`; a file already there
// with other bytes is refused. Returns the names written or found equal.
std::vector<std::string> extractBios(const std::filesystem::path& rom, const std::filesystem::path& folder);
// %LOCALAPPDATA%/CrystalOSD (or $XDG_CACHE_HOME, ~/.cache), else ./cache: where settings.json lives.
std::filesystem::path userDataDirectory();

}
