#pragma once
#include <array>
#include <cstdint>
#include <vector>

#include "Scene/Frame.hpp"
#include "Scene/Matrix.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/opening/TowerVu1.hpp"
#include "Scene/opening/Types.hpp"

namespace scene::opening {

constexpr int kTowerColumns = 14, kTowerRows = 9;

// The scratch block's matrices (0x70000060: +0x00 the base, +0xC0 world-to-screen, +0x200 the light matrix).
struct TowerMatrices {
    Mat4 base{}, worldToScreen{}, light{};
};

// facts/opening.md 5.2: the tables OpeningInitTowersFog leaves, [column][row].
struct TowerTables {
    std::array<std::array<int32_t, kTowerRows>, kTowerColumns> flag{}, fade{};
    std::array<std::array<float, kTowerRows>, kTowerColumns> sway{}, tall{}, height{};
    std::array<std::array<Vec4, kTowerRows>, kTowerColumns> place{};
};

// facts/opening.md 5.2 verify_opening_towers_ee.mjs setup, brightness and tower. The program supplies the static
// tables and the chain's template (HDD OSD 1.10U).
template <class A>
class Towers {
public:
    // OpeningInitTowersFog 0x00221D30: the cells from the play history, the heights and places, the fade counts;
    // func_00220D60: the 20 x 20 brightness table.
    Towers(const History& history, const ProgramImage& program);

    const TowerTables& tables() const { return m_tables; }
    const std::array<std::array<float, 20>, 20>& brightness() const { return m_brightness; }
    // func_002214F8's sine: sinf(((counter % 360) - 180) x degree).
    float swing(int32_t counter) const;
    // func_002214F8: one pass over the grid, column by column, row by row, no sorting. The towers' triangles are
    // appended to `out` as one pass; `probe` receives each chain as it is started.
    void draw(int32_t counter, const TowerMatrices& matrices, const Vec4& camera, std::vector<Pass>& out, std::vector<TowerChain>* probe = nullptr) const;
    // The chain of one cell as func_002214F8 leaves it.
    TowerChain chain(int32_t column, int32_t row, float sine, const TowerMatrices& matrices) const;

private:
    TowerTables m_tables;
    std::array<std::array<float, 20>, 20> m_brightness{};
    TowerChain m_template;
    std::array<uint32_t, 6> m_faces{};
    std::array<int32_t, 24> m_signs{};
    Vec4 m_origin{}, m_rotation{};
    float m_degree = 0, m_quarter = 0, m_side = 0;
};

}
