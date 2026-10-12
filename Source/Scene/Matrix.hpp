#pragma once
#include <array>
#include <cstdint>

#include "Scene/Arithmetic.hpp"

namespace scene {

using Vec3 = std::array<float, 3>;
using Vec4 = std::array<float, 4>;
using Mat4 = std::array<Vec4, 4>;

// The clock's matrix routines, rows as the EE holds them (facts/clock-camera.md).
template <class A>
struct Matrix {
    static Mat4 identity() { return {{{1, 0, 0, 0}, {0, 1, 0, 0}, {0, 0, 1, 0}, {0, 0, 0, 1}}}; }

    // sceVu0ApplyMatrix: VMULAx, VMADDAy, VMADDAz, VMADDw.
    static Vec4 apply(const Mat4& m, const Vec4& v) {
        Vec4 out{};
        for (int i = 0; i < 4; ++i)
            out[i] = A::add(A::add(A::add(A::mul(m[0][i], v[0]), A::mul(m[1][i], v[1])), A::mul(m[2][i], v[2])), A::mul(m[3][i], v[3]));
        return out;
    }

    // sceVu0MulMatrix(out, a, b): each row of b through a.
    static Mat4 multiply(const Mat4& a, const Mat4& b) {
        Mat4 out{};
        for (int r = 0; r < 4; ++r) out[r] = apply(a, b[r]);
        return out;
    }

    static Mat4 rotateX(const Mat4& m, int32_t angle) {
        const float c = A::cos16(angle), s = A::sin16(angle);
        return multiply(m, {{{1, 0, 0, 0}, {0, c, s, 0}, {0, -s, c, 0}, {0, 0, 0, 1}}});
    }
    static Mat4 rotateY(const Mat4& m, int32_t angle) {
        const float c = A::cos16(angle), s = A::sin16(angle);
        return multiply(m, {{{c, 0, -s, 0}, {0, 1, 0, 0}, {s, 0, c, 0}, {0, 0, 0, 1}}});
    }
    static Mat4 rotateZ(const Mat4& m, int32_t angle) {
        const float c = A::cos16(angle), s = A::sin16(angle);
        return multiply(m, {{{c, s, 0, 0}, {-s, c, 0, 0}, {0, 0, 1, 0}, {0, 0, 0, 1}}});
    }
    static Mat4 move(const Mat4& m, float x, float y, float z) { return {m[0], m[1], m[2], apply(m, {x, y, z, 1})}; }

    static Vec3 normalize(const Vec3& v) {
        const float length = A::sqrt(A::add(A::add(A::mul(v[0], v[0]), A::mul(v[1], v[1])), A::mul(v[2], v[2])));
        const float inverse = A::div(1.0f, length);
        return {A::mul(v[0], inverse), A::mul(v[1], inverse), A::mul(v[2], inverse)};
    }
    static float dot(const Vec3& a, const Vec3& b) { return A::add(A::add(A::mul(a[0], b[0]), A::mul(a[1], b[1])), A::mul(a[2], b[2])); }

    // sceVu0ViewScreenMatrix.
    static Mat4 viewScreen(float scrz, float ax, float ay, float cx, float cy, float zmin, float zmax, float nearz, float farz) {
        const float range = A::add(-zmin, zmax);
        const float depth = A::add(-nearz, farz);
        const float az = A::div(A::mul(A::mul(farz, nearz), range), depth);
        const float cz = A::div(A::add(A::mul(-zmax, nearz), A::mul(zmin, farz)), depth);
        const Mat4 m{{{scrz, 0, 0, 0}, {0, scrz, 0, 0}, {0, 0, 0, 1}, {0, 0, 1, 0}}};
        const Mat4 mt{{{ax, 0, 0, 0}, {0, ay, 0, 0}, {0, 0, az, 0}, {cx, cy, cz, 1}}};
        return multiply(mt, m);
    }

    // The view matrix builder (HDD module_clock_238DC0): rotation X, Y, Z in radians, the three
    // vectors through it, then sceVu0CameraMatrix.
    static Mat4 viewMatrix(const Vec4& position, const Vec4& direction, const Vec4& up, const Vec4& rotation) {
        Mat4 m = identity();
        m = cameraRotateZ(cameraRotateY(cameraRotateX(m, rotation[0]), rotation[1]), rotation[2]);
        const Vec4 zd = apply(m, direction), yd = apply(m, up), p = apply(m, position);
        const Vec4 x = cameraNormalize(outer(yd, zd));
        const Vec4 z = cameraNormalize(zd);
        const Vec4 y = outer(z, x);
        const Vec4 t{A::add(0.0f, p[0]), A::add(0.0f, p[1]), A::add(0.0f, p[2]), 1.0f};
        Mat4 out{};
        for (int i = 0; i < 3; ++i) out[i] = {x[i], y[i], z[i], 0.0f};
        for (int i = 0; i < 3; ++i)
            out[3][i] = A::sub(0.0f, A::add(A::add(A::mul(out[0][i], t[0]), A::mul(out[1][i], t[1])), A::mul(out[2][i], t[2])));
        out[3][3] = t[3];
        return out;
    }

private:
    static Mat4 cameraRotateX(const Mat4& m, float radians) {
        const auto [s, c] = A::sineCosine(radians);
        return multiply({{{1, 0, 0, 0}, {0, c, s, 0}, {0, A::sub(0.0f, s), c, 0}, {0, 0, 0, 1}}}, m);
    }
    static Mat4 cameraRotateY(const Mat4& m, float radians) {
        const auto [s, c] = A::sineCosine(radians);
        return multiply({{{c, 0, A::sub(0.0f, s), 0}, {0, 1, 0, 0}, {s, 0, c, 0}, {0, 0, 0, 1}}}, m);
    }
    static Mat4 cameraRotateZ(const Mat4& m, float radians) {
        const auto [s, c] = A::sineCosine(radians);
        return multiply({{{c, s, 0, 0}, {A::sub(0.0f, s), c, 0, 0}, {0, 0, 1, 0}, {0, 0, 0, 1}}}, m);
    }
    static Vec4 outer(const Vec4& a, const Vec4& b) {
        return {A::sub(A::mul(a[1], b[2]), A::mul(b[1], a[2])), A::sub(A::mul(a[2], b[0]), A::mul(b[2], a[0])),
                A::sub(A::mul(a[0], b[1]), A::mul(b[0], a[1])), 0.0f};
    }
    static Vec4 cameraNormalize(const Vec4& v) {
        const float length = A::add(0.0f, A::vu0Root(A::add(A::add(A::mul(v[0], v[0]), A::mul(v[1], v[1])), A::mul(v[2], v[2]))));
        const float q = A::vu0Quotient(1.0f, length);
        return {A::mul(v[0], q), A::mul(v[1], q), A::mul(v[2], q), 0.0f};
    }
};

}
