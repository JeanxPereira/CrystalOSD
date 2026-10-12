#include "Scene/Arithmetic.hpp"

#include <array>
#include <cmath>
#include <limits>

namespace scene {

namespace {

using Ee = EeArithmetic;

float flush(float x) { return x != 0.0f && std::fabs(x) < kMinNormal ? (x < 0.0f ? -0.0f : 0.0f) : x; }

const std::array<float, 0x4001>& sineTable() {
    static const std::array<float, 0x4001> table = [] {
        std::array<float, 0x4001> t{};
        for (int i = 0; i <= 0x4000; ++i) t[i] = static_cast<float>(std::sin(static_cast<double>(i) * 1.5707963267948966 / 16385.0));
        return t;
    }();
    return table;
}

// HDD OSD 1.10U libm (facts/config-cubes.md, References/model/ee_libm.mjs): cosf 0x00294B28,
// __kernel_cosf 0x00296CF8, __kernel_sinf 0x002977A0, __ieee754_rem_pio2f 0x00295850.
const float C1 = asFloat(0x3d2aaaab), C2 = asFloat(0xbab60b61), C3 = asFloat(0x37d00d01), C4 = asFloat(0xb493f27c), C5 = asFloat(0x310f74f6),
            C6 = asFloat(0xad47d74e);
const float S1 = asFloat(0xbe2aaaab), S2 = asFloat(0x3c088889), S3 = asFloat(0xb9500d01), S4 = asFloat(0x3638ef1b), S5 = asFloat(0xb2d72f34),
            S6 = asFloat(0x2f2ec9d3);
const float INVPIO2 = asFloat(0x3f22f984), PIO2_1 = asFloat(0x3fc90f80), PIO2_1T = asFloat(0x37354443), PIO2_2 = asFloat(0x37354400),
            PIO2_2T = asFloat(0x2e85a308), PIO2_3 = asFloat(0x2e85a300), PIO2_3T = asFloat(0x248d3132);
constexpr uint32_t NPIO2_HW[32] = {
    0x3fc90f00, 0x40490f00, 0x4096cb00, 0x40c90f00, 0x40fb5300, 0x4116cb00, 0x412fed00, 0x41490f00, 0x41623100, 0x417b5300, 0x418a3a00,
    0x4196cb00, 0x41a35c00, 0x41afed00, 0x41bc7e00, 0x41c90f00, 0x41d5a000, 0x41e23100, 0x41eec200, 0x41fb5300, 0x4203f200, 0x420a3a00,
    0x42108300, 0x4216cb00, 0x421d1400, 0x42235c00, 0x4229a500, 0x422fed00, 0x42363600, 0x423c7e00, 0x4242c700, 0x42490f00};

float cosKernel(float x, float y) {
    const uint32_t ix = floatBits(x) & 0x7fffffffu;
    if (ix <= 0x31ffffffu && Ee::toInt(x) == 0) return 1.0f;
    const float z = Ee::mul(x, x);
    float p = Ee::mul(z, C6);
    p = Ee::add(p, C5); p = Ee::mul(z, p);
    p = Ee::add(p, C4); p = Ee::mul(z, p);
    p = Ee::add(p, C3); p = Ee::mul(z, p);
    p = Ee::add(p, C2); p = Ee::mul(z, p);
    p = Ee::add(p, C1);
    const float r = Ee::mul(z, p);
    if (ix <= 0x3e999999u) return Ee::sub(1.0f, Ee::sub(Ee::mul(z, 0.5f), Ee::sub(Ee::mul(z, r), Ee::mul(x, y))));
    const float qx = ix > 0x3f480000u ? asFloat(0x3e900000u) : asFloat(ix - 0x01000000u);
    const float zr = Ee::sub(Ee::mul(z, r), Ee::mul(x, y));
    const float hz = Ee::sub(Ee::mul(z, 0.5f), qx);
    return Ee::sub(Ee::sub(1.0f, qx), Ee::sub(hz, zr));
}

float sinKernel(float x, float y, bool iy) {
    const uint32_t ix = floatBits(x) & 0x7fffffffu;
    if (ix <= 0x31ffffffu && Ee::toInt(x) == 0) return x;
    const float z = Ee::mul(x, x);
    const float v = Ee::mul(z, x);
    float p = Ee::mul(z, S6);
    p = Ee::add(p, S5); p = Ee::mul(z, p);
    p = Ee::add(p, S4); p = Ee::mul(z, p);
    p = Ee::add(p, S3); p = Ee::mul(z, p);
    const float r = Ee::add(p, S2);
    if (!iy) return Ee::add(x, Ee::mul(v, Ee::add(Ee::mul(z, r), S1)));
    return Ee::sub(x, Ee::sub(Ee::sub(Ee::mul(z, Ee::sub(Ee::mul(y, 0.5f), Ee::mul(v, r))), y), Ee::mul(v, S1)));
}

struct Reduced {
    int32_t n;
    float y0, y1;
};

// The reduction is carried as far as |x| <= 2^7 * pi/2, as the model carries it; beyond that the
// library calls __kernel_rem_pio2f, which the clock never reaches (NaN here).
Reduced remPio2(float x) {
    const int32_t hx = static_cast<int32_t>(floatBits(x));
    const uint32_t ix = static_cast<uint32_t>(hx) & 0x7fffffffu;
    if (ix <= 0x3f490fd8u) return {0, x, 0.0f};
    if (ix <= 0x4016cbe3u) {
        const bool positive = hx > 0;
        const auto step = [positive](float a, float b) { return positive ? Ee::sub(a, b) : Ee::add(a, b); };
        float z = step(x, PIO2_1);
        float t = PIO2_1T;
        if ((ix & 0xfffffff0u) == 0x3fc90fd0u) { z = step(z, PIO2_2); t = PIO2_2T; }
        const float y0 = step(z, t);
        return {positive ? 1 : -1, y0, step(Ee::sub(z, y0), t)};
    }
    if (ix > 0x43490f80u) return {0, std::nanf(""), std::nanf("")};
    const float t = std::fabs(x);
    const int32_t n = Ee::toInt(Ee::add(Ee::mul(t, INVPIO2), 0.5f));
    const float fn = static_cast<float>(n);
    float r = Ee::sub(t, Ee::mul(fn, PIO2_1));
    float w = Ee::mul(fn, PIO2_1T);
    float y0;
    if (n < 32 && (ix & 0xffffff00u) != NPIO2_HW[n - 1]) {
        y0 = Ee::sub(r, w);
    } else {
        const int32_t j = static_cast<int32_t>(ix >> 23);
        y0 = Ee::sub(r, w);
        if (j - static_cast<int32_t>((floatBits(y0) >> 23) & 0xff) > 8) {
            float before = r;
            w = Ee::mul(fn, PIO2_2);
            r = Ee::sub(before, w);
            w = Ee::sub(Ee::mul(fn, PIO2_2T), Ee::sub(Ee::sub(before, r), w));
            y0 = Ee::sub(r, w);
            if (j - static_cast<int32_t>((floatBits(y0) >> 23) & 0xff) > 25) {
                before = r;
                w = Ee::mul(fn, PIO2_3);
                r = Ee::sub(before, w);
                w = Ee::sub(Ee::mul(fn, PIO2_3T), Ee::sub(Ee::sub(before, r), w));
                y0 = Ee::sub(r, w);
            }
        }
    }
    const float y1 = Ee::sub(Ee::sub(r, y0), w);
    return hx < 0 ? Reduced{-n, -y0, -y1} : Reduced{n, y0, y1};
}

// _sceVu0ecossin behind sceVu0RotMatrix* (facts/clock-camera.md): the coefficients S5432 as x, y, z, w.
const std::array<float, 4> kEcossin = {asFloat(0x362e9c14), asFloat(0xb94fb21f), asFloat(0x3c08873e), asFloat(0xbe2aaaa4)};
const float kHalfPi = asFloat(0x3fc90fdb);

}

float EeArithmetic::cut(double x) {
    if (std::isnan(x)) return std::numeric_limits<float>::quiet_NaN();
    // 2^128 - 2^103: from here on fround gives Infinity, which the model keeps.
    if (std::fabs(x) >= 3.4028235677973366e38) return x > 0 ? std::numeric_limits<float>::infinity() : -std::numeric_limits<float>::infinity();
    float near = static_cast<float>(x);
    if (std::isfinite(near) && std::fabs(static_cast<double>(near)) > std::fabs(x)) near = down(near);
    return flush(near);
}

// The double sum can lose an addend far below the other; a sum that lands on a single with a
// remainder of the opposite sign is one step nearer zero (two-sum remainder).
float EeArithmetic::add(float a, float b) {
    const double da = a, db = b;
    const double x = da + db;
    const float near = static_cast<float>(x);
    if (static_cast<double>(near) != x || !std::isfinite(x)) return cut(x);
    const double part = x - da;
    const double rest = (da - (x - part)) + (db - part);
    if (rest == 0.0 || x == 0.0) return cut(x);
    return cut((rest > 0.0) == (x > 0.0) ? near : down(near));
}

float EeArithmetic::sub(float a, float b) { return add(a, -b); }

float EeArithmetic::mul(float a, float b) { return cut(static_cast<double>(a) * static_cast<double>(b)); }

float EeArithmetic::div(float a, float b) { return cut(static_cast<double>(a) / static_cast<double>(b)); }

float EeArithmetic::sqrt(float a) { return cut(std::sqrt(static_cast<double>(a))); }

float EeArithmetic::vu0Quotient(float a, float b) {
    float q = cut(static_cast<double>(a) / static_cast<double>(b));
    while (static_cast<double>(q) * b > a) q = down(q);
    return q;
}

float EeArithmetic::vu0Root(float a) {
    const double x = std::fabs(static_cast<double>(a));
    float r = cut(std::sqrt(x));
    while (static_cast<double>(r) * r > x) r = down(r);
    return r;
}

int32_t EeArithmetic::toInt(float x) {
    if (std::isnan(x)) return 0;
    if (x >= 2147483647.0f) return INT32_MAX;
    if (x <= -2147483648.0f) return INT32_MIN;
    return static_cast<int32_t>(x);
}

uint32_t EeArithmetic::toUnsigned(float x) {
    if (!(x > 0.0f) || std::isinf(x)) return 0;
    return static_cast<uint32_t>(static_cast<uint64_t>(std::fmod(std::trunc(static_cast<double>(x)), 4294967296.0)));
}

// The clock's sine: a quarter wave of 0x4001 entries; the divisor is 16385 (facts/clock-camera.md).
float EeArithmetic::sin16(int32_t angle) {
    const int32_t a = s16(angle);
    int32_t v = a < 0 ? -a : a;
    if (v >= 0x4000) v = 0x8000 - v;
    const float s = sineTable()[static_cast<size_t>(v)];
    return a < 0 ? -s : s;
}

float EeArithmetic::cos16(int32_t angle) { return sin16(s16(angle) + 0x4000); }

float EeArithmetic::cosf(float x) {
    const uint32_t ix = floatBits(x) & 0x7fffffffu;
    if (ix <= 0x3f490fd8u) return cosKernel(x, 0.0f);
    if (ix > 0x7f7fffffu) return sub(x, x);
    const Reduced r = remPio2(x);
    switch (r.n & 3) {
        case 0: return cosKernel(r.y0, r.y1);
        case 1: return -sinKernel(r.y0, r.y1, true);
        case 2: return -cosKernel(r.y0, r.y1);
        default: return sinKernel(r.y0, r.y1, true);
    }
}

float EeArithmetic::sinf(float x) {
    const uint32_t ix = floatBits(x) & 0x7fffffffu;
    if (ix <= 0x3f490fd8u) return sinKernel(x, 0.0f, false);
    if (ix > 0x7f7fffffu) return std::numeric_limits<float>::quiet_NaN();
    const Reduced r = remPio2(x);
    switch (r.n & 3) {
        case 0: return sinKernel(r.y0, r.y1, true);
        case 1: return cosKernel(r.y0, r.y1);
        case 2: return -sinKernel(r.y0, r.y1, true);
        default: return -cosKernel(r.y0, r.y1);
    }
}

float EeArithmetic::addExact(float a, float b) { return add(a, b); }

float EeArithmetic::subExact(float a, float b) { return sub(a, b); }

// opening-lib quotient: a division by zero gives the largest single, not infinity.
float EeArithmetic::quotientExact(float a, float b) {
    if (b == 0.0f) return (a < 0.0f || (a == 0.0f && std::signbit(a))) != std::signbit(b) ? -kMaxFloat : kMaxFloat;
    float q = cut(static_cast<double>(a) / static_cast<double>(b));
    if (std::fabs(static_cast<double>(q) * b) > std::fabs(static_cast<double>(a))) q = down(q);
    return q;
}

float EeArithmetic::rootExact(float a) { return vu0Root(a); }

std::pair<float, float> EeArithmetic::sineCosine(float radians) {
    const bool negative = radians < 0.0f;
    const float t = negative ? add(kHalfPi, radians) : sub(kHalfPi, radians);
    const float t2 = mul(t, t);
    std::array<float, 4> v{};
    for (int i = 0; i < 4; ++i) v[i] = mul(mul(kEcossin[i], t), t2);
    for (int i = 0; i < 3; ++i) v[i] = mul(v[i], t2);
    float sum = add(t, v[3]);
    for (int i = 0; i < 2; ++i) v[i] = mul(v[i], t2);
    sum = add(sum, v[2]);
    v[0] = mul(v[0], t2);
    sum = add(sum, v[1]);
    sum = add(sum, v[0]);
    const float cosine = add(0.0f, sum);
    const float q = add(0.0f, vu0Root(sub(1.0f, mul(cosine, cosine))));
    return {negative ? sub(0.0f, q) : add(0.0f, q), cosine};
}

}
