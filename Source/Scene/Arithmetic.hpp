#pragma once
#include <bit>
#include <cmath>
#include <cstdint>
#include <utility>

#include <xmmintrin.h>

namespace scene {

inline uint32_t floatBits(float x) { return std::bit_cast<uint32_t>(x); }
inline float asFloat(uint32_t bits) { return std::bit_cast<float>(bits); }
inline float down(float x) { return asFloat(floatBits(x) - 1u); }
inline int32_t s16(int32_t x) { return static_cast<int16_t>(static_cast<uint16_t>(x)); }
inline int32_t u16(int32_t x) { return x & 0xffff; }

constexpr float kMaxFloat = 3.4028234663852886e38f;
constexpr float kMinNormal = 1.1754943508222875e-38f;

// The EE's single precision as the JS model computes it (References/model/clock_math.mjs; facts
// page per caller): every result cut toward zero, no denormals. Out of line, built strict.
struct EeArithmetic {
    static float cut(double x);                       // clock_math f: a double cut toward zero; past the singles, +-Infinity as fround gives
    static float add(float a, float b);               // clock_math add
    static float sub(float a, float b);               // clock_math sub
    static float mul(float a, float b);               // model f(a * b)
    static float div(float a, float b);               // model f(a / b): x/0 is +-Infinity, 0/0 NaN
    static float sqrt(float a);                       // model f(Math.sqrt(a)): a negative argument is NaN
    static float vu0Quotient(float a, float b);       // clock_camera quotient: f(a / b) stepped down while q * b > a
    static float vu0Root(float a);                    // clock_camera root: f(sqrt(|a|)) stepped down while r * r > |a|
    static int32_t toInt(float x);                    // clock_math toInt (NaN gives 0)
    static uint32_t toUnsigned(float x);              // clock_math toUnsigned
    static float sin16(int32_t angle);                // clock_math sin: the 16385 table
    static float cos16(int32_t angle);                // clock_math cos
    static float cosf(float x);                       // ee_libm cosf; opening-libm cosf is equal over the opening's range (checked)
    static float sinf(float x);                       // opening-libm sinf: __kernel_sinf, __ieee754_rem_pio2f up to 2^7 pi/2
    static float addExact(float a, float b);          // opening-lib add (facts/opening.md 4.6)
    static float subExact(float a, float b);          // opening-lib sub
    static float quotientExact(float a, float b);     // opening-lib quotient: x/0 is the largest single of the sign
    static float rootExact(float a);                  // opening-lib root
    static std::pair<float, float> sineCosine(float radians);  // clock_camera sineCosine: {sine, cosine}
};

class EeRounding {
public:
    EeRounding() : m_saved(_mm_getcsr()) { _mm_setcsr(m_saved | 0x6000u | 0x8000u | 0x40u); }
    ~EeRounding() { _mm_setcsr(m_saved); }
    EeRounding(const EeRounding&) = delete;
    EeRounding& operator=(const EeRounding&) = delete;

private:
    unsigned m_saved;
};

struct NativeArithmetic {
    static float cut(double x) { return static_cast<float>(x); }
    static float add(float a, float b) { return a + b; }
    static float sub(float a, float b) { return a - b; }
    static float mul(float a, float b) { return a * b; }
    static float div(float a, float b) { return a / b; }
    static float sqrt(float a) { return std::sqrt(a); }
    static float vu0Quotient(float a, float b) { return a / b; }
    static float vu0Root(float a) { return std::sqrt(std::fabs(a)); }
    static int32_t toInt(float x) {
        if (std::isnan(x)) return 0;
        if (x >= 2147483647.0f) return INT32_MAX;
        if (x <= -2147483648.0f) return INT32_MIN;
        return static_cast<int32_t>(x);
    }
    static uint32_t toUnsigned(float x) { return x > 0.0f && x < 4294967296.0f ? static_cast<uint32_t>(x) : 0u; }
    static float sin16(int32_t angle) {
        const int32_t a = s16(angle);
        int32_t v = a < 0 ? -a : a;
        if (v >= 0x4000) v = 0x8000 - v;
        const float s = std::sin(static_cast<float>(v) * (1.5707963267948966f / 16385.0f));
        return a < 0 ? -s : s;
    }
    static float cos16(int32_t angle) { return sin16(s16(angle) + 0x4000); }
    static float cosf(float x) { return std::cos(x); }
    static float sinf(float x) { return std::sin(x); }
    static float addExact(float a, float b) { return a + b; }
    static float subExact(float a, float b) { return a - b; }
    static float quotientExact(float a, float b) {
        if (b == 0.0f) return (a < 0.0f || (a == 0.0f && std::signbit(a))) != std::signbit(b) ? -kMaxFloat : kMaxFloat;
        return a / b;
    }
    static float rootExact(float a) { return std::sqrt(std::fabs(a)); }
    static std::pair<float, float> sineCosine(float radians) { return {std::sin(radians), std::cos(radians)}; }
};

}
