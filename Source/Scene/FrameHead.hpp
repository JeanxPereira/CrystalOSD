#pragma once
#include <array>
#include <cstdint>
#include <vector>

#include "Scene/Matrix.hpp"
#include "Scene/Ramp.hpp"

namespace scene {

struct Rect {
    std::array<int32_t, 4> colour{};
    int32_t x0 = 0, y0 = 0, u0 = 0, v0 = 0, x1 = 0, y1 = 0, u1 = 0, v1 = 0;
    int32_t z = 0, blend = 0, textured = 0;
};

struct RingRecord {
    int32_t alpha = 0, cx = 0, cy = 0, rx = 0, ry = 0, z = 0;
};

struct TubeConstants {
    float near = 0, turn = 0, scroll = 0, ripple = 0, scrollEnd = 0, turnEnd = 0, far = 0, radius = 0;
};

// The head's own state: what facts/clock-frame-rest.md says the head, overlay, bars and column keep between frames.
struct HeadState {
    Ramp greyRamp;
    std::array<int32_t, 3> greys{};
    Ramp vignetteRamp;
    RingRecord ring;
    Rect tint, blur, copy, fade, bars, column;
};

// Read-only inputs, owned by the state lane and the menus.
struct HeadInputs {
    int32_t width = 640, height = 224;
    int32_t mode = 0;
    int32_t overlayLevel = 0;
    uint32_t level = 0;
    int32_t counter = 0;
    int32_t item0 = 0;
    float proportionX = 1.0f, proportionY = 1.0f;
    std::array<int32_t, 4> clearColour{};
    TubeConstants tube;
};

enum class Part { Background, Blur, Copy, Tint, Vignette, Fade, BlurAfter, Bars, Column, CubeHalf, CubeAdded, CubeChainShrink, CubeChainStretch, CubeToDisplay };
enum class Target { Display, Work0, Work1 };
enum class Source { None, Background, Frame, Work0, Work1 };
enum class AlphaMode { Add, AlphaOver, Subtract, Constant, Keep };
enum class Topology { TriangleStrip, Sprite };
enum class Coordinates { None, St, Uv };

// Native units: x, y in framebuffer pixels (the GS offset removed, the field not applied); z the 24-bit
// depth value, fog its top byte; colour bytes over 128 (1.0 is 0x80; background colours exceed 1);
// s, t, q as the registers hold them; u, v in texels.
struct HeadVertex {
    float x = 0, y = 0;
    uint32_t z = 0;
    uint8_t fog = 0;
    float r = 0, g = 0, b = 0, a = 0;
    float q = 0, s = 0, t = 0, u = 0, v = 0;
};

struct HeadDraw {
    Part part = Part::Background;
    Target target = Target::Display;
    Source source = Source::None;
    AlphaMode alpha = AlphaMode::AlphaOver;
    int32_t depthTest = 1;
    Topology topology = Topology::Sprite;
    bool textured = false, blended = false, gouraud = false;
    Coordinates coordinates = Coordinates::None;
    std::vector<HeadVertex> vertices;
};

// The two packets of a rectangle record (HDD func_00233770), as FrameHead draws them.
HeadDraw headRectangle(const Rect& record, int32_t width, int32_t height, Part part);

// facts/clock-frame-rest.md: head (background, blur trips, copies, tint), overlay, trips after the rods,
// bars, column. Call order of a frame: head, [rods], overlay, tripsAfter, [pages], bars, column.
// The display is cleared with inputs.clearColour before the head's draws.
template <class A>
class FrameHead {
public:
    explicit FrameHead(const HeadState& state) : m_state(state) {}
    HeadState& state() { return m_state; }
    const HeadState& state() const { return m_state; }

    std::vector<HeadDraw> head(const HeadInputs& in, const Mat4& view, const Mat4& screen);
    std::vector<HeadDraw> overlay(const HeadInputs& in);
    std::vector<HeadDraw> tripsAfter(const HeadInputs& in);
    std::vector<HeadDraw> bars(const HeadInputs& in);
    std::vector<HeadDraw> column(const HeadInputs& in);

private:
    HeadState m_state;
};

}
