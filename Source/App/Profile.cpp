#include "App/Profile.hpp"

#include <format>

namespace app {

void Profile::add(std::string_view screen, Stage stage, double milliseconds) {
    auto it = m_screens.find(screen);
    if (it == m_screens.end()) it = m_screens.emplace(std::string(screen), std::array<Stat, 3>{}).first;
    Stat& stat = it->second[static_cast<size_t>(stage)];
    ++stat.count;
    stat.sum += milliseconds;
    if (milliseconds > stat.worst) stat.worst = milliseconds;
}

std::string Profile::table() const {
    std::string out = std::format("{:<28} {:>7} {:>20} {:>20} {:>20}\n", "screen", "frames", "produce mean/worst", "record mean/worst", "present mean/worst");
    for (const auto& [name, stats] : m_screens) {
        std::string row = std::format("{:<28} {:>7}", name.empty() ? "(none)" : name, stats[0].count);
        for (const Stat& s : stats) {
            const double mean = s.count ? s.sum / double(s.count) : 0.0;
            row += std::format(" {:>20}", std::format("{:.3f} / {:.3f} ms", mean, s.worst));
        }
        out += row + "\n";
    }
    return out;
}

}
