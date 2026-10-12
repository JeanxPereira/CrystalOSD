#pragma once
#include "Scene/Frame.hpp"

namespace app {

struct FrameSource {
    virtual ~FrameSource() = default;
    virtual void step() = 0;
    virtual scene::Frame& frame() = 0;
    virtual bool done() const = 0;
};

}
