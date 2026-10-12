#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>
#include <vector>

#include "../../Check.hpp"
#include "../SceneFixture.hpp"
#include "OpeningFixture.hpp"
#include "Scene/Arithmetic.hpp"
#include "Scene/Matrix.hpp"
#include "Scene/opening/Vu0.hpp"

namespace {

using scene::EeArithmetic;
using scene::Mat4;
using scene::NativeArithmetic;
using scene::Vec4;
using scenetest::sameBits;
using Ee = scene::opening::Vu0<EeArithmetic>;
using Native = scene::opening::Vu0<NativeArithmetic>;

Vec4 vec(const nlohmann::json& hex, size_t at = 0) {
    return {scene::hexFloat(hex.at(at)), scene::hexFloat(hex.at(at + 1)), scene::hexFloat(hex.at(at + 2)), scene::hexFloat(hex.at(at + 3))};
}
Mat4 mat(const nlohmann::json& hex) { return {vec(hex, 0), vec(hex, 4), vec(hex, 8), vec(hex, 12)}; }

bool same(const Mat4& got, const nlohmann::json& want, const char* what) {
    for (size_t r = 0; r < 4; ++r)
        for (size_t c = 0; c < 4; ++c)
            if (!sameBits(got[r][c], want.at(r * 4 + c), what)) return false;
    return true;
}
bool same(const Vec4& got, const nlohmann::json& want, const char* what) {
    for (size_t c = 0; c < 4; ++c)
        if (!sameBits(got[c], want.at(c), what)) return false;
    return true;
}
bool near(const Mat4& a, const Mat4& b, float tolerance) {
    for (size_t r = 0; r < 4; ++r)
        for (size_t c = 0; c < 4; ++c) {
            const float d = a[r][c] - b[r][c];
            if (!(d <= tolerance * std::max(1.0f, std::fabs(b[r][c])) && -d <= tolerance * std::max(1.0f, std::fabs(b[r][c])))) return false;
        }
    return true;
}

int vectors(const std::string& path) {
    const nlohmann::json v = scenetest::loadScene(path);
    for (const auto& c : v.at("sineCosine")) {
        const auto [s, co] = EeArithmetic::sineCosine(scene::hexFloat(c.at("angle")));
        CHECK(sameBits(s, c.at("sine"), "sineCosine sine") && sameBits(co, c.at("cosine"), "sineCosine cosine"));
    }
    for (const auto& c : v.at("rotMatrix")) {
        const Mat4 m = mat(c.at("m"));
        const Vec4 angles = vec(c.at("angles"));
        const Mat4 got = Ee::rotMatrix(m, angles);
        CHECK(same(got, c.at("out"), "rotMatrix"));
        if (std::fabs(angles[0]) <= 3.14f && std::fabs(angles[1]) <= 3.14f && std::fabs(angles[2]) <= 3.14f) CHECK(near(Native::rotMatrix(m, angles), got, 1e-4f));
        if (m == Ee::unitMatrix()) CHECK(same(Ee::rotMatrix(angles), c.at("out"), "rotMatrix of the unit matrix"));
    }
    for (const auto& c : v.at("mulMatrix")) {
        const Mat4 got = Ee::mulMatrix(mat(c.at("a")), mat(c.at("b")));
        CHECK(same(got, c.at("out"), "mulMatrix"));
        CHECK(near(Native::mulMatrix(mat(c.at("a")), mat(c.at("b"))), got, 1e-4f));
    }
    for (const auto& c : v.at("transMatrix")) CHECK(same(Ee::transMatrix(mat(c.at("m")), vec(c.at("t"))), c.at("out"), "transMatrix"));
    for (const auto& c : v.at("subVector")) CHECK(same(Ee::subVector(vec(c.at("a")), vec(c.at("b"))), c.at("out"), "subVector"));
    for (const auto& c : v.at("cameraMatrix")) {
        const Mat4 got = Ee::cameraMatrix(vec(c.at("p")), vec(c.at("z")), vec(c.at("y")));
        CHECK(same(got, c.at("out"), "cameraMatrix"));
        CHECK(near(Native::cameraMatrix(vec(c.at("p")), vec(c.at("z")), vec(c.at("y"))), got, 1e-3f));
    }
    for (const auto& c : v.at("viewScreenMatrix")) {
        const auto& a = c.at("args");
        const auto f = [&](size_t i) { return scene::hexFloat(a.at(i)); };
        const Mat4 got = Ee::viewScreenMatrix(f(0), f(1), f(2), f(3), f(4), f(5), f(6), f(7), f(8));
        CHECK(same(got, c.at("out"), "viewScreenMatrix"));
        CHECK(near(Native::viewScreenMatrix(f(0), f(1), f(2), f(3), f(4), f(5), f(6), f(7), f(8)), got, 1e-3f));
    }
    for (const auto& c : v.at("normalLightMatrix")) CHECK(same(Ee::normalLightMatrix(vec(c.at("l0")), vec(c.at("l1")), vec(c.at("l2"))), c.at("out"), "normalLightMatrix"));
    for (const auto& c : v.at("clipAll")) {
        std::vector<Vec4> vertices;
        for (size_t i = 0; i < c.at("vertices").size(); i += 4) vertices.push_back(vec(c.at("vertices"), i));
        CHECK(Ee::clipAll(vec(c.at("min")), vec(c.at("max")), mat(c.at("m")), vertices) == (c.at("clipped").get<int>() != 0));
    }
    return 0;
}

uint32_t wordAt(const openingtest::Bytes& bytes, size_t at) {
    uint32_t u;
    std::memcpy(&u, bytes.data() + at, 4);
    return u;
}
float floatAt(const openingtest::Bytes& bytes, size_t at) { return scene::asFloat(wordAt(bytes, at)); }
Vec4 vectorAt(const openingtest::Bytes& bytes, size_t at) { return {floatAt(bytes, at), floatAt(bytes, at + 4), floatAt(bytes, at + 8), floatAt(bytes, at + 12)}; }
Mat4 matrixAt(const openingtest::Bytes& bytes, size_t at) { return {vectorAt(bytes, at), vectorAt(bytes, at + 16), vectorAt(bytes, at + 32), vectorAt(bytes, at + 48)}; }

bool sameMatrix(const Mat4& got, const Mat4& want, size_t& values) {
    for (size_t r = 0; r < 4; ++r)
        for (size_t c = 0; c < 4; ++c) {
            ++values;
            if (scene::floatBits(got[r][c]) != scene::floatBits(want[r][c])) return false;
        }
    return true;
}

// facts/opening.md 4.6, verify_opening_inputs.mjs: the camera's roll, view, view-to-screen, product and light directions.
int probedMatrices(const std::string& path) {
    const auto fixture = openingtest::OpeningFixture::load(path);
    size_t frames = 0, values = 0, sines = 0;
    for (size_t k = 0; k < fixture.frameCount(); ++k)
        for (const auto& probe : fixture.records(k, "inputs")) {
            if (probe.k != 2 || probe.mem.size() < 5 || probe.mem[0].empty() || probe.mem[1].empty()) continue;
            const auto& block = probe.mem[0];
            const auto& camera = probe.mem[1];
            const float roll = floatAt(probe.mem[4], 0);
            CHECK(scene::floatBits(EeArithmetic::sinf(roll)) == wordAt(camera, 0x20));
            CHECK(scene::floatBits(EeArithmetic::cosf(roll)) == wordAt(camera, 0x24));
            sines += 2;
            const Mat4 view = Ee::cameraMatrix(vectorAt(camera, 0), vectorAt(camera, 0x10), vectorAt(camera, 0x20));
            CHECK(sameMatrix(view, matrixAt(block, 0x100), values));
            const Mat4 screen = Ee::viewScreenMatrix(1024.0f, floatAt(probe.mem[2], 0), floatAt(probe.mem[2], 4), 2048.0f, 2048.0f, 1.0f,
                                                     floatAt(probe.mem[3], 0), 1.0f, 65536.0f);
            CHECK(sameMatrix(screen, matrixAt(block, 0x140), values));
            CHECK(sameMatrix(Ee::mulMatrix(screen, view), matrixAt(block, 0xc0), values));
            CHECK(sameMatrix(Ee::normalLightMatrix(vectorAt(camera, 0x30), vectorAt(camera, 0x40), vectorAt(camera, 0x50)), matrixAt(block, 0x200), values));
            ++frames;
        }
    CHECK(frames > 0);
    std::printf("probed matrices: %zu frames, %zu sine/cosine results, %zu matrix values equal\n", frames, sines, values);
    return 0;
}

// verify_opening_inputs.mjs: the cubes' turn, world, normals and screen matrices at 0x002207c0.
int probedCubes(const std::string& path) {
    const auto fixture = openingtest::OpeningFixture::load(path);
    size_t cubes = 0, values = 0;
    for (size_t k = 0; k < fixture.frameCount(); ++k)
        for (const auto& probe : fixture.records(k, "cubes")) {
            if (probe.k != 1 || probe.mem.size() < 8 || probe.mem[0].empty() || probe.mem[7].empty()) continue;
            const auto& record = probe.mem[0];
            const auto& block = probe.mem[7];
            const Mat4 turned = Ee::rotMatrix(matrixAt(block, 0), vectorAt(record, 0x450));
            CHECK(sameMatrix(turned, matrixAt(block, 0x240), values));
            const Mat4 world = Ee::transMatrix(turned, vectorAt(record, 0x460));
            CHECK(sameMatrix(world, matrixAt(block, 0x80), values));
            CHECK(sameMatrix(Ee::mulMatrix(matrixAt(block, 0x200), turned), matrixAt(block, 0x180), values));
            CHECK(sameMatrix(Ee::mulMatrix(matrixAt(block, 0xc0), world), matrixAt(block, 0x40), values));
            ++cubes;
        }
    CHECK(cubes > 0);
    std::printf("probed cubes: %zu cubes, %zu matrix values equal\n", cubes, values);
    return 0;
}

}

int main(int argc, char** argv) {
    return scenetest::run(argc, argv, [](int count, char** arguments) {
        if (count < 2) {
            std::fprintf(stderr, "usage: Vu0Test <vu0_vectors.json> [inputs opening.json] [full opening.json]\n");
            return 2;
        }
        if (int failed = vectors(arguments[1])) return failed;
        if (count > 2 && std::filesystem::exists(arguments[2]))
            if (int failed = probedMatrices(arguments[2])) return failed;
        if (count > 3 && std::filesystem::exists(arguments[3]))
            if (int failed = probedCubes(arguments[3])) return failed;
        std::printf("vu0: all equal bit for bit\n");
        return 0;
    });
}
