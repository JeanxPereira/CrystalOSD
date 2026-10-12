#pragma once
#include <fstream>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "OpeningFixture.hpp"
#include "Scene/opening/Types.hpp"

namespace openingtest {

// The externals a capture records, as the intro's inputs: the disc schedule, the lights' phase, the play history.
inline scene::opening::BootOptions bootOptionsOf(const OpeningFixture& fixture, bool coldStart = true) {
    scene::opening::BootOptions options;
    options.coldStart = coldStart;
    const Externals& e = fixture.externals();
    if (e.discAtCounter.size() >= 2) options.disc = {static_cast<uint32_t>(e.discAtCounter[0][1]), static_cast<uint32_t>(e.discAtCounter[1][1])};
    if (e.phase) options.lightsPhase = static_cast<uint32_t>(*e.phase);
    options.history = e.history;
    options.clockForced = e.clockForced.value_or(false);
    options.hddReady = e.hddReady.value_or(0) != 0;
    options.hddExec = e.hddExec.value_or(0);
    return options;
}

// The frames of a passes.json one at a time (the file is 100 to 250 MB); null frames come back null.
class DumpFrames {
public:
    explicit DumpFrames(const std::string& path) {
        std::ifstream in(path, std::ios::binary | std::ios::ate);
        if (!in) throw std::runtime_error("no dump passes at " + path);
        m_text.resize(static_cast<size_t>(in.tellg()));
        in.seekg(0);
        in.read(m_text.data(), static_cast<std::streamsize>(m_text.size()));
        size_t at = m_text.find("\"frames\"");
        if (at == std::string::npos) throw std::runtime_error("no frames in " + path);
        at = m_text.find('[', at) + 1;
        int depth = 0;
        bool quoted = false;
        size_t start = at;
        for (; at < m_text.size(); ++at) {
            const char c = m_text[at];
            if (quoted) {
                if (c == '\\') ++at;
                else if (c == '"') quoted = false;
                continue;
            }
            if (c == '"') quoted = true;
            else if (c == '{' || c == '[') {
                if (depth == 0) start = at;
                ++depth;
            } else if (c == '}' || c == ']') {
                if (depth == 0) break;
                if (--depth == 0) m_spans.push_back({start, at + 1});
            } else if (depth == 0 && c == 'n' && m_text.compare(at, 4, "null") == 0) {
                m_spans.push_back({at, at + 4});
                at += 3;
            }
        }
    }
    size_t size() const { return m_spans.size(); }
    nlohmann::json at(size_t n) const {
        const auto [from, to] = m_spans.at(n);
        return nlohmann::json::parse(m_text.begin() + static_cast<std::ptrdiff_t>(from), m_text.begin() + static_cast<std::ptrdiff_t>(to));
    }

private:
    std::string m_text;
    std::vector<std::pair<size_t, size_t>> m_spans;
};

}
