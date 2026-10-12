#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <map>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "LabSources.hpp"
#include "Assets/Bytes.hpp"
#include "Audio/ClockSound.hpp"
#include "Audio/data/SndImage.hpp"
#include "Audio/driver/Driver.hpp"
#include "Audio/driver/IopClock.hpp"
#include "Audio/Lab/PngWriter.hpp"
#include "Audio/Lab/Plot.hpp"
#include "Audio/Lab/WavWriter.hpp"
#include "Audio/spu2/Spu2.hpp"

namespace fs = std::filesystem;
using audio::driver::Driver;

namespace {

constexpr uint32_t kSamplesPerSecond = 48000;
constexpr uint64_t kCyclesPerSample = 768;

struct Event {
    uint32_t kind = 0, frame = 0, sample = 0, id = 0, cycle = 0;
    std::array<uint32_t, 5> words{};
};

struct Observed {
    uint32_t frame = 0, sample = 0, address = 0, cycle = 0;
    uint16_t value = 0;
};

struct RamWrite {
    uint32_t sample = 0, core = 0, wordAddress = 0;
    std::vector<uint16_t> words;
};

struct Inputs {
    std::vector<RamWrite> ram;
    std::vector<Event> events;
    std::vector<Observed> observed;
    std::vector<std::array<uint16_t, 24>> tickEnvx;
    std::vector<uint64_t> frameCycles;
    std::vector<uint32_t> dmaDone;
    uint64_t samples = 0, originClocks = 0, originCycle = 0;
};

Inputs loadInputs(const fs::path& dir, const std::string& name) {
    Inputs in;
    const auto read = [&](const char* suffix) { return assets::readFile(dir / (name + suffix)); };
    const assets::Bytes events = read(".render.events.bin");
    for (size_t at = 0; at + 40 <= events.size(); at += 40) {
        Event e;
        e.kind = assets::le32(events, at);
        e.frame = assets::le32(events, at + 4);
        e.sample = assets::le32(events, at + 8);
        e.id = assets::le32(events, at + 12);
        for (size_t k = 0; k < 5; ++k) e.words[k] = assets::le32(events, at + 16 + 4 * k);
        e.cycle = assets::le32(events, at + 36);
        in.events.push_back(e);
    }
    const assets::Bytes observed = read(".render.observed.bin");
    for (size_t at = 0; at + 20 <= observed.size(); at += 20)
        in.observed.push_back({assets::le32(observed, at), assets::le32(observed, at + 4), assets::le32(observed, at + 8), assets::le32(observed, at + 16), uint16_t(assets::le32(observed, at + 12))});
    const assets::Bytes envx = read(".render.tickenvx.bin");
    for (size_t at = 0; at + 96 <= envx.size(); at += 96) {
        std::array<uint16_t, 24> g{};
        for (size_t v = 0; v < 24; ++v) g[v] = uint16_t(assets::le32(envx, at + 4 * v));
        in.tickEnvx.push_back(g);
    }
    const assets::Bytes ram = read(".render.ram.bin");
    for (size_t at = 0; at + 16 <= ram.size();) {
        RamWrite w;
        w.sample = assets::le32(ram, at);
        w.core = assets::le32(ram, at + 4);
        w.wordAddress = assets::le32(ram, at + 8);
        const uint32_t count = assets::le32(ram, at + 12);
        at += 16;
        if (at + 2 * size_t(count) > ram.size()) throw std::runtime_error("a RAM write record runs past the end of its file");
        for (uint32_t i = 0; i < count; ++i) w.words.push_back(uint16_t(ram[at + 2 * i] | ram[at + 2 * i + 1] << 8));
        at += 2 * size_t(count);
        in.ram.push_back(std::move(w));
    }
    if (fs::exists(dir / (name + ".render.frames.bin"))) {
        const assets::Bytes frames = read(".render.frames.bin");
        for (size_t at = 0; at + 4 <= frames.size(); at += 4) in.frameCycles.push_back(assets::le32(frames, at));
    }
    if (fs::exists(dir / (name + ".render.dma.bin"))) {
        const assets::Bytes dma = read(".render.dma.bin");
        for (size_t at = 0; at + 4 <= dma.size(); at += 4) in.dmaDone.push_back(assets::le32(dma, at));
    }
    std::ifstream meta(dir / (name + ".render.meta.txt"));
    uint64_t cycle = 0, frames = 0;
    meta >> cycle >> in.samples >> frames >> in.originClocks;
    in.originCycle = cycle;
    if (in.samples == 0) throw std::runtime_error("the render meta file holds no sample count");
    return in;
}

bool sequencerClass(uint32_t address) {
    if ((address >> 16) != 0x1f90) return false;
    const uint32_t mem = address & 0xffff;
    if (mem >= 0x760) return false;
    if (((mem >> 10) & 1) != 1) return false;
    const uint32_t off = mem & 0x3ff;
    if (off < 0x180) return true;
    if (off >= 0x1c0 && off < 0x2e0) return true;
    return (off >= 0x188 && off <= 0x196) || (off >= 0x1a0 && off <= 0x1a6);
}

enum class Mode { Observed, Native, Paired, Modelled };
enum class Ram { Image, Watson };

struct Pending {
    uint32_t address;
    uint16_t value;
};

struct Report {
    uint64_t writes = 0, fills = 0, clamped = 0, unpaired = 0, ticks = 0, envxValues = 0, envxDiffer = 0, envxMaxDiff = 0;
    std::map<std::string, std::pair<int64_t, int64_t>> lag;
    std::map<std::string, double> lagSum;
    std::map<std::string, std::array<uint64_t, 2>> modelAudit;
    std::vector<std::string> modelMisses;
    std::map<std::string, uint64_t> lagCount;
    uint64_t dmaWaits = 0, dmaUnanswered = 0, dmaUnused = 0;
    std::map<int64_t, uint64_t> dmaWaitSpan;
};

struct Options {
    Mode mode = Mode::Native;
    Ram ram = Ram::Image;
    std::set<std::string> pairedClasses;
    fs::path lags;
};

std::vector<int16_t> render(const fs::path& captures, const fs::path& dumps, const Inputs& in, const Options& options, Report& report) {
    const Mode mode = options.mode;
    const Ram ramSource = options.ram;
    audio::spu2::Spu2 spu;
    if (ramSource == Ram::Image) spu.loadRam(audio::data::SndImage::fromFolder(dumps).spuRam());
    size_t nextRam = 0;
    spu.setTicks(uint32_t(in.originClocks / kCyclesPerSample));
    std::vector<int16_t> out(2 * in.samples);
    std::multimap<uint64_t, Pending> pending;
    uint64_t mixed = 0;
    const auto advanceTo = [&](uint64_t target) {
        target = std::min<uint64_t>(target, in.samples);
        while (mixed < target) {
            for (; ramSource == Ram::Watson && nextRam < in.ram.size() && in.ram[nextRam].sample <= mixed; ++nextRam)
                spu.upload(in.ram[nextRam].wordAddress, in.ram[nextRam].words.data(), in.ram[nextRam].words.size());
            for (auto it = pending.begin(); it != pending.end() && it->first <= mixed; it = pending.erase(it)) spu.write(it->second.address, it->second.value);
            spu.mix();
            out[2 * mixed] = spu.finalLeft();
            out[2 * mixed + 1] = spu.finalRight();
            ++mixed;
        }
    };
    if (mode == Mode::Observed) {
        for (const Observed& w : in.observed) {
            pending.emplace(w.sample, Pending{w.address, w.value});
        }
        advanceTo(in.samples);
        return out;
    }
    const assets::Bytes libsd = assets::readFile(captures / "hddosd-110U-sound-libsd.bin");
    const audio::driver::Snapshot snapshot = audio::driver::loadSnapshot(captures / "hddosd-110U-sound-boot-b");
    size_t tickIndex = 0;
    audio::driver::EnvxFeed feed;
    const auto own = [&](uint32_t core, uint32_t voice) -> uint16_t { return uint16_t(spu.voice(int(core), int(voice)).envelope.level); };
    feed.tick = [&](uint32_t core, uint32_t voice) -> uint16_t {
        const uint16_t value = own(core, voice);
        if (core == 1 && voice < 24 && tickIndex >= 1 && tickIndex <= in.tickEnvx.size()) {
            ++report.envxValues;
            const int diff = std::abs(int(in.tickEnvx[tickIndex - 1][voice]) - int(value));
            if (diff != 0) ++report.envxDiffer;
            report.envxMaxDiff = std::max<uint64_t>(report.envxMaxDiff, uint64_t(diff));
        }
        return value;
    };
    feed.allocation = own;
    Driver driver(snapshot, libsd, feed, true);
    if (mode == Mode::Modelled) {
        if (in.frameCycles.empty()) throw std::runtime_error("the modelled mode needs the render frames file");
        driver.enableTiming();
    }
    std::ofstream lagFile;
    if (!options.lags.empty()) lagFile.open(options.lags);
    std::array<std::vector<const Observed*>, 2> byClass;
    std::array<size_t, 2> nextOf{};
    for (const Observed& w : in.observed) byClass[sequencerClass(w.address) ? 0 : 1].push_back(&w);
    std::vector<uint32_t> eventDma;
    size_t eventIndex = 0;
    if (mode == Mode::Modelled)
        driver.setDmaCompletion([&](uint32_t ordinal, uint32_t entry) -> std::optional<uint32_t> {
            ++report.dmaWaits;
            if (ordinal >= eventDma.size()) {
                ++report.dmaUnanswered;
                return std::nullopt;
            }
            ++report.dmaWaitSpan[int64_t(eventDma[ordinal]) - int64_t(entry)];
            return eventDma[ordinal];
        });
    for (const Event& e : in.events) {
        ++eventIndex;
        if (mode == Mode::Modelled) {
            uint32_t until = UINT32_MAX;
            for (size_t k = eventIndex; k < in.events.size(); ++k)
                if (in.events[k].kind == 1) {
                    until = in.events[k].cycle;
                    break;
                }
            eventDma.clear();
            if (e.kind == 1)
                for (const uint32_t done : in.dmaDone)
                    if (done >= e.cycle && done < until) eventDma.push_back(done - e.cycle);
        }
        advanceTo(e.sample);
        driver.beginFrame(e.frame);
        if (e.kind == 0) {
            ++tickIndex;
            ++report.ticks;
            driver.tick();
        } else {
            audio::DriverCommand c;
            c.frame = e.frame;
            c.id = e.id;
            c.words = e.words;
            driver.command(c);
        }
        for (const audio::driver::FillEvent& f : driver.takeFills()) {
            if (ramSource == Ram::Image) spu.clearRam(f.start, f.bytes);
            ++report.fills;
        }
        const std::string label = e.kind == 0 ? "tick" : "rpc";
        char idLabel[16];
        std::snprintf(idLabel, sizeof idLabel, "%x", e.id);
        const bool useWatson = options.pairedClasses.empty() || options.pairedClasses.count(label) != 0 || (e.kind == 1 && options.pairedClasses.count(idLabel) != 0);
        size_t writeIndex = 0;
        audio::WriteStream stream = driver.takeWrites();
        if (mode == Mode::Modelled) audio::driver::addVblankPreemption(stream, e.cycle, in.frameCycles);
        for (const audio::SpuWrite& w : stream) {
            uint64_t sample = e.sample;
            if (mode == Mode::Modelled) sample = audio::driver::sampleOfCycle(uint64_t(e.cycle) + w.cycle, in.originClocks);
            if (mode == Mode::Paired || mode == Mode::Modelled) {
                const size_t cls = sequencerClass(w.address) ? 0 : 1;
                size_t& next = nextOf[cls];
                if (next >= byClass[cls].size() || byClass[cls][next]->address != w.address || byClass[cls][next]->value != w.value) {
                    ++report.unpaired;
                } else {
                    if (mode == Mode::Paired && useWatson) sample = byClass[cls][next]->sample;
                    if (mode == Mode::Modelled) {
                        const uint64_t modelled = uint64_t(e.cycle) + w.cycle;
                        auto& audit = report.modelAudit[label + (e.kind == 1 ? std::string(" ") + idLabel : std::string())];
                        ++audit[0];
                        if (modelled != byClass[cls][next]->cycle) {
                            ++audit[1];
                            if (report.modelMisses.size() < 12) report.modelMisses.push_back(label + " " + idLabel + " write " + std::to_string(writeIndex) + ": modelled " + std::to_string(int64_t(modelled) - int64_t(e.cycle)) + ", Watson " + std::to_string(int64_t(byClass[cls][next]->cycle) - int64_t(e.cycle)));
                        }
                    }
                    if (lagFile.is_open()) lagFile << e.kind << ' ' << e.id << ' ' << writeIndex << ' ' << e.cycle << ' ' << byClass[cls][next]->cycle << ' ' << std::hex << w.address << std::dec << '\n';
                    const int64_t lag = int64_t(byClass[cls][next]->sample) - int64_t(e.sample);
                    auto& range = report.lag[label];
                    if (report.lagCount[label] == 0) range = {lag, lag};
                    range.first = std::min(range.first, lag);
                    range.second = std::max(range.second, lag);
                    report.lagSum[label] += double(lag);
                    ++report.lagCount[label];
                }
                ++next;
            }
            if (sample < mixed) {
                sample = mixed;
                ++report.clamped;
            }
            pending.emplace(sample, Pending{w.address, w.value});
            ++report.writes;
            ++writeIndex;
        }
    }
    advanceTo(in.samples);
    if (mode == Mode::Paired && (report.unpaired != 0 || nextOf[0] != byClass[0].size() || nextOf[1] != byClass[1].size()))
        throw std::runtime_error("the native driver stream is not Watson's write stream in address, value and order");
    return out;
}

int cmdRender(int argc, char** argv) {
    if (argc < 7) return 2;
    const fs::path captures = argv[2], dir = argv[3], dumps = argv[5], out = argv[6];
    const std::string name = argv[4];
    const std::string modeName = argc > 7 ? argv[7] : "native";
    const std::string ramName = argc > 8 ? argv[8] : "image";
    Options options;
    const size_t colon = modeName.find(':');
    const std::string base = modeName.substr(0, colon);
    if (base == "observed") options.mode = Mode::Observed;
    else if (base == "paired") options.mode = Mode::Paired;
    else if (base == "modelled") options.mode = Mode::Modelled;
    else if (base != "native") throw std::runtime_error("unknown writes mode " + modeName);
    for (size_t at = colon == std::string::npos ? modeName.size() : colon + 1; at < modeName.size();) {
        const size_t comma = std::min(modeName.find(',', at), modeName.size());
        options.pairedClasses.insert(modeName.substr(at, comma - at));
        at = comma + 1;
    }
    if (ramName != "image" && ramName != "watson") throw std::runtime_error("unknown RAM source " + ramName);
    options.ram = ramName == "watson" ? Ram::Watson : Ram::Image;
    if (argc > 9) options.lags = argv[9];
    const Inputs in = loadInputs(dir, name);
    Report report;
    const std::vector<int16_t> samples = render(captures, dumps, in, options, report);
    if (!out.parent_path().empty()) fs::create_directories(out.parent_path());
    audio::lab::writeWav(out, samples, kSamplesPerSecond);
    std::printf("render %s writes, %s RAM: %zu events, %llu driver writes, %llu transfer events, %llu writes clamped to the present, %llu unpaired, %llu ticks, %llu of %llu tick ENVX values differ from Watson's (largest %llu), %zu samples\n",
                modeName.c_str(), ramName.c_str(), in.events.size(), (unsigned long long)report.writes, (unsigned long long)report.fills, (unsigned long long)report.clamped,
                (unsigned long long)report.unpaired, (unsigned long long)report.ticks, (unsigned long long)report.envxDiffer, (unsigned long long)report.envxValues,
                (unsigned long long)report.envxMaxDiff, samples.size() / 2);
    for (const auto& [label, audit] : report.modelAudit)
        std::printf("  modelled write times, %s: %llu of %llu differ from Watson's cycle\n", label.c_str(), (unsigned long long)audit[1], (unsigned long long)audit[0]);
    if (options.mode == Mode::Modelled) {
        std::printf("  DMA waits %llu, without a completion %llu\n", (unsigned long long)report.dmaWaits, (unsigned long long)report.dmaUnanswered);
        for (const auto& [span, count] : report.dmaWaitSpan) std::printf("  DMA completion minus modelled wait entry %lld: %llu\n", (long long)span, (unsigned long long)count);
    }
    for (const std::string& miss : report.modelMisses) std::printf("    %s\n", miss.c_str());
    for (const auto& [label, range] : report.lag)
        std::printf("  Watson's write behind the event, %s: %lld..%lld samples, mean %.2f over %llu\n", label.c_str(), (long long)range.first, (long long)range.second,
                    report.lagSum[label] / double(report.lagCount[label]), (unsigned long long)report.lagCount[label]);
    return 0;
}

int cmdFacade(int argc, char** argv) {
    if (argc < 7) return 2;
    const fs::path captures = argv[2], dir = argv[3], dumps = argv[5], out = argv[6];
    const std::string name = argv[4];
    const Inputs in = loadInputs(dir, name);
    audio::ClockSoundOptions options;
    options.autoTicks = false;
    options.replayInit = false;
    audio::ClockSound sound(audio::lab::labSources(captures, dumps, dir, name), options);
    for (const Event& e : in.events) {
        if (e.kind == 0) {
            sound.scheduleTick(e.sample, e.frame);
        } else {
            audio::DriverCommand c;
            c.frame = e.frame;
            c.sample = e.sample;
            c.id = e.id;
            c.words = e.words;
            sound.queue(c);
        }
    }
    std::vector<int16_t> samples(2 * in.samples);
    sound.render(samples.data(), in.samples);
    if (!out.parent_path().empty()) fs::create_directories(out.parent_path());
    audio::lab::writeWav(out, samples, kSamplesPerSecond);
    std::printf("facade: %zu events, %zu samples\n", in.events.size(), samples.size() / 2);
    return 0;
}

struct Measured {
    audio::lab::Distance distance;
    int64_t first = -1, last = -1;
    size_t samplesA = 0, samplesB = 0;
};

Measured measure(const std::vector<int16_t>& a, const std::vector<int16_t>& b) {
    Measured m;
    m.samplesA = a.size() / 2;
    m.samplesB = b.size() / 2;
    m.distance = audio::lab::distance(a, b);
    const size_t n = std::max(a.size(), b.size());
    for (size_t i = 0; i < n; ++i) {
        const int x = i < a.size() ? a[i] : 0, y = i < b.size() ? b[i] : 0;
        if (x == y) continue;
        if (m.first < 0) m.first = int64_t(i / 2);
        m.last = int64_t(i / 2);
    }
    return m;
}

int cmdCompare(int argc, char** argv) {
    if (argc < 4) return 2;
    const std::vector<int16_t> a = audio::lab::readWav(argv[2]), b = audio::lab::readWav(argv[3]);
    const Measured m = measure(a, b);
    std::printf("samples %zu and %zu\ndiffer %llu\nmaxAbs %lld\nrms %.4f\nfirst %lld\nlast %lld\n", m.samplesA, m.samplesB, (unsigned long long)m.distance.differ,
                (long long)m.distance.maxAbs, m.distance.rms, (long long)m.first, (long long)m.last);
    const size_t n = std::max(a.size(), b.size());
    const size_t window = 2 * kSamplesPerSecond;
    for (size_t at = 0, second = 0; at < n; at += window, ++second) {
        double sum = 0;
        const size_t end = std::min(n, at + window);
        for (size_t i = at; i < end; ++i) {
            const double d = double(i < a.size() ? a[i] : 0) - double(i < b.size() ? b[i] : 0);
            sum += d * d;
        }
        if (sum != 0) std::printf("second %zu rms %.4f\n", second, std::sqrt(sum / double(end - at)));
    }
    return 0;
}

int cmdReplay(int argc, char** argv) {
    if (argc < 5) return 2;
    std::ifstream in(argv[3]);
    if (!in) throw std::runtime_error(std::string("no command log ") + argv[3]);
    std::string word, video;
    uint64_t total = 0, preroll = 0;
    in >> word >> total >> word >> video >> word >> preroll;
    audio::ClockSoundOptions options;
    options.video = video == "pal" ? audio::Video::Pal : audio::Video::Ntsc;
    options.modelledWrites = true;
    options.preRollSamples = preroll;
    audio::ClockSound sound(audio::clockSoundSources(argv[2]), options);
    uint64_t commands = 0;
    for (uint64_t sample = 0, frame = 0; in >> sample >> frame;) {
        audio::DriverCommand c;
        c.sample = uint32_t(sample);
        c.frame = uint32_t(frame);
        in >> std::hex >> c.id >> std::dec;
        for (uint32_t& w : c.words) in >> w;
        sound.queue(c);
        ++commands;
    }
    std::vector<int16_t> samples(2 * total);
    sound.render(samples.data(), total);
    audio::lab::writeWav(argv[4], samples, kSamplesPerSecond);
    std::printf("replay: %llu commands, %llu samples\n", (unsigned long long)commands, (unsigned long long)total);
    return 0;
}

int cmdPlot(int argc, char** argv) {
    if (argc < 4) return 2;
    const std::vector<int16_t> a = audio::lab::readWav(argv[2]);
    const std::string prefix = argv[3];
    if (!fs::path(prefix).parent_path().empty()) fs::create_directories(fs::path(prefix).parent_path());
    const audio::lab::Image wave = audio::lab::plotWaveform(a, 1600, 400);
    audio::lab::writePng(prefix + "-wave.png", wave.width, wave.height, wave.rgb);
    const audio::lab::Image spectrum = audio::lab::plotSpectrum(a, kSamplesPerSecond, 1024, 400);
    audio::lab::writePng(prefix + "-spectrum.png", spectrum.width, spectrum.height, spectrum.rgb);
    std::printf("plot: %s-wave.png %s-spectrum.png\n", prefix.c_str(), prefix.c_str());
    return 0;
}

int cmdPlotDiff(int argc, char** argv) {
    if (argc < 5) return 2;
    const std::vector<int16_t> a = audio::lab::readWav(argv[2]), b = audio::lab::readWav(argv[3]);
    std::vector<int16_t> d(std::max(a.size(), b.size()), 0);
    for (size_t i = 0; i < d.size(); ++i) {
        const int v = (i < a.size() ? a[i] : 0) - (i < b.size() ? b[i] : 0);
        d[i] = int16_t(std::clamp(v, -32768, 32767));
    }
    const std::string prefix = argv[4];
    if (!fs::path(prefix).parent_path().empty()) fs::create_directories(fs::path(prefix).parent_path());
    const audio::lab::Image wave = audio::lab::plotWaveform(d, 1600, 400);
    audio::lab::writePng(prefix + "-diff.png", wave.width, wave.height, wave.rgb);
    std::printf("plot-diff: %s-diff.png\n", prefix.c_str());
    return 0;
}

int cmdBudget(int argc, char** argv) {
    if (argc < 5) return 2;
    const std::vector<int16_t> a = audio::lab::readWav(argv[2]), b = audio::lab::readWav(argv[3]);
    const Measured m = measure(a, b);
    nlohmann::json now;
    now["samples"] = m.samplesA;
    now["differ"] = m.distance.differ;
    now["maxAbs"] = m.distance.maxAbs;
    now["first"] = m.first;
    now["last"] = m.last;
    if (argc > 5 && std::string(argv[5]) == "--write") {
        if (m.samplesA != m.samplesB) {
            std::fprintf(stderr, "refusing to write a budget: the two files differ in length (%zu, %zu)\n", m.samplesA, m.samplesB);
            return 1;
        }
        std::ofstream(argv[4]) << now.dump(1) << "\n";
        std::printf("budget written: %s\n", now.dump().c_str());
        return 0;
    }
    std::ifstream in(argv[4]);
    if (!in) {
        std::fprintf(stderr, "no budget file %s\n", argv[4]);
        return 1;
    }
    const nlohmann::json budget = nlohmann::json::parse(in);
    int failures = 0;
    if (m.samplesA != m.samplesB) {
        std::fprintf(stderr, "the two files differ in length: %zu and %zu samples\n", m.samplesA, m.samplesB);
        ++failures;
    }
    for (const char* key : {"samples", "differ", "maxAbs", "first", "last"}) {
        if (now.at(key) != budget.at(key)) {
            std::fprintf(stderr, "%s: measured %s, budget %s\n", key, now.at(key).dump().c_str(), budget.at(key).dump().c_str());
            ++failures;
        }
    }
    if (failures == 0) std::printf("budget: %s equals the declared %s\n", now.dump().c_str(), argv[4]);
    return failures == 0 ? 0 : 1;
}

}

int main(int argc, char** argv) try {
    if (argc < 2) return 2;
    const std::string command = argv[1];
    if (command == "skip") {
        std::printf("SKIPPED: %s\n", argc > 2 ? argv[2] : "");
        return 77;
    }
    if (command == "render") return cmdRender(argc, argv);
    if (command == "facade") return cmdFacade(argc, argv);
    if (command == "replay") return cmdReplay(argc, argv);
    if (command == "compare") return cmdCompare(argc, argv);
    if (command == "plot") return cmdPlot(argc, argv);
    if (command == "plot-diff") return cmdPlotDiff(argc, argv);
    if (command == "budget") return cmdBudget(argc, argv);
    std::fprintf(stderr, "usage: SoundLab render <captures> <render-dir> <name> <dumps> <out.wav> [native|paired|modelled|observed] [image|watson] | compare <a> <b> | plot <a> <prefix> | plot-diff <a> <b> <prefix> | budget <a> <b> <budget.json> [--write]\n");
    return 2;
} catch (const std::exception& e) {
    std::fprintf(stderr, "refused: %s\n", e.what());
    return 1;
}
