#include "Scene/opening/TowerVu1.hpp"

#include <cstring>
#include <stdexcept>
#include <vector>

#include "Scene/Arithmetic.hpp"
#include "Scene/Matrix.hpp"
#include "Scene/opening/Vu0.hpp"

namespace scene::opening {

namespace {

uint32_t read32(const uint8_t* bytes, size_t at) {
    uint32_t v;
    std::memcpy(&v, bytes + at, 4);
    return v;
}

// facts/opening.md 5.1 verify_opening_vu1_v2.mjs vifWords: the words VIF1 receives, the tags' upper halves included.
std::vector<uint32_t> vifWords(const TowerChain& chain) {
    std::vector<uint32_t> words;
    size_t at = 0;
    for (int guard = 0; guard < 64; ++guard) {
        if (at + 16 > chain.bytes.size()) throw std::runtime_error("tower chain: tag past the end");
        const uint32_t tag = read32(chain.bytes.data(), at), address = read32(chain.bytes.data(), at + 4);
        const uint32_t count = tag & 0xffff, id = (tag >> 28) & 7;
        if (at + 16 + size_t(count) * 16 > chain.bytes.size()) throw std::runtime_error("tower chain: data past the end");
        words.push_back(read32(chain.bytes.data(), at + 8));
        words.push_back(read32(chain.bytes.data(), at + 12));
        for (uint32_t i = 0; i < count * 4; ++i) words.push_back(read32(chain.bytes.data(), at + 16 + i * 4));
        if (id == 7 || id == 0) return words;
        if (id == 2) at = address - kTowerChainAddress;
        else if (id == 1) at += 16 + count * 16;
        else throw std::runtime_error("tower chain: tag not handled");
    }
    throw std::runtime_error("tower chain: no end");
}

template <class A>
class Vu1 {
public:
    Vu1() : m_memory(0x4000, 0) {}

    void write(uint32_t address, const uint32_t* words, uint32_t count) {
        for (uint32_t k = 0; k < count; ++k) std::memcpy(&m_memory[((address << 4) + k * 4) & 0x3fff], &words[k], 4);
    }

    // Instructions 0..25: world-to-screen x the tower's matrix, the registers, the blend packet.
    void setup() {
        Mat4 a;
        for (int r = 0; r < 4; ++r) a[r] = vector(r);
        for (int i = 0; i < 4; ++i) store(22 + i, Vu0<A>::apply(a, vector(4 + i)));
        for (int i = 0; i < 4; ++i) m_light[i] = vector(8 + i);
        for (int i = 0; i < 4; ++i) m_normal[i] = vector(12 + i);
        m_low = vector(16);
        m_high = vector(17);
        m_alpha = qword(19);
        if ((word(21, 0) & 0xffff) != 0) throw std::runtime_error("tower chain: entry 21 is not zero");
        for (int i = 0; i < 4; ++i) m_matrix[i] = vector(22 + i);
    }

    // Instructions 33..96: one face.
    void strip(uint32_t top, TowerVertices& out, int face) {
        const uint32_t count = word(top, 0) & 0x7fff;
        if (count != 4) throw std::runtime_error("tower chain: a face without four vertices");
        int wait = 0;
        for (uint32_t i = 0; i < count; ++i) {
            const Vec4 p = Vu0<A>::apply(m_matrix, vector(top + 1 + i));
            Vec4 n = Vu0<A>::apply(m_normal, vector(top + 1 + count + i));
            const Vec4 tint = vector(top + 1 + 2 * count + i);
            const float q = A::quotientExact(1.0f, p[3]);
            const Vec4 place{A::mul(p[0], q), A::mul(p[1], q), A::mul(p[2], q), p[3]};
            Vec4 st = vector(top + 1 + 3 * count + i);
            for (float& x : st) x = A::mul(x, q);
            for (float& x : n) x = x > 0 ? x : 0;
            bool inside = true;
            for (int k : {0, 1, 3}) inside = inside && A::subExact(m_low[k], place[k]) < 0 && A::subExact(place[k], m_high[k]) < 0;
            bool drawn = false;
            if (inside) {
                drawn = wait <= 0;
                wait -= 1;
            } else {
                wait = 3;
            }
            if (inside) {
                const Vec4 lit = Vu0<A>::apply(m_light, n);
                for (int k = 0; k < 4; ++k) m_colour[k] = A::toInt(A::mul(tint[k], lit[k]));
            }
            Vertex& v = out.vertices[face * 4 + i];
            v.u = st[0];
            v.v = st[1];
            v.q = st[2];
            v.r = static_cast<uint8_t>(m_colour[0]);
            v.g = static_cast<uint8_t>(m_colour[1]);
            v.b = static_cast<uint8_t>(m_colour[2]);
            v.a = static_cast<uint8_t>(m_colour[3]);
            v.x = static_cast<float>(static_cast<uint32_t>(A::toInt(A::mul(place[0], 16.0f))) & 0xffff) / 16.0f - kTowerOffsetX;
            v.y = static_cast<float>(static_cast<uint32_t>(A::toInt(A::mul(place[1], 16.0f))) & 0xffff) / 16.0f - kTowerOffsetY;
            v.z = static_cast<uint32_t>(A::toInt(A::mul(place[2], 16.0f))) >> 4;
            out.kicked[face * 4 + i] = drawn;
        }
    }

    uint64_t alpha() const { return m_alpha; }

private:
    uint32_t word(uint32_t n, int k) const {
        uint32_t v;
        std::memcpy(&v, &m_memory[((n & 0x3ff) << 4) + k * 4], 4);
        return v;
    }
    uint64_t qword(uint32_t n) const {
        uint64_t v;
        std::memcpy(&v, &m_memory[(n & 0x3ff) << 4], 8);
        return v;
    }
    Vec4 vector(uint32_t n) const {
        Vec4 v;
        for (int k = 0; k < 4; ++k) {
            const uint32_t bits = word(n, k);
            std::memcpy(&v[k], &bits, 4);
        }
        return v;
    }
    void store(uint32_t n, const Vec4& v) {
        for (int k = 0; k < 4; ++k) std::memcpy(&m_memory[((n & 0x3ff) << 4) + k * 4], &v[k], 4);
    }

    std::vector<uint8_t> m_memory;
    Mat4 m_light{}, m_normal{}, m_matrix{};
    Vec4 m_low{}, m_high{};
    std::array<int32_t, 4> m_colour{};
    uint64_t m_alpha = 0;
};

}

// facts/opening.md 5.1 verify_opening_vu1_v2.mjs run: what VIF1 does with each code, as far as the chain uses them.
template <class A>
TowerVertices TowerVu1<A>::run(const TowerChain& chain) {
    const std::vector<uint32_t> words = vifWords(chain);
    Vu1<A> vu;
    TowerVertices out;
    uint32_t base = 0, offset = 0, tops = 0, top = 0, flip = 0;
    int faces = 0;
    const auto start = [&] {
        top = tops;
        tops = flip == 0 ? base + offset : base;
        flip ^= 1;
    };
    for (size_t i = 0; i < words.size(); ++i) {
        const uint32_t code = words[i], command = (code >> 24) & 0x7f, number = (code >> 16) & 0xff, immediate = code & 0xffff;
        if (command == 0x00 || command == 0x01 || command == 0x10 || command == 0x11 || command == 0x13) continue;
        if (command == 0x03) { base = immediate & 0x3ff; continue; }
        if (command == 0x02) { offset = immediate & 0x3ff; flip = 0; tops = base; continue; }
        if (command == 0x14) {
            if (immediate != 0) throw std::runtime_error("tower chain: MSCAL not 0");
            start();
            vu.setup();
            out.alpha = vu.alpha();
            continue;
        }
        if (command == 0x17) {
            start();
            if (faces >= 6) throw std::runtime_error("tower chain: more than six faces");
            vu.strip(top, out, faces++);
            continue;
        }
        if (command == 0x6c) {
            const uint32_t address = (immediate & 0x3ff) + ((immediate & 0x8000) ? tops : 0);
            const uint32_t entries = number == 0 ? 256 : number;
            if (i + size_t(entries) * 4 >= words.size()) throw std::runtime_error("tower chain: unpack past the end");
            vu.write(address, &words[i + 1], entries * 4);
            i += size_t(entries) * 4;
            continue;
        }
        throw std::runtime_error("tower chain: VIF code not handled");
    }
    if (faces != 6) throw std::runtime_error("tower chain: not six faces");
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template struct TowerVu1<EeArithmetic>;
#endif
template struct TowerVu1<NativeArithmetic>;

}
