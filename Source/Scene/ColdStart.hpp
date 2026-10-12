#pragma once
#include <memory>

#include "Scene/Clock.hpp"
#include "Scene/ColdTypes.hpp"
#include "Scene/Font.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/Rods.hpp"

namespace scene {

struct ColdAssets {
    std::shared_ptr<const ProgramImage> program;
    std::shared_ptr<const Font> font;
    RodMesh mesh;
    RodMesh cubeMesh;
};

struct ColdStartOut {
    ClockInputs clock;
    FrameInputs frame;
};

template <class A>
ColdStartOut coldStart(const ColdAssets& assets, const ColdInputs& inputs);

inline void fillTime(FrameInputs& frame) { frame.timeFilled = 1; }


}
