#include "Audio/data/SndImage.hpp"

#include <cstring>
#include <stdexcept>

#include "Assets/ElfImage.hpp"
#include "Assets/Expand.hpp"
#include "Assets/ImageCipher.hpp"
#include "Assets/Resources.hpp"
#include "Assets/Romdir.hpp"

namespace audio::data {

SndImage SndImage::fromContainer(assets::View container) {
    const int64_t start = assets::romdirStart(container);
    if (start < 0) throw std::runtime_error("SNDIMAGE holds no ROMDIR");
    const auto entries = assets::romdirEntries(container, size_t(start));
    SndImage image;
    for (std::string_view name : kSoundMembers) {
        assets::Expanded raw = assets::expand(assets::romdirMember(container, entries, std::string(name)));
        raw.out.resize(raw.size);
        image.m_members.emplace(std::string(name), std::move(raw.out));
    }
    return image;
}

SndImage SndImage::fromFolder(const std::filesystem::path& folder) {
    assets::Bytes container = assets::readFile(folder / "SNDIMAGE");
    if (assets::romdirStart(container) < 0) {
        const assets::Bytes program = assets::readFile(folder / assets::kProgramName);
        container = assets::decryptImage(container, assets::CipherTables::fromProgram(assets::ElfImage(program)));
    }
    return fromContainer(container);
}

const assets::Bytes& SndImage::member(std::string_view name) const {
    const auto it = m_members.find(name);
    if (it == m_members.end()) throw std::runtime_error("no sound member " + std::string(name));
    return it->second;
}

assets::Bytes SndImage::spuRam() const {
    assets::Bytes ram(kSpuRamSize, 0);
    const assets::Bytes& boot = member("SNDBOOTB");
    const assets::Bytes& osdd = member("SNDOSDDB");
    if (kBootBodyAt + boot.size() > kSpuRamSize || kOsddBodyAt + osdd.size() > kSpuRamSize) throw std::runtime_error("a sound body does not fit the SPU2 RAM");
    std::memcpy(ram.data() + kBootBodyAt, boot.data(), boot.size());
    std::memcpy(ram.data() + kOsddBodyAt, osdd.data(), osdd.size());
    return ram;
}

}
