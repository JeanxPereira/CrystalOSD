#include "Audio/spu2/Snapshot.hpp"

#include <fstream>
#include <stdexcept>

namespace audio::spu2 {

namespace {

assets::Bytes readExisting(const std::filesystem::path& path) {
    if (!std::filesystem::exists(path)) throw std::runtime_error("missing capture file " + path.string());
    return assets::readFile(path);
}

}

Snapshot Snapshot::load(const std::filesystem::path& captures, const std::string& name, const std::string& which) {
    Snapshot s;
    const std::string stem = name + "." + which;
    s.ram = readExisting(captures / (stem + ".spuram.bin"));
    s.regs = readExisting(captures / (stem + ".spuregs.bin"));
    if (s.ram.size() != kRamBytes) throw std::runtime_error(stem + ".spuram.bin: not 2 MB");
    if (s.regs.size() != kRegBytes) throw std::runtime_error(stem + ".spuregs.bin: not 64 KB");
    const std::filesystem::path statePath = captures / (stem + ".spustate.json");
    if (!std::filesystem::exists(statePath)) throw std::runtime_error("missing capture file " + statePath.string());
    std::ifstream in(statePath);
    s.state = nlohmann::json::parse(in);
    return s;
}

}
