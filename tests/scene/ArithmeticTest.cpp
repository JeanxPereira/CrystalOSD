#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "../Check.hpp"
#include "SceneFixture.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/Matrix.hpp"
#include "Scene/Ramp.hpp"

using scene::asFloat;
using scene::EeArithmetic;
using scene::Mat4;
using scene::NativeArithmetic;
using scene::Vec3;
using scene::Vec4;
using scenetest::fnv;
using scenetest::sameBits;
using Ee = EeArithmetic;
using EeMatrix = scene::Matrix<EeArithmetic>;
using NativeMatrix = scene::Matrix<NativeArithmetic>;

namespace {

// The generators of References/lib/ee-float.test.mjs.
struct Random {
    uint32_t seed = 12345;
    uint32_t next() { return seed = seed * 1103515245u + 12345u; }
    float single(uint32_t low, uint32_t high) {
        const uint32_t exponent = low + next() % (high - low + 1);
        const uint32_t sign = (next() & 1u) << 31;
        return asFloat(sign | (exponent << 23) | (next() & 0x7fffffu));
    }
    std::pair<float, float> pair() {
        const float a = single(60, 190);
        const uint32_t gap = next() % 4 == 0 ? next() % 60 : next() % 30;
        const int32_t ea = static_cast<int32_t>((scene::floatBits(a) >> 23) & 0xff);
        const int32_t eb = std::max(1, std::min(254, ea - static_cast<int32_t>(gap)));
        return {a, single(static_cast<uint32_t>(eb), static_cast<uint32_t>(eb))};
    }
};

bool close(float a, float b, float tolerance) { return std::fabs(a - b) <= tolerance * std::max(1.0f, std::fabs(b)); }

bool isNan(float x) { return std::isnan(x); }

int fixedCases() {
    CHECK(sameBits(Ee::cut(1.0 - std::ldexp(1.0, -60)), 0x3f800000u, "the double sum loses the addend"));
    CHECK(sameBits(Ee::add(1.0f, -std::ldexp(1.0f, -60)), 0x3f7fffffu, "add(1, -2^-60)"));
    CHECK(sameBits(Ee::mul(scene::kMinNormal, 0.5f), 0x00000000u, "mul(MIN_NORMAL, 0.5)"));
    CHECK(sameBits(Ee::mul(-scene::kMinNormal, 0.5f), 0x80000000u, "mul(-MIN_NORMAL, 0.5)"));
    CHECK(sameBits(Ee::mul(scene::kMaxFloat, 2.0f), 0x7f800000u, "mul(MAX, 2)"));
    CHECK(sameBits(Ee::add(scene::kMaxFloat, scene::kMaxFloat), 0x7f800000u, "add(MAX, MAX)"));
    CHECK(sameBits(Ee::cut(3.4028235e38), 0x7f7fffffu, "cut just above MAX"));
    CHECK(sameBits(Ee::cut(3.4028236e38), 0x7f800000u, "cut past MAX"));
    CHECK(sameBits(Ee::cut(-3.4028236e38), 0xff800000u, "cut past -MAX"));
    CHECK(sameBits(Ee::div(1.0f, 0.0f), 0x7f800000u, "div(1, 0)"));
    CHECK(sameBits(Ee::div(-1.0f, 0.0f), 0xff800000u, "div(-1, 0)"));
    CHECK(isNan(Ee::div(0.0f, 0.0f)));
    CHECK(isNan(Ee::sqrt(-1.0f)));
    CHECK(sameBits(Ee::vu0Quotient(1.0f, 0.0f), 0x7f800000u, "vu0Quotient(1, 0)"));
    CHECK(sameBits(Ee::vu0Root(0.0f), 0x00000000u, "vu0Root(0)"));
    const Vec3 zero = EeMatrix::normalize({0.0f, 0.0f, 0.0f});
    CHECK(isNan(zero[0]) && isNan(zero[1]) && isNan(zero[2]));

    const struct { uint32_t x; int32_t i; uint32_t u; } ints[] = {
        {0x3fc00000u, 1, 1}, {0xbfc00000u, -1, 0}, {0x4f32d05eu, 2147483647, 3000000000u},
        {0xcf32d05eu, -2147483647 - 1, 0}, {0x3f7d70a4u, 0, 0}, {0xbf7d70a4u, 0, 0}};
    for (const auto& c : ints) {
        CHECK(Ee::toInt(asFloat(c.x)) == c.i);
        CHECK(Ee::toUnsigned(asFloat(c.x)) == c.u);
    }
    CHECK(scene::s16(0x18000) == -0x8000 && scene::s16(0x7fff) == 0x7fff && scene::u16(-1) == 0xffff);
    return 0;
}

int sweeps() {
    Random random;
    std::vector<float> sums;
    for (int i = 0; i < 40000; ++i) {
        const auto [a, b] = random.pair();
        sums.push_back(Ee::add(a, b));
        sums.push_back(Ee::sub(a, b));
    }
    CHECK(fnv(sums.data(), sums.size()) == 0x77104eddu);

    std::vector<float> products;
    for (int i = 0; i < 20000; ++i) {
        const float a = random.single(90, 160), b = random.single(90, 160);
        products.insert(products.end(), {Ee::mul(a, b), Ee::div(a, b), Ee::sqrt(std::fabs(a)), Ee::vu0Quotient(std::fabs(a), std::fabs(b)), Ee::vu0Root(a)});
    }
    CHECK(fnv(products.data(), products.size()) == 0x1c1172deu);
    return 0;
}

int sineTable() {
    CHECK(sameBits(Ee::sin16(0), 0x00000000u, "table[0]"));
    CHECK(sameBits(Ee::sin16(1), 0x38c90cb6u, "table[1]"));
    CHECK(sameBits(Ee::sin16(0x2000), 0x3f3502bbu, "table[0x2000]"));
    CHECK(sameBits(Ee::sin16(0x4000), 0x3f800000u, "table[0x4000]"));
    std::vector<float> table;
    for (int32_t i = 0; i <= 0x4000; ++i) table.push_back(Ee::sin16(i));
    CHECK(fnv(table.data(), table.size()) == 0x85b1f341u);

    const struct { int32_t angle; uint32_t sine, cosine; } cases[] = {
        {0, 0x00000000u, 0x3f800000u}, {0x4000, 0x3f800000u, 0x80000000u}, {0x8000, 0x80000000u, 0xbf800000u},
        {-1, 0xb8c90cb6u, 0x3f800000u}, {0x2000, 0x3f3502bbu, 0x3f3502bbu}, {-0x2000, 0xbf3502bbu, 0x3f3502bbu},
        {0x6000, 0x3f3502bbu, 0xbf3502bbu}, {12345, 0x3f6d09bbu, 0x3ec155b6u}, {70000, 0x3ed47c47u, 0x3f68e721u}};
    for (const auto& c : cases) {
        CHECK(sameBits(Ee::sin16(c.angle), c.sine, "sin16(" + std::to_string(c.angle) + ")"));
        CHECK(sameBits(Ee::cos16(c.angle), c.cosine, "cos16(" + std::to_string(c.angle) + ")"));
        CHECK(close(NativeArithmetic::sin16(c.angle), Ee::sin16(c.angle), 1e-6f));
        CHECK(close(NativeArithmetic::cos16(c.angle), Ee::cos16(c.angle), 1e-6f));
    }
    std::vector<float> sweep;
    for (int32_t a = -0x9000; a <= 0x9000; a += 7) {
        sweep.push_back(Ee::sin16(a));
        sweep.push_back(Ee::cos16(a));
    }
    CHECK(fnv(sweep.data(), sweep.size()) == 0xcba6b14au);
    return 0;
}

int libm() {
    const struct { uint32_t x, cosine; } cases[] = {
        {0x00000000u, 0x3f800000u}, {0x3f000000u, 0x3f60a940u}, {0x3f800000u, 0x3f0a5140u}, {0xbf800000u, 0x3f0a5140u},
        {0x3f490fdau, 0x3f3504f4u}, {0x3fc90fdbu, 0xb33bbd2eu}, {0xbfc90fdbu, 0xb33bbd2eu}, {0x40000000u, 0xbed51132u},
        {0x40200000u, 0xbf4d17bfu}, {0x40400000u, 0xbf7d7025u}, {0x40490fdbu, 0xbf7fffffu}, {0xc0490fdbu, 0xbf7fffffu},
        {0x40800000u, 0xbf275530u}, {0x41200000u, 0xbf56cd64u}, {0x42c80000u, 0x3f5cc0edu}, {0x43480000u, 0x3ef970a9u},
        {0x3727c5acu, 0x3f7fffffu}, {0x3e99999au, 0x3f7490edu}};
    for (const auto& c : cases) {
        const float x = asFloat(c.x);
        CHECK(sameBits(Ee::cosf(x), c.cosine, "cosf(" + scenetest::bitsText(c.x) + ")"));
        CHECK(close(NativeArithmetic::cosf(x), Ee::cosf(x), 1e-6f));
    }
    const struct { uint32_t x, sine; } sines[] = {
{0x00000000u, 0x00000000u},
{0x3089705fu, 0x3089705fu},
{0x3dcccccdu, 0x3dcc7576u},
{0xbdcccccdu, 0xbdcc7576u},
{0x3f000000u, 0x3ef57743u},
{0x3f47ae14u, 0x3f340a1eu},
{0x3f4ccccdu, 0x3f37a4a6u},
{0x3f800000u, 0x3f576aa3u},
{0x3fc90fdau, 0x3f7fffffu},
{0x3fd1eb85u, 0x3f7f6321u},
{0x40000000u, 0x3f68c7b7u},
{0xc0200000u, 0xbf193578u},
{0x40490fdbu, 0xb3bbbd2eu},
{0x40800000u, 0xbf41bdceu},
{0x40966666u, 0xbf7ffaf8u},
{0x40b00000u, 0xbf349e4au},
{0x40c90fdbu, 0x343bbd2eu},
{0xc0c00000u, 0x3e8f0f8cu},
{0x41200000u, 0xbf0b44f7u},
{0x42f6e979u, 0xbf4dcee3u},
{0xbfd20c4au, 0xbf7f5e91u},
{0x3ea0d1b7u, 0x3e9e3016u},
{0x402df854u, 0x3ed251efu},
{0x42c80000u, 0xbf01a12du}};
    for (const auto& c : sines) {
        const float x = asFloat(c.x);
        CHECK(sameBits(Ee::sinf(x), c.sine, "sinf(" + scenetest::bitsText(c.x) + ")"));
        CHECK(close(NativeArithmetic::sinf(x), Ee::sinf(x), 1e-6f));
    }
    std::vector<float> cosines;
    for (int i = 0; i <= 20000; ++i) {
        const float x = static_cast<float>(-201.0 + i * 0.0201);
        cosines.push_back(Ee::cosf(x));
    }
    CHECK(fnv(cosines.data(), cosines.size()) == 0x5605f7f8u);

    const struct { uint32_t x, sine, cosine; } pairs[] = {
        {0x3cfdf3b6u, 0x3cfdebd6u, 0x3f7fe083u}, {0x3e147ae1u, 0x3e13f5ffu, 0x3f7d5041u}, {0x00000000u, 0x00000000u, 0x3f800000u},
        {0xbe147ae1u, 0xbe13f5ffu, 0x3f7d5041u}, {0x3fc00000u, 0x3f7f5bd4u, 0x3d90deaeu}};
    for (const auto& c : pairs) {
        const auto [s, co] = Ee::sineCosine(asFloat(c.x));
        CHECK(sameBits(s, c.sine, "sineCosine sine") && sameBits(co, c.cosine, "sineCosine cosine"));
        const auto [ns, nc] = NativeArithmetic::sineCosine(asFloat(c.x));
        CHECK(close(ns, s, 1e-5f) && close(nc, co, 1e-5f));
    }
    return 0;
}

int matrices() {
    std::vector<float> chain;
    for (int32_t i = 0; i < 12; ++i) {
        Mat4 m = EeMatrix::rotateY(EeMatrix::rotateZ(EeMatrix::identity(), 21845), 29976);
        m = EeMatrix::rotateZ(m, scene::s16((i << 16) / 12 - 0x8000));
        m = EeMatrix::move(m, 0, 20, 0);
        m = EeMatrix::rotateY(m, scene::s16(scene::s16(29976) << 2));
        m = EeMatrix::rotateX(m, -1234 * i);
        for (const Vec4& row : m) chain.insert(chain.end(), row.begin(), row.end());
    }
    const uint32_t first[16] = {0xbeb1c373u, 0x3f19f63eu, 0xbf382cf4u, 0, 0x3f5db2cbu, 0x3efff8bfu, 0, 0,
                                0x3eb827bcu, 0xbf1f7f70u, 0xbf31c87cu, 0, 0x418a8fbeu, 0x411ffb77u, 0, 0x3f800000u};
    for (int k = 0; k < 16; ++k) CHECK(sameBits(chain[k], first[k], "chain[" + std::to_string(k) + "]"));
    CHECK(fnv(chain.data(), chain.size()) == 0xe560d076u);

    const Vec3 n = EeMatrix::normalize({3.5f, -1.25f, 0.1f});
    CHECK(sameBits(n[0], 0x3f70ffabu, "normalize x") && sameBits(n[1], 0xbeac2455u, "normalize y") && sameBits(n[2], 0x3cdc5778u, "normalize z"));
    CHECK(sameBits(EeMatrix::dot(n, {0.3f, 2.0f, -7.7f}), 0xbf18dcadu, "dot"));

    const Mat4 screen = EeMatrix::viewScreen(512, 1, 0.47f, 2048, 2048, 1, 16777215, 1, 65536);
    const uint32_t expected[4][4] = {{0x44000000u, 0, 0, 0}, {0, 0x4370a3d7u, 0, 0}, {0x45000000u, 0x45000000u, 0xc37f00feu, 0x3f800000u}, {0, 0, 0x4b80007fu, 0}};
    for (int r = 0; r < 4; ++r)
        for (int c = 0; c < 4; ++c) CHECK(sameBits(screen[r][c], expected[r][c], "screen"));
    const Mat4 nativeScreen = NativeMatrix::viewScreen(512, 1, 0.47f, 2048, 2048, 1, 16777215, 1, 65536);
    for (int r = 0; r < 4; ++r)
        for (int c = 0; c < 4; ++c) CHECK(close(nativeScreen[r][c], screen[r][c], 1e-5f));

    scene::Ramp ramp{3, 1, 1, 1};
    scene::tickRamp(ramp);
    CHECK(ramp.counter == 2 && ramp.changed == 0 && ramp.state == 1);
    scene::tickRamp(ramp);
    CHECK(ramp.counter == 3 && ramp.changed == 1 && ramp.state == 2);
    ramp.state = 3;
    ramp.counter = 1;
    scene::tickRamp(ramp);
    CHECK(ramp.counter == 0 && ramp.changed == 1 && ramp.state == 0);
    return 0;
}

int sceneFixture(const std::string& path) {
    const nlohmann::json scene = scenetest::loadScene(path);
    const auto& frames = scene.at("frames");
    CHECK(!frames.empty());
    CHECK(sameBits(EeMatrix::viewScreen(512, 1, 0.47f, 2048, 2048, 1, 16777215, 1, 65536), frames.at(0).at("expect").at("camera").at("screen"), "frame 0 screen"));
    for (const auto& frame : frames) {
        const auto& in = frame.at("input");
        const auto& camera = frame.at("expect").at("camera");
        const std::string at = "frame " + std::to_string(frame.at("index").get<int>());
        const Mat4 screen = EeMatrix::viewScreen(512, scenetest::hexFloat(in.at("proportions").at("ax")), scenetest::hexFloat(in.at("proportions").at("ay")), 2048, 2048, 1,
                                                 scenetest::hexFloat(in.at("zmax")), 1, 65536);
        CHECK(sameBits(screen, camera.at("screen"), at + " screen"));
        Vec4 position = scenetest::hexVec4(in.at("position"));
        const float offset = scenetest::hexFloat(in.at("cameraOffset"));
        position[2] = Ee::add(position[2], offset);
        const Vec4 direction = scenetest::hexVec4(in.at("direction")), up = scenetest::hexVec4(in.at("up")), rotation = scenetest::hexVec4(in.at("rotation"));
        const Mat4 view = EeMatrix::viewMatrix(position, direction, up, rotation);
        CHECK(sameBits(view, camera.at("view"), at + " view"));
        CHECK(sameBits(Ee::mul(offset, scenetest::hexFloat(in.at("cameraFactor"))), camera.at("cameraOffset"), at + " cameraOffset"));
        const Mat4 native = NativeMatrix::viewMatrix(position, direction, up, rotation);
        for (int r = 0; r < 4; ++r)
            for (int c = 0; c < 4; ++c) CHECK(close(native[r][c], view[r][c], 1e-4f));
    }
    std::printf("scene fixture: %zu frames, camera equal bit for bit\n", frames.size());
    return 0;
}

}

int openingVectors(const std::string& path) {
    const nlohmann::json vectors = scenetest::loadScene(path);
    for (const auto& v : vectors.at("sinCos")) {
        const float x = scene::hexFloat(v.at("x"));
        CHECK(sameBits(Ee::sinf(x), v.at("sin"), "sinf"));
        CHECK(sameBits(Ee::cosf(x), v.at("cos"), "cosf"));
        CHECK(close(NativeArithmetic::sinf(x), scene::hexFloat(v.at("sin")), 1e-5f));
        CHECK(close(NativeArithmetic::cosf(x), scene::hexFloat(v.at("cos")), 1e-5f));
    }
    for (const auto& v : vectors.at("sums")) {
        const float a = scene::hexFloat(v.at("a")), b = scene::hexFloat(v.at("b"));
        CHECK(sameBits(Ee::addExact(a, b), v.at("add"), "addExact"));
        CHECK(sameBits(Ee::subExact(a, b), v.at("sub"), "subExact"));
    }
    for (const auto& v : vectors.at("quotients")) {
        const float a = scene::hexFloat(v.at("a")), b = scene::hexFloat(v.at("b"));
        CHECK(sameBits(Ee::quotientExact(a, b), v.at("q"), "quotientExact"));
        const float native = NativeArithmetic::quotientExact(a, b);
        const float want = scene::hexFloat(v.at("q"));
        CHECK(b == 0.0f ? native == want : close(native, want, 1e-6f));
    }
    for (const auto& v : vectors.at("roots")) {
        const float x = scene::hexFloat(v.at("x"));
        CHECK(sameBits(Ee::rootExact(x), v.at("r"), "rootExact"));
        CHECK(close(NativeArithmetic::rootExact(x), scene::hexFloat(v.at("r")), 1e-6f));
    }
    for (uint32_t bits : {0x43490f81u, 0xc3490f81u, 0x44000000u, 0x7f7fffffu, 0x7f800000u, 0xff800000u, 0x7fc00000u}) {
        CHECK(isNan(Ee::sinf(asFloat(bits))));
        CHECK(isNan(Ee::cosf(asFloat(bits))));
    }
    CHECK(sameBits(Ee::mul(1e-22f, 1e-22f), 0x00000000u, "denormal product flushes to zero"));
    CHECK(sameBits(Ee::mul(-1e-22f, 1e-22f), 0x80000000u, "negative denormal product flushes to -0"));
    CHECK(sameBits(Ee::quotientExact(1e-30f, 1e30f), 0x00000000u, "denormal quotient flushes to zero"));
    CHECK(sameBits(Ee::addExact(1.0f, -1e-22f), 0x3f7fffffu, "addExact(1, -1e-22)"));
    CHECK(sameBits(Ee::addExact(1.0f, 1e-22f), 0x3f800000u, "addExact(1, 1e-22)"));
    CHECK(sameBits(Ee::quotientExact(1.0f, 0.0f), 0x7f7fffffu, "quotientExact(1, 0)"));
    CHECK(sameBits(Ee::quotientExact(-1.0f, 0.0f), 0xff7fffffu, "quotientExact(-1, 0)"));
    return 0;
}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count > 2 && std::string(arguments[1]) == "--opening") {
            if (int failed = openingVectors(arguments[2])) return failed;
            std::printf("arithmetic (opening): all equal bit for bit\n");
            return 0;
        }
        if (int failed = fixedCases()) return failed;
        if (int failed = sweeps()) return failed;
        if (int failed = sineTable()) return failed;
        if (int failed = libm()) return failed;
        if (int failed = matrices()) return failed;
        if (count > 1)
            if (int failed = sceneFixture(arguments[1])) return failed;
        std::printf("arithmetic: all equal bit for bit\n");
        return 0;
    });
}
