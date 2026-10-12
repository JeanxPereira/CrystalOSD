#include "Audio/Lab/Plot.hpp"

#include <algorithm>
#include <cmath>
#include <complex>
#include <numbers>

namespace audio::lab {

namespace {
Image blank(uint32_t w, uint32_t h) {
    Image img{w, h, std::vector<uint8_t>(size_t(w) * h * 3)};
    for (size_t i = 0; i < img.rgb.size(); i += 3) {
        img.rgb[i] = 24;
        img.rgb[i + 1] = 24;
        img.rgb[i + 2] = 28;
    }
    return img;
}
void put(Image& img, uint32_t x, uint32_t y, uint8_t r, uint8_t g, uint8_t b) {
    if (x >= img.width || y >= img.height) return;
    uint8_t* p = &img.rgb[(size_t(y) * img.width + x) * 3];
    p[0] = r;
    p[1] = g;
    p[2] = b;
}
void fft(std::vector<std::complex<double>>& a) {
    const size_t n = a.size();
    for (size_t i = 1, j = 0; i < n; ++i) {
        size_t bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) std::swap(a[i], a[j]);
    }
    for (size_t len = 2; len <= n; len <<= 1) {
        const double angle = 2 * std::numbers::pi / double(len);
        const std::complex<double> w(std::cos(angle), -std::sin(angle));
        for (size_t i = 0; i < n; i += len) {
            std::complex<double> k(1);
            for (size_t j = 0; j < len / 2; ++j, k *= w) {
                const auto u = a[i + j], v = a[i + j + len / 2] * k;
                a[i + j] = u + v;
                a[i + j + len / 2] = u - v;
            }
        }
    }
}
}

Image plotWaveform(std::span<const int16_t> s, uint32_t width, uint32_t height) {
    Image img = blank(width, height);
    if (width == 0 || height == 0) return img;
    for (uint32_t x = 0; x < width; ++x) put(img, x, height / 2, 70, 70, 80);
    const size_t frames = s.size() / 2;
    if (frames == 0) return img;
    const auto row = [&](int v) { return uint32_t(std::clamp((32767 - v) * int64_t(height - 1) / 65535, int64_t(0), int64_t(height - 1))); };
    for (uint32_t x = 0; x < width; ++x) {
        const size_t from = size_t(x) * frames / width;
        const size_t to = std::max(from + 1, size_t(x + 1) * frames / width);
        int lo = 32767, hi = -32768;
        for (size_t i = from; i < to && i < frames; ++i) {
            lo = std::min<int>(lo, s[2 * i]);
            hi = std::max<int>(hi, s[2 * i]);
        }
        if (lo > hi) continue;
        for (uint32_t y = row(hi); y <= row(lo); ++y) put(img, x, y, 235, 235, 235);
    }
    return img;
}

Image plotSpectrum(std::span<const int16_t> s, uint32_t sampleRate, uint32_t width, uint32_t height) {
    Image img = blank(width, height);
    if (width == 0 || height == 0) return img;
    const size_t frames = s.size() / 2;
    if (frames < 2) return img;
    size_t n = 1;
    while (n * 2 <= std::min<size_t>(frames, 4096)) n *= 2;
    std::vector<std::complex<double>> a(n);
    for (size_t i = 0; i < n; ++i) a[i] = double(s[2 * i]) / 32768.0 * (0.5 - 0.5 * std::cos(2 * std::numbers::pi * double(i) / double(n)));
    fft(a);
    const double fMin = 20.0, fMax = sampleRate / 2.0;
    for (uint32_t x = 0; x < width; ++x) {
        const double f = fMin * std::pow(fMax / fMin, double(x) / double(std::max<uint32_t>(1, width - 1)));
        const size_t bin = std::min(n / 2, size_t(std::lround(f * double(n) / sampleRate)));
        const double mag = std::abs(a[bin]) * 4.0 / double(n);
        const double db = std::clamp(20 * std::log10(std::max(mag, 1e-12)), -100.0, 0.0);
        const uint32_t top = uint32_t((-db) / 100.0 * double(height - 1));
        for (uint32_t y = top; y < height; ++y) put(img, x, y, 90, 200, 120);
    }
    return img;
}

Distance distance(std::span<const int16_t> a, std::span<const int16_t> b) {
    Distance d;
    const size_t n = std::max(a.size(), b.size());
    double sum = 0;
    for (size_t i = 0; i < n; ++i) {
        const int64_t x = i < a.size() ? a[i] : 0, y = i < b.size() ? b[i] : 0;
        const int64_t diff = std::abs(x - y);
        if (diff != 0) ++d.differ;
        d.maxAbs = std::max(d.maxAbs, diff);
        sum += double(diff) * double(diff);
    }
    d.rms = n == 0 ? 0 : std::sqrt(sum / double(n));
    return d;
}

}
