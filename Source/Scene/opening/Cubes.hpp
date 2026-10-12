#pragma once
#include <array>
#include <cstdint>
#include <vector>

#include "Scene/Frame.hpp"
#include "Scene/Matrix.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/opening/Timeline.hpp"

namespace scene::opening {

struct CubeCorner {
    Vec4 world{}, eye{}, screen{};
    float q = 0.0f;
    std::array<int32_t, 4> ints{};
};

struct CubeFace {
    std::array<int32_t, 4> corners{};
    Vec4 object{}, world{}, view{};
    float facing = 0.0f;
    Vec4 colour{};
    std::array<float, 4> edge{};
};

// facts/opening.md 4.1: the work record func_00224EB8 and func_00224BC0 leave for a cube that is drawn (verify_opening_cubes_v2.mjs transform).
struct CubeWork {
    int32_t index = 0;
    Vec4 angles{};
    Mat4 turned{}, toWorld{}, toScreen{};
    Vec4 centre{};
    std::array<CubeCorner, 8> corners{};
    std::array<CubeFace, 6> faces{};
};

// One row of the table of ten passes (facts/opening.md 4.1): `mode` is the row of the OSD's ALPHA table (4: (Cs - Cd) x As + Cd,
// 5: Cs x As + Cd, 8: Cs x Ad + Cd), `fix` its fixed alpha; texture 0 stands for the frame buffer (pass 0) or the extra buffer (pass 5).
struct CubePassSetup {
    bool away;
    int32_t texture, mode;
    uint8_t fix;
};
const std::array<CubePassSetup, 10>& cubePassSetups();

// facts/opening.md 4.1, InitLightsCubes 0x002209E0: five cubes, the same every run.
template <class A>
class Cubes {
public:
    explicit Cubes(const ProgramImage& program);

    // Per cube: turn, matrices, clip test, work record, then up to ten passes in the table's order (away faces into Extra, toward faces
    // into Display), the faces of a pass split wherever the antialiasing of a refracting face changes. field: the frame counter's parity.
    void draw(const Matrices& matrices, const Vec4& cameraPosition, std::vector<Pass>& out, std::vector<CubeWork>* probe = nullptr, int32_t field = 0);

private:
    struct State {
        Vec4 place{}, angles{}, rates{};
    };
    std::array<State, 5> m_cubes;
};

}
