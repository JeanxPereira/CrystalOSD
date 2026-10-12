#pragma once
#include <span>

#include "Scene/Arithmetic.hpp"
#include "Scene/Matrix.hpp"

namespace scene::opening {

// libvu0 as the opening calls it (facts/opening.md 4.6): References/model/opening-lib.mjs with the exact add, sub,
// quotient and root of its _v2 verifiers; rows as the EE holds them.
template <class A>
struct Vu0 {
    static Mat4 unitMatrix() { return {{{1, 0, 0, 0}, {0, 1, 0, 0}, {0, 0, 1, 0}, {0, 0, 0, 1}}}; }

    // opening-lib combine: rows[0] * v.x + rows[1] * v.y + rows[2] * v.z + rows[3] * v.w.
    static Vec4 apply(const Mat4& rows, const Vec4& v) {
        Vec4 out{};
        for (int i = 0; i < 4; ++i)
            out[i] = A::addExact(A::addExact(A::addExact(A::mul(rows[0][i], v[0]), A::mul(rows[1][i], v[1])), A::mul(rows[2][i], v[2])), A::mul(rows[3][i], v[3]));
        return out;
    }

    // sceVu0MulMatrix 0x0027AE48: each row of b through a.
    static Mat4 mulMatrix(const Mat4& a, const Mat4& b) {
        Mat4 out{};
        for (int r = 0; r < 4; ++r) out[r] = apply(a, b[r]);
        return out;
    }

    // sceVu0RotMatrix 0x0027B3D8: Z, then Y, then X (angles x, y, z), each through _sceVu0ecossin.
    static Mat4 rotMatrix(const Mat4& m, const Vec4& angles) { return rotX(rotY(rotZ(m, angles[2]), angles[1]), angles[0]); }
    static Mat4 rotMatrix(const Vec4& angles) { return rotMatrix(unitMatrix(), angles); }

    // sceVu0TransMatrix 0x0027B098: rows 0..2 copied, row 3 xyz plus t xyz, w kept.
    static Mat4 transMatrix(const Mat4& m, const Vec4& t) {
        return {m[0], m[1], m[2], {A::addExact(m[3][0], t[0]), A::addExact(m[3][1], t[1]), A::addExact(m[3][2], t[2]), m[3][3]}};
    }

    // sceVu0SubVector 0x0027B050.
    static Vec4 subVector(const Vec4& a, const Vec4& b) {
        return {A::subExact(a[0], b[0]), A::subExact(a[1], b[1]), A::subExact(a[2], b[2]), A::subExact(a[3], b[3])};
    }

    // sceVu0CameraMatrix 0x0027B450 (opening-lib cameraMatrix(p, zd, yd)).
    static Mat4 cameraMatrix(const Vec4& position, const Vec4& direction, const Vec4& up) {
        const Vec4 x = normalize(outer(up, direction));
        const Vec4 z = normalize(direction);
        const Vec4 y = outer(z, x);
        const Vec4 t{position[0], position[1], position[2], 1.0f};
        Mat4 out{};
        for (int i = 0; i < 3; ++i) out[i] = {x[i], y[i], z[i], 0.0f};
        for (int i = 0; i < 3; ++i)
            out[3][i] = A::subExact(0.0f, A::addExact(A::addExact(A::mul(out[0][i], t[0]), A::mul(out[1][i], t[1])), A::mul(out[2][i], t[2])));
        out[3][3] = t[3];
        return out;
    }

    // sceVu0ViewScreenMatrix 0x0027B628 (opening-lib viewScreenMatrix).
    static Mat4 viewScreenMatrix(float distance, float ax, float ay, float cx, float cy, float zmin, float zmax, float nearz, float farz) {
        const float depth = A::addExact(-nearz, farz);
        const float cz = A::quotientExact(A::addExact(A::mul(-zmax, nearz), A::mul(zmin, farz)), depth);
        const float az = A::quotientExact(A::mul(A::mul(farz, nearz), A::addExact(-zmin, zmax)), depth);
        Mat4 first = unitMatrix();
        first[0][0] = distance; first[1][1] = distance; first[2][2] = 0; first[3][3] = 0; first[2][3] = 1; first[3][2] = 1;
        Mat4 second = unitMatrix();
        second[0][0] = ax; second[1][1] = ay; second[2][2] = az; second[3][0] = cx; second[3][1] = cy; second[3][2] = cz;
        return mulMatrix(second, first);
    }

    // sceVu0NormalLightMatrix (verify_opening_inputs.mjs normalLight): the three light directions negated and
    // normalised become the columns of the matrix; the fourth column is (0, 0, 0, 1).
    static Mat4 normalLightMatrix(const Vec4& l0, const Vec4& l1, const Vec4& l2) {
        const Vec4 rows[4] = {normalize(negate(l0)), normalize(negate(l1)), normalize(negate(l2)), {0, 0, 0, 1}};
        Mat4 out{};
        for (int r = 0; r < 4; ++r)
            for (int c = 0; c < 4; ++c) out[r][c] = rows[c][r];
        return out;
    }

    // sceVu0ClipAll 0x0027BA70 (verify_opening_lights_v2.mjs clipAll): true when no vertex is strictly inside
    // min..max in x and y (scaled by w) and in w.
    static bool clipAll(const Vec4& min, const Vec4& max, const Mat4& m, std::span<const Vec4> vertices) {
        for (const Vec4& v : vertices) {
            const Vec4 p = apply(m, v);
            const float d[6] = {A::subExact(p[0], A::mul(min[0], p[3])), A::subExact(p[1], A::mul(min[1], p[3])), A::subExact(p[3], min[3]),
                                A::subExact(A::mul(max[0], p[3]), p[0]), A::subExact(A::mul(max[1], p[3]), p[1]), A::subExact(max[3], p[3])};
            bool inside = true;
            for (float x : d) inside = inside && x > 0.0f;
            if (inside) return false;
        }
        return true;
    }

private:
    static Mat4 rotX(const Mat4& m, float a) {
        const auto [s, c] = A::sineCosine(a);
        return mulMatrix({{{1, 0, 0, 0}, {0, c, s, 0}, {0, minus(s), c, 0}, {0, 0, 0, 1}}}, m);
    }
    static Mat4 rotY(const Mat4& m, float a) {
        const auto [s, c] = A::sineCosine(a);
        return mulMatrix({{{c, 0, minus(s), 0}, {0, 1, 0, 0}, {s, 0, c, 0}, {0, 0, 0, 1}}}, m);
    }
    static Mat4 rotZ(const Mat4& m, float a) {
        const auto [s, c] = A::sineCosine(a);
        return mulMatrix({{{c, s, 0, 0}, {minus(s), c, 0, 0}, {0, 0, 1, 0}, {0, 0, 0, 1}}}, m);
    }
    static float minus(float s) { return A::cut(0.0 - static_cast<double>(s)); }
    static Vec4 negate(const Vec4& l) { return {A::mul(l[0], -1.0f), A::mul(l[1], -1.0f), A::mul(l[2], -1.0f), A::mul(l[3], -1.0f)}; }
    static Vec4 outer(const Vec4& a, const Vec4& b) {
        return {A::subExact(A::mul(a[1], b[2]), A::mul(b[1], a[2])), A::subExact(A::mul(a[2], b[0]), A::mul(b[2], a[0])),
                A::subExact(A::mul(a[0], b[1]), A::mul(b[0], a[1])), 0.0f};
    }
    static Vec4 normalize(const Vec4& v) {
        const float length = A::rootExact(A::addExact(A::addExact(A::mul(v[0], v[0]), A::mul(v[1], v[1])), A::mul(v[2], v[2])));
        const float q = A::quotientExact(1.0f, length);
        return {A::mul(v[0], q), A::mul(v[1], q), A::mul(v[2], q), 0.0f};
    }
};

}
