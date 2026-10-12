#pragma once
#include <cstdint>
#include <vector>

namespace scene {

struct SoundCommand {
    uint16_t id = 0, a1 = 0, a2 = 0, a3 = 0;
    bool carriedA2 = false, carriedA3 = false;
    bool operator==(const SoundCommand&) const = default;
};

constexpr uint16_t kPlaceholderA3 = 0;

// Frames from the thread start (6150,1 send) to the set-up pair's send: the EE compute of module_clock_init_resources (jal 0x00225E48) before the loop,
// 31 in hddosd-110U-sound-clock-boot and hddosd-110U-sound-ee-boot.
constexpr uint32_t kClockInitFrames = 31;

// Frames from the opening's end (opening_transition_to_clock 0x0021AEE0, counter 248) to the thread start in the console's boot; the opening here ends two frames earlier
// than the console's hand-off call (hddosd-110U-sound-chain: hand-off and 6150,1 enqueue in emulator frame 375, 6140,0 start in 127).
constexpr uint32_t kThreadStartLagFrames = 2;

// module_clock_thread_proc 0x00225D30, jal 0x00225D50.
inline void clockThreadStart(std::vector<SoundCommand>& out) { out.push_back({0x6150, 1, 0, 0}); }

// func_002324C8 (jal 0x00225E48 from module_clock_init_resources): queued when the word 0x002AD22C is nonzero; the second a2 and a3 are the ring temporaries.
inline void clockSetUp(std::vector<SoundCommand>& out) {
    out.push_back({0x6150, 6, 0, 0xF});
    out.push_back({0x6140, 2, 0, 0, true, true});
}

}
