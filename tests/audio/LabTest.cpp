#include <cmath>
#include <cstdio>
#include <filesystem>

#include <stb_image.h>

#include "../Check.hpp"
#include "Audio/Lab/PngWriter.hpp"
#include "Audio/Lab/Plot.hpp"
#include "Audio/Lab/WavWriter.hpp"

namespace fs = std::filesystem;

int main(int argc, char** argv) {
    const fs::path scratch = argc > 1 ? fs::path(argv[1]) : fs::temp_directory_path() / "audio-lab-test";
    fs::create_directories(scratch);
    std::vector<int16_t> tone(2 * 4800);
    for (size_t i = 0; i < 4800; ++i) tone[2 * i] = tone[2 * i + 1] = int16_t(10000 * std::sin(2 * 3.14159265358979 * 1000 * double(i) / 48000));
    audio::lab::writeWav(scratch / "tone.wav", tone);
    CHECK(audio::lab::readWav(scratch / "tone.wav") == tone);
    CHECK(fs::file_size(scratch / "tone.wav") == 44 + tone.size() * 2);

    std::vector<uint8_t> rgb(4 * 3 * 3, 0);
    rgb[0] = 255;
    rgb[3 * (2 * 4 + 3) + 2] = 255;
    audio::lab::writePng(scratch / "t.png", 4, 3, rgb);
    int w = 0, h = 0, n = 0;
    stbi_uc* px = stbi_load((scratch / "t.png").string().c_str(), &w, &h, &n, 3);
    CHECK(px != nullptr && w == 4 && h == 3);
    CHECK(px[0] == 255 && px[1] == 0 && px[3 * (2 * 4 + 3) + 2] == 255);
    stbi_image_free(px);

    const audio::lab::Image spectrum = audio::lab::plotSpectrum(tone, 48000, 512, 256);
    CHECK(spectrum.rgb.size() == 512u * 256u * 3u);
    audio::lab::writePng(scratch / "spectrum.png", spectrum.width, spectrum.height, spectrum.rgb);
    const audio::lab::Image wave = audio::lab::plotWaveform(tone, 512, 128);
    audio::lab::writePng(scratch / "wave.png", wave.width, wave.height, wave.rgb);
    const audio::lab::Distance same = audio::lab::distance(tone, tone);
    CHECK(same.differ == 0 && same.maxAbs == 0 && same.rms == 0);
    std::vector<int16_t> other = tone;
    other[10] += 3;
    audio::lab::writeWav(scratch / "tone-off.wav", other);
    const audio::lab::Distance d = audio::lab::distance(tone, other);
    CHECK(d.differ == 1 && d.maxAbs == 3);
    std::printf("lab: wav round trip, png decode, spectrum and distance\n");
    return 0;
}
