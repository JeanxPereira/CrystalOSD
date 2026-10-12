#include "Scene/opening/Towers.hpp"

#include <cmath>
#include <cstring>
#include <stdexcept>

#include "Scene/Arithmetic.hpp"
#include "Scene/opening/Vu0.hpp"

namespace scene::opening {

namespace {

constexpr uint32_t kConstants = 0x0036FA74, kStatics = 0x002B1BE0, kFaces = 0x002B1380, kSigns = 0x002B1B80, kCurves = 0x002B1C10;
constexpr uint32_t kCells = 0x002B0F90, kSource = 0x002B13A0, kEmptyName = 0x003700D0;
constexpr size_t kLength = 0x840;
constexpr int32_t kTowerTexture = 6;

void putWord(TowerChain& chain, uint32_t address, uint32_t value) { std::memcpy(&chain.bytes[address - kTowerChainAddress], &value, 4); }
void putQword(TowerChain& chain, uint32_t address, uint64_t value) { std::memcpy(&chain.bytes[address - kTowerChainAddress], &value, 8); }
void putFloat(TowerChain& chain, uint32_t address, float value) { std::memcpy(&chain.bytes[address - kTowerChainAddress], &value, 4); }
void putMatrix(TowerChain& chain, uint32_t address, const Mat4& m) {
    for (int r = 0; r < 4; ++r)
        for (int c = 0; c < 4; ++c) putFloat(chain, address + (r * 4 + c) * 4, m[r][c]);
}

std::string nameOf(const HistoryEntry& entry) {
    size_t n = 0;
    while (n < entry.name.size() && entry.name[n] != 0) ++n;
    return std::string(entry.name.data(), n);
}

}

template <class A>
Towers<A>::Towers(const History& history, const ProgramImage& program) {
    for (size_t at = 0; at < kLength; at += 4) {
        const uint32_t w = program.word(kTowerChainAddress + static_cast<uint32_t>(at));
        std::memcpy(&m_template.bytes[at], &w, 4);
    }
    for (int i = 0; i < 6; ++i) m_faces[i] = program.word(kFaces + i * 4);
    for (int i = 0; i < 24; ++i) m_signs[i] = program.integer(kSigns + i * 4);
    for (int i = 0; i < 4; ++i) {
        m_origin[i] = program.single(kStatics + 0x10 + i * 4);
        m_rotation[i] = program.single(kStatics + 0x20 + i * 4);
    }
    const auto k = [&](int i) { return program.single(kConstants + i * 4); };
    m_side = k(6);
    m_degree = k(7);
    m_quarter = k(8);
    const float shift = k(10);
    const std::string empty = program.string(kEmptyName);

    // facts/opening.md 5.2 verify_opening_towers_ee.mjs setup (OpeningInitTowersFog 0x00221D30).
    float sways[14], heights[14];
    for (int i = 0; i < 14; ++i) {
        sways[i] = program.single(kCurves + i * 4);
        heights[i] = program.single(kCurves + 0x38 + i * 4);
    }
    TowerTables& t = m_tables;
    for (size_t e = 0; e < history.size(); ++e) {
        const HistoryEntry& entry = history[e];
        if (nameOf(entry) == empty) continue;
        for (int cell = 0; cell < 6; ++cell) {
            const int32_t column = program.integer(kCells + static_cast<uint32_t>(e) * 0x30 + cell * 8);
            const int32_t row = program.integer(kCells + static_cast<uint32_t>(e) * 0x30 + cell * 8 + 4);
            if (column < 0 || column >= kTowerColumns || row < 0 || row >= kTowerRows) throw std::runtime_error("towers: a cell outside the grid");
            if (cell == entry.mainCell) {
                const int index = entry.count < 14 ? entry.count : ((entry.count - 14) % 10) + 4;
                t.sway[column][row] = sways[index];
                t.tall[column][row] = heights[index];
                t.flag[column][row] = 1;
            } else if ((entry.mask >> cell) & 1) {
                t.flag[column][row] = 1;
                t.tall[column][row] = 1;
                t.sway[column][row] = 1;
            }
        }
    }
    for (int c = 0; c < kTowerColumns; ++c)
        for (int r = 0; r < kTowerRows; ++r) {
            const uint32_t at = kSource + c * 0x90 + r * 0x10;
            const Vec4 s{program.single(at), program.single(at + 4), program.single(at + 8), program.single(at + 12)};
            Vec4 p{A::cut(static_cast<double>(A::cut(static_cast<double>(s[0]) + shift)) * 4), A::cut(static_cast<double>(A::cut(static_cast<double>(s[1]) - 6.5)) * 4),
                   A::cut(static_cast<double>(A::cut(static_cast<double>(A::cut(static_cast<double>(s[2]) + 4)) * 12)) + 150), s[3]};
            float h = A::cut(static_cast<double>(t.tall[c][r]) * 30);
            if (h < 3) h = 3;
            const float factor = t.sway[c][r];
            p[2] = A::cut(static_cast<double>(p[2]) + A::cut(static_cast<double>(A::cut(static_cast<double>(factor) * 30)) - h));
            if (1 <= factor) {
                t.sway[c][r] = 1;
                t.fade[c][r] = 0;
            } else {
                t.fade[c][r] = A::toInt(A::cut(static_cast<double>(A::cut(1.0 - static_cast<double>(factor))) * 128));
            }
            t.place[c][r] = p;
            t.height[c][r] = h;
        }

    // facts/opening.md 5.2 verify_opening_towers_ee.mjs brightness (func_00220D60).
    const float radius2 = k(0), step = k(1), base = k(2), a = k(3), b = k(4), scale = k(5);
    const auto f = [](double x) { return A::cut(x); };
    const float R = A::rootExact(radius2);
    for (int i = 0; i < 20; ++i) {
        const int s6 = 2 * i - 20;
        const float row = f(static_cast<double>(f(static_cast<double>(s6) * step)) * 0.5);
        for (int j = 0; j < 20; ++j) {
            const int s4 = 2 * j - 20;
            const float y = f(static_cast<double>(row) + base);
            const float dy = f(0.0 - y);
            const float x = f(static_cast<double>(f(static_cast<double>(f(static_cast<double>(s4) * step)) * 0.5)) + base);
            const float dx = f(static_cast<double>(a) - x);
            float d = A::rootExact(f(static_cast<double>(f(static_cast<double>(dx) * dx)) + f(static_cast<double>(dy) * dy)));
            d = f(static_cast<double>(d) + d);
            float first = A::quotientExact(f(static_cast<double>(f(static_cast<double>(R) - d)) * 255), R);
            first = first < 32 ? 32.0f : 255 < first ? 255.0f : first;
            const float y2 = f(static_cast<double>(f(static_cast<double>(f(static_cast<double>(s6) * step)) * 0.5)) + base);
            const float x2 = f(static_cast<double>(f(static_cast<double>(f(static_cast<double>(s4) * step)) * 0.5)) + base);
            const float ey = f(static_cast<double>(step) - y2), ex = f(static_cast<double>(b) - x2);
            const float d2 = f(static_cast<double>(A::rootExact(f(static_cast<double>(f(static_cast<double>(ex) * ex)) + f(static_cast<double>(ey) * ey)))) * 4);
            const float second = f(static_cast<double>(A::quotientExact(f(static_cast<double>(f(static_cast<double>(R) - d2)) * 255), R)) * 0.5);
            float total = second < 32 ? f(static_cast<double>(first) + 32) : 255 < second ? f(static_cast<double>(first) + 255) : f(static_cast<double>(first) + second);
            const int wobble = (((j + i) * j / (i + 1)) % 11 - 5) * 10;
            total = f(static_cast<double>(f(static_cast<double>(total) * scale)) - wobble);
            m_brightness[j][i] = total < 32 ? 32.0f : 220 < total ? 220.0f : total;
        }
    }
}

template <class A>
float Towers<A>::swing(int32_t counter) const {
    const float angle = A::cut(static_cast<double>((counter % 360) - 180) * m_degree);
    return A::sinf(angle);
}

// facts/opening.md 5.2 verify_opening_towers_ee.mjs tower (func_002214F8 and the functions it calls).
template <class A>
TowerChain Towers<A>::chain(int32_t column, int32_t row, float sine, const TowerMatrices& matrices) const {
    const auto f = [](double x) { return A::cut(x); };
    const int s0 = column + 3, s2 = row + 6, s5 = row + 7, s1 = s0 + s2;
    const int turn = (s1 * s0 / s5) % 4;
    const float swingAngle = f(static_cast<double>(f(static_cast<double>(sine) * 10)) * m_degree);
    const float turned = f(static_cast<double>(turn) * m_quarter);
    const float twist = m_tables.sway[column][row] != 1 ? f(static_cast<double>(swingAngle) + turned) : turned;
    const Vec4 rot{f(static_cast<double>(m_rotation[0]) + 0), f(static_cast<double>(m_rotation[1]) + 0), f(static_cast<double>(m_rotation[2]) + twist),
                   f(static_cast<double>(m_rotation[3]) + 0)};
    const Mat4 rotated = Vu0<A>::rotMatrix(matrices.base, rot);
    const Vec4& place = m_tables.place[column][row];
    const Vec4 trans{f(static_cast<double>(m_origin[0]) + place[0]), f(static_cast<double>(m_origin[1]) + place[1]), f(static_cast<double>(m_origin[2]) + place[2]),
                     f(static_cast<double>(m_origin[3]) + 0)};
    const Mat4 local = Vu0<A>::transMatrix(rotated, trans);
    const Mat4 normals = Vu0<A>::mulMatrix(matrices.light, rotated);

    TowerChain chain = m_template;
    putQword(chain, 0x2a5010, 0x1000000000008002ull);
    putQword(chain, 0x2a5018, 0xeull);
    putQword(chain, 0x2a5020, 0x8000000044ull);
    putQword(chain, 0x2a5028, 0x42ull);
    putQword(chain, 0x2a5030, 0ull);
    putQword(chain, 0x2a5038, 0x49ull);
    putQword(chain, 0x2a5040, 0ull);
    putQword(chain, 0x2a5048, 0ull);
    putWord(chain, kTowerChainAddress + 4, kTowerChainAddress + 0x180);
    for (uint32_t pointer : m_faces) {
        putWord(chain, pointer, 0x8004);
        putWord(chain, pointer + 4, 0x304E4000u);
        putWord(chain, pointer + 8, 0x412);
        putWord(chain, pointer + 12, 0);
    }
    const int32_t count = m_tables.fade[column][row];
    const float h = m_tables.height[column][row];
    float light = m_brightness[s0][s2];
    light = count == 0 ? f(static_cast<double>(light) * A::quotientExact(h, 30.0f)) : f(static_cast<double>(light) * f(static_cast<double>(count) * 0.0078125));
    const float side = f(static_cast<double>(light) * m_side);
    for (int face = 0; face < 6; ++face) {
        const uint32_t base = m_faces[face];
        for (int v = 0; v < 4; ++v) {
            const float z = m_signs[face * 4 + v] != 0 ? h : f(0.0 - static_cast<double>(h));
            putFloat(chain, base + 0x10 + v * 16 + 8, z);
            const uint32_t colour = base + 0x90 + v * 16;
            if (0 < z) {
                putWord(chain, colour, 0);
                putWord(chain, colour + 4, 0);
                putWord(chain, colour + 8, 0);
            } else {
                for (uint32_t o : {0u, 4u, 8u}) putFloat(chain, colour + o, face == 0 ? light : side);
            }
            putFloat(chain, colour + 12, 128.0f);
        }
    }
    const int picked = (s1 * (s0 + 5)) / (s2 + 1) + (s1 * (s0 + 4)) / (s2 + 3);
    const float v = picked != 0 ? f(static_cast<double>(picked) * 0.00390625) : 0.0f;
    const float low = f(static_cast<double>(v) + 0), high = f(static_cast<double>(v) + 1);
    const float corners[4][2] = {{low, low}, {high, low}, {low, high}, {high, high}};
    for (uint32_t pointer : m_faces)
        for (int n = 0; n < 4; ++n) {
            const uint32_t where = pointer + 0xd0 + n * 16;
            putFloat(chain, where, corners[n][0]);
            putFloat(chain, where + 4, corners[n][1]);
            putFloat(chain, where + 8, 1.0f);
            putWord(chain, where + 12, 0);
        }
    putMatrix(chain, 0x2a4ef0, matrices.worldToScreen);
    putMatrix(chain, 0x2a4f30, local);
    putMatrix(chain, 0x2a4fb0, normals);
    return chain;
}

template <class A>
void Towers<A>::draw(int32_t counter, const TowerMatrices& matrices, const Vec4& camera, std::vector<Pass>& out, std::vector<TowerChain>* probe) const {
    const float sine = swing(counter);
    Pass pass;
    pass.name = "towers";
    pass.target = TargetName::Display;
    pass.topology = PassTopology::Triangles;
    pass.edgeSmoothing = true;
    pass.halfLine = true;
    Material& m = pass.material;
    m.source = SourceKind::Texture;
    m.texture = kTowerTexture;
    m.coordinates = CoordinateKind::Projective;
    m.sampling = Sampling::Repeat;
    m.bilinear = true;
    m.blend = BlendOp::AlphaOver;
    m.blendConstant = 128;
    m.depthTest = DepthTest::GreaterEqual;
    m.depthWrite = true;
    m.gouraud = true;
    for (int c = 0; c < kTowerColumns; ++c)
        for (int r = 0; r < kTowerRows; ++r) {
            const Vec4 d = Vu0<A>::subVector(m_tables.place[c][r], camera);
            const float key = d[1] < 0 ? A::cut(std::fabs(static_cast<double>(d[0])) - d[1]) : A::cut(std::fabs(static_cast<double>(d[0])) + d[1]);
            if (!(0 < key) || m_tables.flag[c][r] == 0) continue;
            const TowerChain built = chain(c, r, sine, matrices);
            if (probe) probe->push_back(built);
            const TowerVertices v = TowerVu1<A>::run(built);
            for (int face = 0; face < 6; ++face)
                for (int i = 2; i < 4; ++i) {
                    if (!v.kicked[face * 4 + i]) continue;
                    for (int k = i - 2; k <= i; ++k) pass.vertices.push_back(v.vertices[face * 4 + k]);
                }
        }
    if (!pass.vertices.empty()) out.push_back(std::move(pass));
}

#ifndef SCENE_NATIVE_ONLY
template class Towers<EeArithmetic>;
#endif
template class Towers<NativeArithmetic>;

}
