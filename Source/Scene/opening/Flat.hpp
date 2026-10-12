#pragma once
#include <cstdint>
#include <vector>

#include "Scene/Arithmetic.hpp"
#include "Scene/Frame.hpp"

namespace scene::opening {

// The arguments of one module frame's flat draws: the page drawn follows the counter's parity (func_0021CF38: odd is page 0;
// `displayIndex` is carried for the caller), `field` the video field, `fadeAlpha` the argument func_0021D848 receives (it caps it at
// 0x80), `blurLevel` func_0021D3D0's trip count.
struct FlatInputs {
    int32_t counter = 0, displayIndex = 0, field = 0;
    int32_t logoAlpha = 0, fadeAlpha = 0, blurLevel = 0;
    int32_t fillSprites = 2;
};

// facts/opening.md 4.4, 4.5; verify_opening_flat.mjs, verify_opening_ghost.mjs, verify_opening_overlays_v2.mjs. NTSC 640 x 224.
// A call adds the passes of its packets that draw: the `Framebuffer` clear sprites land outside the scissor and are not here.
// OpeningProcess's SCISSOR_1 write (vif1SetSCISSOR_1 with 1, 1, W - 2, H - 2): the towers and the ghost are drawn under it.
constexpr std::array<int32_t, 4> kProcessScissor{1, 1, 638, 222};

template <class A>
struct Flat {
    // The fill at the frame's start (OpeningProcess).
    static void scissor(const FlatInputs&, std::vector<Pass>&);
    static void scissor(std::vector<Pass>&);
    // func_0021D140(1, 2, 0x50, 0xFFFFFF, 0x80): the store over the frame, FixedOver 0x50.
    static void ghost(const FlatInputs&, std::vector<Pass>&);
    // func_0021CF38: the page just drawn at half width into the store.
    static void copyToStore(const FlatInputs&, std::vector<Pass>&);
    // func_0021D3D0: `blurLevel` round trips through Extra, two passes each.
    static void blur(const FlatInputs&, std::vector<Pass>&);
    // func_0021D848: the black rectangle with alpha capped at 0x80.
    static void fade(const FlatInputs&, std::vector<Pass>&);
    // func_0021D990: texture 0, rows 1..30 and 33..62 as the NTSC rectangles 0 and 1.
    static void logo(const FlatInputs&, std::vector<Pass>&);
    // func_0021D6C0: the letterbox bars, SubtractFixed 0x80.
    static void bars(const FlatInputs&, std::vector<Pass>&);

    // The helpers' own arguments, for tests: the page address in 64-word blocks (0 or 640 x 224 / 64), the picture's height, a bar's rows.
    static int32_t page(const FlatInputs&);
    static int32_t blurWhich(const FlatInputs&);
    static int32_t pictureHeight();
    static int32_t barRows();
};

extern template struct Flat<EeArithmetic>;
extern template struct Flat<NativeArithmetic>;

}
