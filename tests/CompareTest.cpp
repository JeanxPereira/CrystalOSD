#include "Check.hpp"
#include "Parity/Compare.hpp"

int main() {
    parity::Image a{2, 2, std::vector<uint8_t>(16, 10)}, b = a;
    b.rgba[0] = 11;
    b.rgba[5] = 13;
    b.rgba[10] = 30;
    const parity::Difference d = parity::compare(a, b);
    CHECK(d.pixels == 4 && d.differing == 3 && d.largest == 20);
    CHECK(d.buckets[0] == 1 && d.buckets[1] == 1 && d.buckets[2] == 1 && d.buckets[3] == 0 && d.buckets[4] == 1);

    parity::Difference sum = d;
    sum += d;
    CHECK(sum.pixels == 8 && sum.differing == 6 && sum.largest == 20 && sum.buckets[4] == 2);

    const parity::Image diff = parity::differenceImage(a, b, 8);
    CHECK(diff.rgba[0] == 8 && diff.rgba[5] == 24 && diff.rgba[10] == 160 && diff.rgba[3] == 255);

    parity::DepthImage za{2, 1, {5, 9}}, zb{2, 1, {5, 12}};
    const parity::Difference z = parity::compare(za, zb);
    CHECK(z.pixels == 2 && z.differing == 1 && z.largest == 3);

    const auto pixels = parity::differingPixels(a, b);
    CHECK(pixels.size() == 3 && pixels[0].x == 0 && pixels[0].y == 0 && pixels[0].delta == 1);
    CHECK(pixels[1].x == 1 && pixels[1].y == 0 && pixels[1].delta == 3);
    CHECK(pixels[2].x == 0 && pixels[2].y == 1 && pixels[2].delta == 20);
    const auto zpixels = parity::differingPixels(za, zb);
    CHECK(zpixels.size() == 1 && zpixels[0].x == 1 && zpixels[0].y == 0 && zpixels[0].delta == 3);

    bool threw = false;
    try { parity::compare(a, parity::Image{1, 1, std::vector<uint8_t>(4)}); } catch (const std::exception&) { threw = true; }
    CHECK(threw);
    return 0;
}
