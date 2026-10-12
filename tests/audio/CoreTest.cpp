#include <cstdio>
#include <filesystem>

#include "../Check.hpp"
#include "FixtureReader.hpp"
#include "Audio/SpuWrite.hpp"

int main(int argc, char** argv) {
    audio::WriteStream a{{1, 10, 0x1F9005A4, 0x3100}, {1, 10, 0x1F9005A6, 0}};
    audio::WriteStream b = a;
    b[0].sample = 99;
    CHECK(!audio::firstDifference(a, b));
    b[1].value = 1;
    CHECK(audio::firstDifference(a, b) == std::optional<size_t>(1));
    b = a;
    b.pop_back();
    CHECK(audio::firstDifference(a, b) == std::optional<size_t>(1));
    if (argc > 1) {
        const std::filesystem::path dir = argv[1];
        const audio::WriteStream hide = readWrites(dir / "hddosd-110U-sound-hide.writes.bin");
        CHECK(hide.size() == 40);
        const auto commands = readCommands(dir / "hddosd-110U-sound-hide.commands.bin");
        CHECK(commands.size() == 2);
        CHECK(commands[0].id == 0x6300 && commands[0].words[1] == 2 && commands[0].words[2] == 0x180);
        CHECK(commands[1].id == 0x6300 && commands[1].words[1] == 3 && commands[1].words[2] == 0x6f8);
        std::printf("core: %zu writes and %zu commands of the hide capture read\n", hide.size(), commands.size());
    }
    return 0;
}
