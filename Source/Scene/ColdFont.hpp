#pragma once
#include <array>
#include <cstdint>
#include <memory>

#include "Scene/Font.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/Text.hpp"

namespace scene {

struct ColdFontOut {
    FontState state;
    FontCache cache;
    std::array<int32_t, 8> widths{};
};

template <class A>
ColdFontOut coldFont(std::shared_ptr<const ProgramImage> program, std::shared_ptr<const Font> font, bool pal, uint32_t gsAllocator);

}
