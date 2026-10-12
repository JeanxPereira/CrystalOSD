#include "Audio/driver/SnapshotBuilder.hpp"

#include <algorithm>
#include <stdexcept>
#include <string>
#include <vector>

#include "Assets/ElfImage.hpp"
#include "Assets/Program.hpp"
#include "Assets/Resources.hpp"

namespace audio::driver {

namespace {

constexpr uint16_t kIopRelocatable = 0xff80;
constexpr uint32_t kElfMagic = 0x464c457f;
constexpr uint32_t kProgramLoad = 1;
constexpr uint32_t kProgramIopMod = 0x70000080;
constexpr uint32_t kSectionRel = 9;
constexpr uint32_t kImportMagic = 0x41e00000;
constexpr uint32_t kExportMagic = 0x41c00000;
constexpr uint32_t kJumpReturn = 0x03e00008;
constexpr uint32_t kRelocWord = 2, kRelocJump = 4, kRelocHigh = 5, kRelocLow = 6;

constexpr std::string_view kOsdsndName = "sdr_driver";
constexpr std::string_view kLibsdName = "Sound_Device_Library";
constexpr uint32_t kOsdsndFile = 37360, kOsdsndMemory = 42304, kLibsdFile = 18528, kLibsdMemory = 18584;

struct Relocation {
    uint32_t offset;
    uint32_t type;
};

struct Irx {
    std::string name;
    assets::Bytes image;
    uint32_t memory = 0;
    std::vector<Relocation> relocations;
};

void put32(assets::Bytes& b, size_t at, uint32_t v) {
    for (size_t k = 0; k < 4; ++k) b[at + k] = uint8_t(v >> (8 * k));
}

Irx parseIrx(assets::View elf, size_t at) {
    const assets::View f = elf.subspan(at);
    const uint32_t phoff = assets::le32(f, 28), shoff = assets::le32(f, 32);
    const uint32_t phentsize = assets::le16(f, 42), phnum = assets::le16(f, 44), shentsize = assets::le16(f, 46), shnum = assets::le16(f, 48);
    Irx irx;
    bool loaded = false, named = false;
    for (uint32_t i = 0; i < phnum; ++i) {
        const size_t p = phoff + size_t(i) * phentsize;
        const uint32_t type = assets::le32(f, p), offset = assets::le32(f, p + 4);
        if (type == kProgramLoad && !loaded) {
            const uint32_t filesz = assets::le32(f, p + 16);
            if (size_t(offset) + filesz > f.size()) throw std::runtime_error("IRX segment past the end");
            irx.image.assign(f.begin() + offset, f.begin() + offset + filesz);
            irx.memory = assets::le32(f, p + 20);
            loaded = true;
        } else if (type == kProgramIopMod && !named) {
            if (size_t(offset) + 50 > f.size()) throw std::runtime_error("IRX module header past the end");
            for (size_t k = 0; k < 24 && f[offset + 26 + k] != 0; ++k) irx.name.push_back(char(f[offset + 26 + k]));
            named = true;
        }
    }
    if (!loaded || !named) throw std::runtime_error("not an IRX");
    for (uint32_t i = 0; i < shnum; ++i) {
        const size_t s = shoff + size_t(i) * shentsize;
        if (assets::le32(f, s + 4) != kSectionRel) continue;
        const uint32_t offset = assets::le32(f, s + 16), size = assets::le32(f, s + 20);
        for (uint32_t e = 0; e + 8 <= size; e += 8)
            irx.relocations.push_back({assets::le32(f, offset + e), assets::le32(f, offset + e + 4) & 0xff});
    }
    return irx;
}

std::vector<Irx> findModules(assets::View elf) {
    std::vector<Irx> found;
    for (size_t at = 0; at + 64 <= elf.size(); ++at) {
        if (assets::le32(elf, at) != kElfMagic || assets::le16(elf, at + 16) != kIopRelocatable) continue;
        try {
            found.push_back(parseIrx(elf, at));
        } catch (const std::runtime_error&) {
        }
    }
    return found;
}

assets::Bytes relocate(const Irx& irx, uint32_t base) {
    assets::Bytes img = irx.image;
    std::vector<size_t> high;
    for (const Relocation& r : irx.relocations) {
        const size_t a = r.offset;
        if (a + 4 > img.size()) continue;
        const uint32_t w = assets::le32(img, a);
        if (r.type == kRelocWord) {
            put32(img, a, w + base);
        } else if (r.type == kRelocJump) {
            put32(img, a, (w & 0xfc000000u) | (((((w & 0x3ffffffu) << 2) + base) >> 2) & 0x3ffffffu));
        } else if (r.type == kRelocHigh) {
            high.push_back(a);
        } else if (r.type == kRelocLow) {
            const int32_t low = int32_t(int16_t(w & 0xffff));
            const uint32_t lo = uint32_t(low + int32_t(base)) & 0xffff;
            for (const size_t h : high) {
                const uint32_t hw = assets::le32(img, h);
                const uint32_t n = ((hw & 0xffff) << 16) + uint32_t(low) + base;
                put32(img, h, (hw & 0xffff0000u) | (((n + 0x8000) >> 16) & 0xffff));
            }
            high.clear();
            put32(img, a, (w & 0xffff0000u) | lo);
        }
    }
    return img;
}

std::string tableName(assets::View img, size_t at) {
    std::string name;
    for (size_t k = 0; k < 8 && at + 12 + k < img.size() && img[at + 12 + k] != 0; ++k) name.push_back(char(img[at + 12 + k]));
    return name;
}

void resolveImports(assets::Bytes& client, const assets::Bytes& provider, std::string_view library) {
    std::vector<uint32_t> exports;
    for (size_t at = 0; at + 20 <= provider.size(); at += 4) {
        if (assets::le32(provider, at) != kExportMagic || tableName(provider, at) != library) continue;
        for (size_t p = at + 20; p + 4 <= provider.size() && assets::le32(provider, p) != 0; p += 4) exports.push_back(assets::le32(provider, p));
        break;
    }
    if (exports.empty()) throw std::runtime_error("the sound library exports nothing");
    for (size_t at = 0; at + 20 <= client.size(); at += 4) {
        if (assets::le32(client, at) != kImportMagic || tableName(client, at) != library) continue;
        for (size_t p = at + 20; p + 8 <= client.size() && assets::le32(client, p) == kJumpReturn; p += 8) {
            const uint32_t index = assets::le32(client, p + 4) & 0xffff;
            if (index >= exports.size()) throw std::runtime_error("an import is past the export table");
            put32(client, p, 0x08000000u | ((exports[index] >> 2) & 0x3ffffffu));
        }
    }
}

const Irx& pick(const std::vector<Irx>& modules, std::string_view name, uint32_t file, uint32_t memory) {
    const Irx* found = nullptr;
    for (const Irx& m : modules) {
        if (m.name != name) continue;
        if (found) throw std::runtime_error("two sound modules named " + std::string(name));
        found = &m;
    }
    if (!found) throw std::runtime_error("the program holds no " + std::string(name) + " module");
    if (found->image.size() != file || found->memory != memory) throw std::runtime_error(std::string(name) + " is not HDD OSD 1.10U's module");
    return *found;
}

void load(assets::Bytes& ram, int64_t at, assets::View data) {
    if (at < 0 || size_t(at) + data.size() > ram.size()) throw std::runtime_error("sound image outside IOP RAM");
    std::copy(data.begin(), data.end(), ram.begin() + at);
}

size_t round16(size_t v) { return (v + 15) & ~size_t(15); }

}

SoundImages buildSoundImages(assets::View program, const data::SndImage& sound) {
    if (!assets::isHddOsd110U(assets::ElfImage(program))) throw std::runtime_error("the sound driver is read from HDD OSD 1.10U's program");
    const std::vector<Irx> modules = findModules(program);
    const Irx& osdsnd = pick(modules, kOsdsndName, kOsdsndFile, kOsdsndMemory);
    const Irx& libsd = pick(modules, kLibsdName, kLibsdFile, kLibsdMemory);

    const assets::Bytes libsdImage = relocate(libsd, uint32_t(kLibsdModuleBase));
    assets::Bytes osdsndImage = relocate(osdsnd, uint32_t(kOsdsndBase));
    resolveImports(osdsndImage, libsdImage, "libsd");

    assets::Bytes ram(IopMemory::kSize, 0);
    load(ram, kLibsdModuleBase, libsdImage);
    load(ram, kOsdsndBase, osdsndImage);

    assets::Bytes area;
    size_t bodyStart = 0;
    for (std::string_view name : data::kSoundMembers) {
        const assets::Bytes& member = sound.member(name);
        const size_t start = round16(area.size());
        area.resize(start + member.size(), 0);
        std::copy(member.begin(), member.end(), area.begin() + std::ptrdiff_t(start));
        if (name == "SNDOSDDB") bodyStart = start;
    }
    const size_t window = size_t(kSoundIopBase + int64_t(kSoundIopSize) - kStagingBase);
    load(ram, kStagingBase, assets::View(area).subspan(bodyStart, std::min(area.size() - bodyStart, window)));
    for (const StagedMember& m : kStagedMembers) {
        assets::Bytes padded = sound.member(m.name);
        padded.resize(round16(padded.size()), 0);
        load(ram, m.address, padded);
    }

    SoundImages out;
    out.snapshot.osdsnd.assign(ram.begin() + kOsdsndBase, ram.begin() + kOsdsndBase + int64_t(kOsdsndSize));
    out.snapshot.iop.assign(ram.begin() + kSoundIopBase, ram.begin() + kSoundIopBase + int64_t(kSoundIopSize));
    out.libsd.assign(ram.begin() + kLibsdBase, ram.begin() + kLibsdBase + int64_t(kLibsdImageSize));
    out.spuRam = sound.spuRam();
    return out;
}

SoundImages buildSoundImages(const std::filesystem::path& resources) {
    const assets::Bytes program = assets::readFile(resources / assets::kProgramName);
    return buildSoundImages(program, data::SndImage::fromFolder(resources));
}

}
