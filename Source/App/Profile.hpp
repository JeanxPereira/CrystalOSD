#pragma once
#include <array>
#include <map>
#include <string>
#include <string_view>

namespace app {

enum class Stage { Produce, Record, Present };

class Profile {
public:
    void add(std::string_view screen, Stage stage, double milliseconds);
    std::string table() const;

private:
    struct Stat {
        unsigned long long count = 0;
        double sum = 0;
        double worst = 0;
    };
    std::map<std::string, std::array<Stat, 3>, std::less<>> m_screens;
};

}
