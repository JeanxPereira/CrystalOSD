#include <SDL3/SDL.h>
#include <imgui.h>
#include <imgui_impl_sdl3.h>
#include <imgui_impl_vulkan.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <exception>
#include <filesystem>
#include <format>
#include <fstream>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <span>
#include <string>
#include <vector>

#include "Core/Log.hpp"
#include "Scene/ColdStart.hpp"
#include "App/HostInputs.hpp"
#include "App/SettingsStore.hpp"
#include "App/ClockAssets.hpp"
#include "App/DebugPanel.hpp"
#include "App/BootChain.hpp"
#include "App/ClockScreen.hpp"
#include "App/NativeFrames.hpp"
#include "App/BootChain.hpp"
#include "App/Input.hpp"
#include "App/OpeningScreen.hpp"
#include "App/Png.hpp"
#include "App/Profile.hpp"
#include "App/Golden.hpp"
#include "App/GoldenScenario.hpp"
#include "Assets/ClockTextures.hpp"
#include "Assets/Program.hpp"
#include "Audio/LiveAudio.hpp"
#include "App/Screens.hpp"
#include "Render/Device.hpp"
#include "Render/NativeRenderer.hpp"
#include "Scene/Clock.hpp"
#include "Scene/ConsoleClock.hpp"
#include "Scene/ClockDate.hpp"

namespace {

using Clock = scene::Clock<scene::NativeArithmetic>;

class FunctionScreen : public app::FrameSource {
public:
    explicit FunctionScreen(std::function<scene::Frame()> step) : m_step(std::move(step)) {}
    void step() override { m_frame = m_step(); }
    scene::Frame& frame() override { return m_frame; }
    bool done() const override { return false; }

private:
    std::function<scene::Frame()> m_step;
    scene::Frame m_frame;
};
using std::chrono::system_clock;

struct Options {
    bool validation = true;
    bool syncValidation = false;
    bool smoke = false;
    double soak = 0;
    bool profile = false;
    bool boot = true;
    bool towersDemo = false;
    std::optional<uint32_t> lightsPhase;
    std::filesystem::path openingTextures;
    std::string capture;
    std::filesystem::path shaders = CLOCK_SHADERS;
    std::filesystem::path textures;
    std::filesystem::path settings;
    bool settingsGiven = false;
    bool noSave = false;
    bool clockStart = false;
    bool pal = false;
    std::optional<int> language;
    std::optional<int> aspect;
    std::filesystem::path cubeMesh;
    std::filesystem::path mesh;
    std::filesystem::path screenshots = CLOCK_SCREENSHOTS;
    std::filesystem::path font;
    std::filesystem::path program;
    std::filesystem::path resources;
    std::filesystem::path bios;
    bool mute = false;
    std::filesystem::path audioWav;
    std::filesystem::path logFile;
    std::filesystem::path traceFile;
    std::string golden;
    std::filesystem::path goldenFile;
    std::string goldenOutput = "native";
};

// The folder of raw OSD resource files: --resources, else "resources" beside the executable (where --bios extracts to).
std::filesystem::path resourceFolder(const Options& options) {
    if (!options.resources.empty()) return options.resources;
    const char* base = SDL_GetBasePath();
    return (base ? std::filesystem::path(base) : std::filesystem::current_path()) / "resources";
}

std::vector<uint8_t> fileOrEmpty(const std::filesystem::path& path) {
    std::error_code error;
    return std::filesystem::is_regular_file(path, error) ? assets::readFile(path) : std::vector<uint8_t>{};
}

struct ConsoleNow {
    scene::DateWords rtc, local;
    float milliseconds;
};

int64_t utcSeconds(system_clock::time_point now) { return std::chrono::floor<std::chrono::seconds>(now).time_since_epoch().count(); }

ConsoleNow consoleNow(system_clock::time_point now, uint32_t zoneWord) {
    const auto second = std::chrono::floor<std::chrono::seconds>(now);
    const scene::DateWords rtc = scene::rtcAt(second.time_since_epoch().count());
    return {rtc, scene::localOf(rtc, scene::zoneOf(zoneWord)), std::chrono::duration<float, std::milli>(now - second).count()};
}

// The OSD's time keeper gives hours, minutes, seconds and the milliseconds into the second; here the console's local time.
scene::ClockTime clockTime(system_clock::time_point now, uint32_t zoneWord) {
    const ConsoleNow c = consoleNow(now, zoneWord);
    return {c.milliseconds, c.local[5], c.local[4], c.local[3]};
}

// Configuration items 6 to 0xB, which the clock screen's text formats: the local date and time.
scene::ClockItems clockItems(system_clock::time_point now, uint32_t zoneWord) {
    const scene::DateWords l = consoleNow(now, zoneWord).local;
    return {l[0], l[1], l[2], l[3], l[4], l[5]};
}

// The picture is 640 x 448 (two 224-line fields) at a scale of height / 448; "window" takes the largest that fits.
render::NativeOutput outputFor(const app::PanelState& panel, VkExtent2D window, float aspect) {
    uint32_t height = 448;
    switch (panel.resolution) {
    case app::Resolution::Native: height = 448; break;
    case app::Resolution::Double: height = 896; break;
    case app::Resolution::Quadruple: height = 1792; break;
    case app::Resolution::Window:
        height = std::max<uint32_t>(2, std::min<uint32_t>(window.height, static_cast<uint32_t>(float(window.width) / aspect)));
        break;
    }
    return {std::max<uint32_t>(1, (640 * height + 224) / 448), height, panel.samples};
}

struct Step {
    double at;
    std::function<void()> act;
};

}  // namespace

int main(int argc, char** argv) {
    Options options;
    std::set<std::string> explicitFlags;
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        const bool more = i + 1 < argc;
        explicitFlags.insert(arg);
        if (arg == "--smoke") options.smoke = true;
        else if (arg == "--skip-boot") options.boot = false;
        else if (arg == "--towers" && more) options.towersDemo = std::string(argv[++i]) == "demo";
        else if (arg == "--lights-phase" && more) options.lightsPhase = static_cast<uint32_t>(std::strtoul(argv[++i], nullptr, 0));
        else if (arg == "--opening-textures" && more) options.openingTextures = argv[++i];
        else if (arg == "--capture" && more) options.capture = argv[++i];
        else if (arg == "--no-validation") options.validation = false;
        else if (arg == "--validate" && more) {
            const std::string mode = argv[++i];
            if (mode == "sync") options.syncValidation = true;
            else {
                std::fprintf(stderr, "--validate: unknown mode %s (sync)\n", mode.c_str());
                return 1;
            }
        }
        else if (arg == "--soak" && more) options.soak = std::atof(argv[++i]);
        else if (arg == "--shaders" && more) options.shaders = argv[++i];
        else if (arg == "--textures" && more) options.textures = argv[++i];
        else if (arg == "--settings" && more) options.settings = argv[++i], options.settingsGiven = true;
        else if (arg == "--no-save") options.noSave = true;
        else if (arg == "--clock") options.clockStart = true, options.boot = false;
        else if (arg == "--pal") options.pal = true;
        else if (arg == "--language" && more) options.language = std::atoi(argv[++i]);
        else if (arg == "--aspect" && more) options.aspect = std::atoi(argv[++i]);
        else if (arg == "--cube-mesh" && more) options.cubeMesh = argv[++i];
        else if (arg == "--mesh" && more) options.mesh = argv[++i];
        else if (arg == "--screenshots" && more) options.screenshots = argv[++i];
        else if (arg == "--font" && more) options.font = argv[++i];
        else if (arg == "--program" && more) options.program = argv[++i];
        else if (arg == "--resources" && more) options.resources = argv[++i];
        else if (arg == "--bios" && more) options.bios = argv[++i];
        else if (arg == "--mute") options.mute = true;
        else if (arg == "--audio-wav" && more) options.audioWav = argv[++i];
        else if (arg == "--log" && more) options.logFile = argv[++i];
        else if (arg == "--profile") options.profile = true;
        else if (arg == "--trace" && more) options.traceFile = argv[++i];
        else if (arg == "--golden" && i + 2 < argc && (std::string(argv[i + 1]) == "record" || std::string(argv[i + 1]) == "check")) options.golden = argv[i + 1], options.goldenFile = argv[i + 2], i += 2;
        else if (arg == "--golden-output" && more && (std::string(argv[i + 1]) == "native" || std::string(argv[i + 1]) == "x2-msaa4")) options.goldenOutput = argv[++i];
        else {
            std::fprintf(stderr, "usage: CrystalOSD [--resources dir] [--bios rom.bin] [--smoke] [--soak seconds] [--skip-boot] [--clock] [--pal] [--language N] [--aspect N] [--towers none|demo] [--lights-phase N] [--opening-textures dir] [--capture all|n,n,...] [--mute] [--audio-wav out.wav] [--log file] [--trace file.jsonl] [--profile] [--golden record|check file] [--golden-output native|x2-msaa4] [--no-validation] [--validate sync] [--shaders dir]\n"
                                 "                    [--settings settings.json] [--no-save] [--screenshots dir] [--textures dir] [--mesh rod-mesh.json] [--cube-mesh cube-mesh.json] [--font FNTOSD] [--program hddosd.elf]\n");
            return 1;
        }
    }
    if (!options.logFile.empty()) core::Log::get().open(options.logFile);
    const bool golden = !options.golden.empty();
    if (golden) {
        options.settings = std::filesystem::path("out") / "golden" / "no-settings.json";
        options.pal = false;
        options.language.reset();
        options.aspect.reset();
        options.mute = true;
        options.boot = true;
    }
    if (options.settings.empty())
        options.settings = options.soak > 0 || options.smoke ? std::filesystem::path("out") / "golden" / "no-settings.json" : assets::userDataDirectory() / "settings.json";
    app::StoredSettings storedAtStart;
    try {
        storedAtStart = app::readStored(options.settings);
    } catch (const std::exception& error) {
        std::fprintf(stderr, "%s\n", error.what());
        return 1;
    }
    const bool save = !golden && !options.noSave && (options.soak == 0 || options.settingsGiven);
    const std::chrono::time_zone* hostZone = nullptr;
    try {
        hostZone = std::chrono::current_zone();
    } catch (const std::exception& error) {
        std::fprintf(stderr, "host time zone: %s\n", error.what());
        return 1;
    }
    // The clock's assets: the console's raw resource files decoded at each start; loose files only from explicit flags.
    std::optional<assets::AssetSet> loaded;
    const std::filesystem::path folder = resourceFolder(options);
    if (!options.bios.empty()) {
        try {
            std::string names;
            for (const std::string& name : assets::extractBios(options.bios, folder)) names += " " + name;
            std::printf("bios: %s gives%s, in %s\n", options.bios.string().c_str(), names.c_str(), folder.string().c_str());
        } catch (const std::exception& error) {
            core::log(core::Level::Error, core::Subsystem::Assets, "bios: {}", error.what());
        }
    }
    try {
        const auto begin = std::chrono::steady_clock::now();
        if (!assets::folderSources(folder).empty()) {
            loaded = assets::decodeFolder(folder);
            std::printf("assets: %zu decoded from %s in %.1f ms\n", loaded->assets.size(), folder.string().c_str(),
                        std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count());
        }
    } catch (const std::exception& error) {
        core::log(core::Level::Error, core::Subsystem::Assets, "load: {}", error.what());
    }
    if (!loaded) std::printf("assets: no resource files in %s\n", folder.string().c_str());
    const assets::AssetSet* decoded = loaded ? &*loaded : nullptr;
    const auto sourceOf = [&](const assets::Asset& a) { return "decoded from " + decoded->sourceOf(a).path; };

    // Each group from one place: the decoded set, or a loose file named on the command line.
    const bool useTextureFiles = explicitFlags.contains("--textures");
    const std::string textureSource = useTextureFiles ? "PNG files in " + options.textures.string() : decoded && decoded->find("TEXCFLOW") ? sourceOf(*decoded->find("TEXCFLOW")) : std::string("none");
    const assets::Asset* meshAsset = decoded && !explicitFlags.contains("--mesh") ? decoded->find("RODMESH") : nullptr;
    const assets::Asset* cubeAsset = decoded && !explicitFlags.contains("--cube-mesh") ? decoded->find("CUBEMESH") : nullptr;
    const std::string meshSource = meshAsset ? sourceOf(*meshAsset) : options.mesh.string();
    const assets::Asset* fontAsset = decoded ? decoded->find("FNTOSD") : nullptr;
    const assets::Asset* programAsset = decoded ? decoded->find("PROGRAM") : nullptr;
    const bool fontLoose = explicitFlags.contains("--font");
    const bool programLoose = explicitFlags.contains("--program");
    std::vector<uint8_t> fontFile = fontLoose ? fileOrEmpty(options.font) : fontAsset ? fontAsset->data : std::vector<uint8_t>{};
    std::vector<uint8_t> programFile = programLoose ? fileOrEmpty(options.program) : programAsset ? programAsset->data : std::vector<uint8_t>{};
    if (programLoose && !programFile.empty()) {
        bool known = false;
        try {
            known = assets::isHddOsd110U(assets::ElfImage(programFile));
        } catch (const std::exception&) {
        }
        if (!known) {
            std::fprintf(stderr, "text: %s is not HDD OSD 1.10U's hddosd.elf: not read\n", options.program.string().c_str());
            programFile.clear();
        }
    }
    const std::string textSource = fontFile.empty() || programFile.empty()
                                       ? std::string("none (no FNTOSD or no HDD OSD 1.10U hddosd.elf)")
                                       : (fontLoose ? options.font.string() : sourceOf(*fontAsset)) + " and " + (programLoose ? options.program.string() : sourceOf(*programAsset));
    std::printf("textures: %s\nmesh: %s\ntext: %s\n", textureSource.c_str(), meshSource.c_str(), textSource.c_str());
    std::vector<std::string> missing;
    if (!useTextureFiles && !(decoded && decoded->find("TEXCFLOW"))) missing.push_back("the clock textures");
    if (!meshAsset && options.mesh.empty()) missing.push_back("the rod mesh");
    if (!cubeAsset && options.cubeMesh.empty()) missing.push_back("the cube mesh");
    if (programFile.empty()) missing.push_back("the program hddosd.elf (HDD OSD 1.10U)");
    if (options.openingTextures.empty() && !(decoded && decoded->find(assets::kOpeningTextures[0].name))) missing.push_back("the opening textures");
    if (!missing.empty()) {
        std::string list;
        for (const std::string& what : missing) list += (list.empty() ? "" : ", ") + what;
        std::fprintf(stderr, "missing: %s.\nGive the console's files: --bios rom.bin (a PS2 BIOS image) or --resources dir (a folder with TEXIMAGE, FNTOSD, SNDIMAGE and hddosd.elf),\n"
                             "or put those files in %s.\n", list.c_str(), folder.string().c_str());
        return 1;
    }
    if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMEPAD)) {
        std::fprintf(stderr, "SDL: %s\n", SDL_GetError());
        return 1;
    }
    SDL_Window* window = SDL_CreateWindow("CrystalOSD", 1280, 896, SDL_WINDOW_VULKAN | SDL_WINDOW_RESIZABLE | (golden ? SDL_WINDOW_HIDDEN : 0));
    if (!window) {
        std::fprintf(stderr, "window: %s\n", SDL_GetError());
        return 1;
    }
    int code = 0;
    try {
        render::Device device(window, {options.validation, options.syncValidation});
        render::NativeRenderer renderer(device, options.shaders);
        if (useTextureFiles) renderer.loadClockTextures(options.textures);
        else app::uploadClockTextures(renderer, *decoded);
        {
            const bool openingFiles = !options.openingTextures.empty();
            const std::filesystem::path openingDirectory = options.openingTextures;
            if (openingFiles) renderer.loadOpeningTextures(openingDirectory);
            else app::uploadOpeningTextures(renderer, *decoded);
            std::printf("opening textures: %s\n", openingFiles ? ("PNG files in " + openingDirectory.string()).c_str() : sourceOf(*decoded->find(assets::kOpeningTextures[0].name)).c_str());
        }

        // The clock starts as the console's does: the program's initial values, the init functions, the host's inputs (scene/ColdStart.cpp).
        const scene::RodMesh cubeMesh = cubeAsset ? app::rodMeshOf(*cubeAsset) : scene::loadRodMesh(options.cubeMesh);
        const std::shared_ptr<const scene::ProgramImage> program = std::make_shared<const scene::ProgramImage>(std::move(programFile));
        std::shared_ptr<const scene::Font> font;
        if (!fontFile.empty()) font = std::make_shared<const scene::Font>(std::move(fontFile));
        else std::printf("no FNTOSD: the clock runs without text\n");
        const scene::ColdAssets coldAssets{program, font, meshAsset ? app::rodMeshOf(*meshAsset) : scene::loadRodMesh(options.mesh), cubeMesh};
        scene::ClockInputs clockInputs;
        std::unique_ptr<Clock> clockPtr;
        scene::FrameInputs inputs;

        const bool captureAll = options.capture == "all";
        std::set<uint64_t> captureAt;
        for (size_t at = 0; at < options.capture.size() && !captureAll;) {
            captureAt.insert(std::strtoull(options.capture.c_str() + at, nullptr, 10));
            const size_t comma = options.capture.find(',', at);
            if (comma == std::string::npos) break;
            at = comma + 1;
        }
        const bool capturing = options.boot && !options.capture.empty();

        static const VkFormat swapchainFormat = device.swapchainFormat();
        if (!golden) {
        IMGUI_CHECKVERSION();
        ImGui::CreateContext();
        ImGui::GetIO().IniFilename = nullptr;
        ImGui_ImplSDL3_InitForVulkan(window);
        ImGui_ImplVulkan_InitInfo imgui{};
        imgui.ApiVersion = VK_API_VERSION_1_4;
        imgui.Instance = device.instance();
        imgui.PhysicalDevice = device.physicalDevice();
        imgui.Device = device.device();
        imgui.QueueFamily = device.queueFamily();
        imgui.Queue = device.queue();
        imgui.DescriptorPoolSize = IMGUI_IMPL_VULKAN_MINIMUM_SAMPLED_IMAGE_POOL_SIZE;
        imgui.MinImageCount = 2;
        imgui.ImageCount = std::max(3u, device.swapchainImageCount());
        imgui.UseDynamicRendering = true;
        imgui.PipelineInfoMain.PipelineRenderingCreateInfo = {VK_STRUCTURE_TYPE_PIPELINE_RENDERING_CREATE_INFO};
        imgui.PipelineInfoMain.PipelineRenderingCreateInfo.colorAttachmentCount = 1;
        imgui.PipelineInfoMain.PipelineRenderingCreateInfo.pColorAttachmentFormats = &swapchainFormat;
        if (!ImGui_ImplVulkan_Init(&imgui)) throw std::runtime_error("ImGui Vulkan backend");
        }

        app::PanelState panel;
        panel.mute = options.mute;
        app::PanelInfo info;
        info.sampleCounts = device.sampleCounts();
        system_clock::duration offset{};
        std::optional<system_clock::time_point> fixedNow;
        system_clock::time_point goldenStart;
        uint64_t goldenTicks = 0;
        const auto wallNow = [&] { return fixedNow ? *fixedNow : system_clock::now(); };
        uint32_t coldWord = 0;
        const auto zoneWord = [&]() -> uint32_t {
            if (clockPtr && clockPtr->externals().mechaconParam) return clockPtr->externals().mechaconParam->at(0);
            return coldWord;
        };
        const auto setConsoleTo = [&](const scene::DateWords& rtc) {
            offset = std::chrono::seconds(scene::unixOf(rtc) - utcSeconds(wallNow()) - int64_t(scene::kBaseZone) * 60);
        };
        app::Bindings bindings = app::Bindings::defaults();
        app::PadReader reader;
        std::map<SDL_JoystickID, SDL_Gamepad*> gamepads;
        scene::ConfigItems items{};
        std::vector<std::string> visited;
        bool soakFailed = false;
        bool adjustExpected = false, adjustFailed = false;
        int adjustWrites = 0;
        int32_t yearOutside = 0;
        std::optional<int32_t> pendingYear;
        scene::Frame frame;
        bool fresh = false;
        uint64_t logicFrames = 0;
        std::unique_ptr<audio::LiveAudio> audio;
        uint32_t threadStartIn = 0;
        try {
            audio::LiveAudioOptions audioOptions;
            audioOptions.mute = options.mute;
            audioOptions.device = !golden;
            audioOptions.video = options.pal ? audio::Video::Pal : audio::Video::Ntsc;
            audioOptions.wav = options.audioWav;
            if (!options.audioWav.empty()) audioOptions.commandLog = options.audioWav.string() + ".commands.txt";
            audio = std::make_unique<audio::LiveAudio>(decoded && decoded->find("SNDIMAGE") ? audio::clockSoundSources(*decoded) : audio::clockSoundSources(folder), audioOptions);
            core::log(core::Level::Info, core::Subsystem::Audio, "init: ready, mute {}", options.mute);
        } catch (const std::exception& error) {
            core::log(core::Level::Error, core::Subsystem::Audio, "off: {}", error.what());
        }
        std::ofstream trace;
        if (!options.traceFile.empty()) trace.open(options.traceFile, std::ios::trunc);
        app::BootPhase lastPhase = app::BootPhase::Opening;
        bool emptyWarned = false;
        const auto phaseName = [](app::BootPhase phase) { return phase == app::BootPhase::Opening ? "opening" : phase == app::BootPhase::Gap ? "black gap" : "clock"; };
        const auto queueSounds = [&](const std::vector<scene::SoundCommand>& sounds) {
            if (!audio) return;
            for (const scene::SoundCommand& c : sounds) audio->queue({c.id, c.a1, c.a2, c.a3}, c.carriedA2, c.carriedA3);
        };
        bool clockThreadDone = false;
        uint32_t setUpIn = 0;
        const auto clockThreadStarts = [&] {
            if (clockThreadDone) return;
            clockThreadDone = true;
            setUpIn = scene::kClockInitFrames;
            std::vector<scene::SoundCommand> sounds;
            scene::clockThreadStart(sounds);
            queueSounds(sounds);
        };
        const auto clockSetsUp = [&](bool forced) {
            if (forced) return;
            std::vector<scene::SoundCommand> sounds;
            scene::clockSetUp(sounds);
            queueSounds(sounds);
        };
        bool bootClockForced = false;
        const auto stepClock = [&] {
            const system_clock::time_point now = wallNow() + offset;
            scene::Frame produced;
            if (pendingYear) {
                if (clockItems(now, zoneWord()).year != *pendingYear) adjustFailed = true;
                pendingYear.reset();
            }
            if (const scene::MenusState* menus = clockPtr->menus()) {
                const int32_t level = menus->page.level;
                if (level != 1) {
                    const scene::ClockItems local = clockItems(wallNow() + offset, zoneWord());
                    yearOutside = local.year;
                    items[6] = local.year, items[7] = local.month, items[8] = local.day, items[9] = local.hour, items[10] = local.minute, items[11] = local.second;
                }
                inputs.menu.pad = reader.frame();
                inputs.menu.rtcMirror = consoleNow(now, zoneWord()).rtc;
                inputs.configItems = items;
            }
            produced = clockPtr->frame(inputs);
            queueSounds(clockPtr->sounds());
            if (const auto& written = clockPtr->rtcWrite()) {
                setConsoleTo(*written);
                ++adjustWrites;
                pendingYear = clockPtr->items()[6];
                if (*pendingYear != yearOutside + 1) adjustFailed = true;
                if (save) {
                    try {
                        app::StoredSettings stored = app::readStored(options.settings);
                        stored.clockOffset = std::chrono::duration_cast<std::chrono::seconds>(offset).count();
                        app::writeStored(options.settings, stored);
                        storedAtStart.clockOffset = stored.clockOffset;
                    } catch (const std::exception& error) {
                        core::log(core::Level::Error, core::Subsystem::Clock, "settings not saved: {}", error.what());
                    }
                }
            }
            if (const scene::MenusState* menus = clockPtr->menus()) {
                items = clockPtr->items();
                const app::Screen screen = app::screenOf(*menus, clockPtr->state().menuRamp);
                if (visited.empty() || visited.back() != app::screenName(screen)) visited.push_back(app::screenName(screen));
                if (clockPtr->state().mode == 3 || clockPtr->state().scene.leaving != 0 || menus->screenCode == 9999) soakFailed = true;
            }
            scene::fillTime(inputs);
            inputs.threadStep = true;
            app::nextFrame(inputs);
            return produced;
        };
        std::unique_ptr<app::BootChain> chain;
        app::OpeningScreen* bootOpening = nullptr;
        const auto startClock = [&](bool wide, std::optional<uint32_t> randState) {
            scene::ColdInputs cold = app::hostInputs({options.pal, options.language, options.aspect}, wallNow(), storedAtStart, *hostZone);
            if (storedAtStart.clockOffset && !cold.clockOffset) core::log(core::Level::Warn, core::Subsystem::Clock, "clockOffset {} s puts the clock outside 2000..2099: dropped", *storedAtStart.clockOffset);
            offset = std::chrono::seconds(cold.clockOffset.value_or(0));
            core::log(core::Level::Info, core::Subsystem::Clock, "start: console RTC {:04}-{:02}-{:02} {:02}:{:02}:{:02}, offset {} s", cold.rtc.year, cold.rtc.month, cold.rtc.day,
                      cold.rtc.hour, cold.rtc.minute, cold.rtc.second, cold.clockOffset.value_or(0));
            cold.wide = wide;
            if (randState) cold.randState = *randState;
            cold.gsAllocator = assets::clockTexturesEnd();
            scene::ColdStartOut start = scene::coldStart<scene::NativeArithmetic>(coldAssets, cold);
            clockInputs = std::move(start.clock);
            if (clockInputs.menus) clockInputs.menus->options.browserEnters = false;
            clockInputs.passNames = device.labels() || !options.traceFile.empty();
            clockPtr = std::make_unique<Clock>(clockInputs);
            inputs = start.frame;
            coldWord = inputs.menu.mechaconParam ? inputs.menu.mechaconParam->at(0) : 0u;
            app::firstFrame(inputs);
            inputs.threadStep = false;
            items = clockInputs.menus->items;
        };
        const auto buildBoot = [&] {
            scene::opening::BootOptions boot;
            boot.lightsPhase = options.lightsPhase;
            if (options.towersDemo) {
                scene::opening::History history{};
                const char* names[] = {"DEMO A", "DEMO B", "DEMO C", "DEMO D", "DEMO E"};
                for (size_t i = 0; i < 5; ++i) {
                    for (size_t c = 0; names[i][c]; ++c) history[i].name[c] = names[i][c];
                    history[i].count = static_cast<uint8_t>(3 + 4 * i);
                    history[i].mask = static_cast<uint8_t>(0x0F << i);
                    history[i].mainCell = static_cast<uint8_t>(i);
                }
                boot.history = history;
            }
            auto opening = std::make_unique<app::OpeningScreen>(boot, program);
            bootOpening = opening.get();
            bootClockForced = boot.clockForced;
            clockThreadDone = false;
            setUpIn = 0;
            threadStartIn = 0;
            queueSounds(bootOpening->startCommands());
            clockPtr.reset();
            auto clockScreen = std::make_unique<FunctionScreen>([&] {
                if (!clockPtr) startClock(true, bootOpening->randState());
                return stepClock();
            });
            chain = std::make_unique<app::BootChain>(std::move(opening), std::move(clockScreen), scene::opening::kFramesToClock);
        };
        const auto settle = [&](const auto& done) {
            for (int n = 0; !done() && n < 2000; ++n) {
                const system_clock::time_point now = wallNow() + offset;
                inputs.time = clockTime(now, zoneWord());
                inputs.items = clockItems(now, zoneWord());
                stepClock();
            }
        };
        if (golden) {
            goldenStart = hostZone->to_sys(std::chrono::local_days{std::chrono::year(2026) / 1 / 1} + std::chrono::hours(12), std::chrono::choose::earliest);
            fixedNow = goldenStart;
            panel.mute = true;
        }
        if (options.boot) {
            buildBoot();
        } else {
            startClock(false, std::nullopt);
            settle([&] { return clockPtr->state().mode == 0 && clockPtr->menus()->mainMenu.ramp.state == 2; });
            if (options.clockStart) {
                const auto run = [&](int count) {
                    int n = 0;
                    settle([&] { return n++ >= count; });
                };
                const auto tap = [&](app::PadButton button) {
                    const uint32_t bit = app::bitOf(button);
                    reader.down(0, bit);
                    run(6);
                    reader.up(0, bit);
                    run(1);
                };
                tap(app::PadButton::Down);
                tap(app::PadButton::Cross);
                settle([&] { return clockPtr->menus()->page.ramp.state == 2; });
                tap(app::PadButton::Square);
                settle([&] { return clockPtr->state().menuRamp.state == 2; });
                if (audio) audio->discardPending();
            }
            clockThreadStarts();
            std::printf("start: frame %d, mode %d, menu ramp state %d\n", clockPtr->state().counter, clockPtr->state().mode, clockPtr->state().menuRamp.state);
        }
        app::Profile profile;
        const auto screenKey = [&]() -> std::string {
            if (chain && chain->phase() != app::BootPhase::Clock) return chain->name();
            return visited.empty() ? "clock" : visited.back();
        };
        const auto produce = [&] {
            const Uint64 produceStart = SDL_GetTicksNS();
            const system_clock::time_point now = wallNow() + offset;
            inputs.time = clockTime(now, zoneWord());
            inputs.items = clockItems(now, zoneWord());
            core::Log::get().setFrame(logicFrames);
            std::string sent;
            if (audio)
                for (const audio::SoundCommand& c : audio->drain()) sent += std::format("{}{:x}({},{},{})", sent.empty() ? "" : ",", c.id, c.a1, c.a2, c.a3);
            if (setUpIn > 0 && --setUpIn == 0) clockSetsUp(bootClockForced);
            if (threadStartIn > 0 && --threadStartIn == 0) clockThreadStarts();
            if (chain) {
                const bool inOpening = chain->phase() == app::BootPhase::Opening;
                chain->step();
                frame = std::move(chain->frame());
                if (chain->phase() != lastPhase) {
                    const scene::opening::HandOff* h = bootOpening->handOff();
                    core::log(core::Level::Info, core::Subsystem::Boot, "phase {} -> {}, opening counter {}, hand-off {}", phaseName(lastPhase), chain->name(), bootOpening->counter(),
                              h ? std::format("module {} execute type {}", h->module, h->executeAppType) : std::string("none"));
                    if (chain->phase() != app::BootPhase::Opening) threadStartIn = scene::kThreadStartLagFrames;
                    lastPhase = chain->phase();
                }
                if (inOpening) queueSounds(bootOpening->commands());
            } else {
                frame = stepClock();
            }
            if (audio) {
                audio->setMuted(panel.mute);
                audio->setVolume(panel.volume);
                audio->step();
            }
            ++logicFrames;
            if (!emptyWarned && frame.passes.empty() && (!chain || chain->phase() == app::BootPhase::Clock)) {
                core::log(core::Level::Warn, core::Subsystem::Clock, "the clock produced a frame with no passes");
                emptyWarned = true;
            }
            const double produceMs = double(SDL_GetTicksNS() - produceStart) * 1e-6;
            if (trace.is_open()) {
                size_t vertices = 0;
                for (const scene::Pass& pass : frame.passes) vertices += pass.vertices.size();
                const bool inClock = !chain || chain->phase() == app::BootPhase::Clock;
                const int32_t counter = inClock && clockPtr ? clockPtr->state().counter : bootOpening ? bootOpening->counter() : 0;
                trace << std::format(R"({{"frame":{},"phase":"{}","counter":{},"screen":"{}","mode":{},"ramp":{},"sent":"{}","queued":{},"passes":{},"vertices":{},"produceMs":{:.3f},"error":"{}"}})",
                                     logicFrames, chain ? chain->name() : "clock", counter, inClock && !visited.empty() ? visited.back() : "", inClock && clockPtr ? clockPtr->state().mode : -1,
                                     inClock && clockPtr ? clockPtr->state().menuRamp.state : -1, sent, audio ? audio->queuedFrames() : -1, frame.passes.size(), vertices, produceMs, core::Log::get().lastError().empty() ? "" : "yes")
                      << '\n';
            }
            fresh = true;
            if (options.profile) profile.add(screenKey(), app::Stage::Produce, produceMs);
            if (fixedNow) {
                ++goldenTicks;
                *fixedNow = goldenStart + std::chrono::duration_cast<system_clock::duration>(std::chrono::duration<double>(double(goldenTicks) * 1001.0 / 60000.0));
            }
        };
        if (!golden) produce();

        std::string screenshotName;
        const auto shoot = [&](const std::string& name) {
            const render::NativeOutput& out = renderer.output();
            std::vector<uint8_t> rgba = renderer.readTarget(panel.shown);
            for (size_t i = 3; i < rgba.size(); i += 4) rgba[i] = 255;
            const std::filesystem::path path = options.screenshots / (name + "-" + std::to_string(out.width) + "x" + std::to_string(out.height) + "-msaa" + std::to_string(out.samples) + ".png");
            app::writePng(path, out.width, out.height, rgba);
            info.lastScreenshot = path.string();
            std::printf("screenshot: %s\n", info.lastScreenshot.c_str());
        };

        std::vector<Step> script;
        const auto resize = [&](int w, int h) { return [=] { SDL_SetWindowSize(window, w, h); }; };
        const auto set = [&](app::Resolution r, uint32_t samples) { return [&panel, r, samples] { panel.resolution = r; panel.samples = samples; }; };
        const auto shot = [&](std::string name) { return [&screenshotName, name] { screenshotName = name; }; };
        if (options.smoke) {
            script = {{1.0, resize(800, 600)}, {2.0, resize(1024, 700)}, {2.5, [&] { SDL_MinimizeWindow(window); }}, {3.5, [&] { SDL_RestoreWindow(window); }},
                      {4.5, resize(1280, 896)}};
            options.soak = 5.5;
        } else if (options.soak > 0 && options.boot) {
            const auto press = [&](double at, app::PadButton button) {
                const uint32_t bit = app::bitOf(button);
                script.push_back({at, [&reader, bit] { reader.down(0, bit); }});
                script.push_back({at + 0.1, [&reader, bit] { reader.up(0, bit); }});
            };
            script.push_back({2.0, shot("boot-opening")});
            script.push_back({9.0, shot("boot-clock")});
            press(10.0, app::PadButton::Square);
            script.push_back({12.5, shot("boot-after-square")});
            press(13.0, app::PadButton::Down);
            press(14.0, app::PadButton::Cross);
            script.push_back({17.0, shot("boot-menu-next")});
            for (double at = 25.0; at < options.soak - 1.0; at += 10.0) script.push_back({at, shot("boot-t" + std::to_string(int(at)))});
        } else if (options.soak > 0 && !options.clockStart) {
            const auto press = [&](double at, app::PadButton button) {
                const uint32_t bit = app::bitOf(button);
                script.push_back({at, [&reader, bit] { reader.down(0, bit); }});
                script.push_back({at + 0.1, [&reader, bit] { reader.up(0, bit); }});
            };
            using app::PadButton;
            script.push_back({1.5, shot("main-menu")});
            press(2.0, PadButton::Down);
            press(3.5, PadButton::Up);
            press(5.0, PadButton::Up);
            press(6.5, PadButton::Triangle);
            press(7.0, PadButton::Down);
            press(7.25, PadButton::Up);
            script.push_back({7.5, shot("version")});
            press(7.7, PadButton::Circle);
            press(8.0, PadButton::Cross);
            press(10.0, PadButton::Down);
            press(11.5, PadButton::Cross);
            script.push_back({17.0, shot("configuration")});
            press(18.0, PadButton::Cross);
            press(19.5, PadButton::Up);
            press(21.0, PadButton::Cross);
            script.push_back({22.0, [&] { adjustExpected = true; }});
            press(23.0, PadButton::Cross);
            press(24.0, PadButton::Up);
            press(25.0, PadButton::Circle);
            for (double at : {26.0, 27.0, 28.0}) press(at, PadButton::Down);
            press(30.0, PadButton::Cross);
            script.push_back({32.0, shot("entry")});
            press(33.0, PadButton::Right);
            press(34.5, PadButton::Circle);
            press(36.0, PadButton::Cross);
            press(38.0, PadButton::Cross);
            press(40.0, PadButton::Square);
            script.push_back({44.0, shot("clock-alone")});
            script.push_back({45.0, resize(800, 600)});
            script.push_back({46.0, set(app::Resolution::Window, 4)});
            press(48.0, PadButton::Square);
            script.push_back({50.0, [&] { SDL_MinimizeWindow(window); }});
            script.push_back({51.0, [&] { SDL_RestoreWindow(window); }});
            script.push_back({52.0, set(app::Resolution::Quadruple, 4)});
            press(54.0, PadButton::Circle);
            script.push_back({55.0, set(app::Resolution::Native, 1)});
            script.push_back({56.0, resize(1280, 896)});
        } else if (options.soak > 0) {
            script = {
                {8.0, shot("native")},
                {9.0, resize(800, 600)},
                {10.0, set(app::Resolution::Window, 4)},
                {12.0, shot("window")},
                {13.0, [&] { SDL_MinimizeWindow(window); }},
                {15.0, [&] { SDL_RestoreWindow(window); }},
                {17.0, set(app::Resolution::Double, 8)},
                {20.0, set(app::Resolution::Quadruple, 4)},
                {22.0, shot("x4")},
                {23.0, [&] { panel.paused = true; }},
                {24.0, [&] { panel.step = true; }},
                {24.5, [&] { panel.step = true; }},
                {25.0, [&] { panel.step = true; }},
                {26.0, [&] { panel.paused = false; }},
                {27.0, [&] { panel.shown = scene::TargetName::RefractionSource; }},
                {29.0, [&] { panel.shown = scene::TargetName::Work; }},
                {31.0, [&] { panel.shown = scene::TargetName::Display; }},
                {32.0, resize(1600, 1000)},
                {34.0, set(app::Resolution::Native, 2)},
                {36.0, [&] { panel.time[0] = 23; panel.time[1] = 59; panel.time[2] = 50; panel.setTime = true; }},
                {38.0, set(app::Resolution::Window, 1)},
                {40.0, [&] { panel.tvAspect = false; }},
                {42.0, resize(1280, 896)},
                {44.0, [&] { panel.tvAspect = true; }},
                {46.0, set(app::Resolution::Double, 4)},
                {49.0, [&] { panel.localTime = true; }},
                {51.0, [&] { SDL_MinimizeWindow(window); }},
                {52.0, [&] { SDL_RestoreWindow(window); }},
                {53.0, set(app::Resolution::Window, 8)},
                {55.0, resize(700, 900)},
                {57.0, set(app::Resolution::Native, 1)},
                {58.0, resize(1280, 896)},
            };
        }
        std::stable_sort(script.begin(), script.end(), [](const Step& l, const Step& r) { return l.at < r.at; });
        size_t next = 0;

        const double step = 1001.0 / 60000.0;
        // One present per logic frame, the loop sleeping until the next step is due: FIFO then shows every logic
        // frame for the same number of refreshes. Presenting as fast as the loop wakes (2 frames in flight, so in
        // bursts) showed the 59.94 Hz frames for uneven runs of refreshes, a judder.
        const auto refreshRate = [&] {
            const SDL_DisplayMode* mode = SDL_GetCurrentDisplayMode(SDL_GetDisplayForWindow(window));
            return mode ? double(mode->refresh_rate) : 0.0;
        };
        double owed = 0;
        const Uint64 begun = SDL_GetTicksNS();
        Uint64 last = begun, lastPresent = begun;
        uint64_t presented = 0;
        // Intervals between presents of consecutive logic frames, for the cadence report.
        uint64_t intervals = 0, uneven = 0;
        double intervalSum = 0, intervalWorst = 0;
        float fps = 0;
        if (golden) {
            renderer.configure(options.goldenOutput == "x2-msaa4" ? render::NativeOutput{1280, 896, 4} : render::NativeOutput{640, 448, 1});
            std::optional<app::GoldenWriter> writer;
            std::optional<app::GoldenChecker> checker;
            if (options.golden == "record") writer.emplace(options.goldenFile);
            else checker.emplace(options.goldenFile);
            const std::span<const app::ScenarioPress> presses = app::goldenScenario();
            uint64_t clockFrames = 0;
            constexpr uint64_t kGoldenCap = 4000;
            bool identical = true;
            while (clockFrames < app::goldenFrames()) {
                if (logicFrames >= kGoldenCap) {
                    identical = false;
                    std::printf("golden: DIFFERENT - the boot never reached the clock in %llu frames\n", static_cast<unsigned long long>(kGoldenCap));
                    break;
                }
                for (const app::ScenarioPress& press : presses) {
                    if (press.afterClock == clockFrames) reader.down(0, app::bitOf(press.button));
                    if (press.afterClock + 6 == clockFrames) reader.up(0, app::bitOf(press.button));
                }
                produce();
                if (font && frame.textureSet == scene::TextureSet::Clock) renderer.setGlyphCache(*font, frame.glyphs);
                renderer.draw(frame);
                app::GoldenLine line;
                line.frame = logicFrames;
                line.phase = chain ? chain->name() : "clock";
                line.screen = visited.empty() ? "" : visited.back();
                line.scene = app::hashFrame(frame);
                const std::vector<uint8_t> pixels = renderer.readTarget(scene::TargetName::Display);
                line.pixels = app::hashBytes(pixels);
                if (audio) {
                    const std::vector<int16_t>& samples = audio->lastFrame();
                    line.sound = app::hashBytes({reinterpret_cast<const uint8_t*>(samples.data()), samples.size() * sizeof(int16_t)});
                }
                if (writer) writer->add(line);
                else if (!checker->check(line)) {
                    std::printf("%s\n", checker->report().c_str());
                    identical = false;
                    break;
                }
                if (!chain || chain->phase() == app::BootPhase::Clock) ++clockFrames;
            }
            if (checker && identical && checker->compared() != checker->size()) {
                identical = false;
                std::printf("golden: DIFFERENT - file has %llu frames, run compared %llu\n", static_cast<unsigned long long>(checker->size()), static_cast<unsigned long long>(checker->compared()));
            }
            std::string list;
            for (const std::string& name : visited) list += (list.empty() ? "" : ", ") + name;
            std::printf("golden: %llu frames %s\nscreens visited: %s\n", static_cast<unsigned long long>(checker ? checker->compared() : logicFrames), !identical ? "DIFFERENT" : writer ? "recorded" : "identical", list.c_str());
            if (!identical) code = 1;
            if (device.validationErrors() != 0) {
                std::printf("golden: %u validation errors\n", device.validationErrors());
                code = 1;
            }
        }
        bool running = !golden;
        while (running) {
            SDL_Event event;
            while (SDL_PollEvent(&event)) {
                ImGui_ImplSDL3_ProcessEvent(&event);
                if (event.type == SDL_EVENT_GAMEPAD_ADDED) {
                    if (SDL_Gamepad* pad = SDL_OpenGamepad(event.gdevice.which)) gamepads[event.gdevice.which] = pad;
                }
                if (!ImGui::GetIO().WantCaptureKeyboard || event.type != SDL_EVENT_KEY_DOWN) app::feed(reader, bindings, event);
                if (event.type == SDL_EVENT_GAMEPAD_REMOVED) {
                    const auto found = gamepads.find(event.gdevice.which);
                    if (found != gamepads.end()) {
                        SDL_CloseGamepad(found->second);
                        gamepads.erase(found);
                    }
                }
                if (event.type == SDL_EVENT_QUIT || event.type == SDL_EVENT_WINDOW_CLOSE_REQUESTED) running = false;
            }
            const Uint64 now = SDL_GetTicksNS();
            const double elapsed = double(now - begun) * 1e-9, delta = double(now - last) * 1e-9;
            last = now;
            if (delta > 0) fps = fps * 0.95f + float(1.0 / delta) * 0.05f;
            if (options.soak > 0) {
                while (next < script.size() && elapsed >= script[next].at) script[next++].act();
                if (elapsed >= options.soak) running = false;
            }

            if (panel.setTime) {
                scene::DateWords wanted = consoleNow(wallNow() + offset, zoneWord()).local;
                wanted[3] = panel.time[0], wanted[4] = panel.time[1], wanted[5] = panel.time[2];
                setConsoleTo(scene::rtcOf(wanted, scene::zoneOf(zoneWord())));
                panel.setTime = false;
            }
            if (panel.localTime) {
                offset = {};
                panel.localTime = false;
            }
            if (panel.paused) {
                owed = 0;
                if (panel.step) produce();
            } else if (capturing) {
                if (!fresh) produce();
            } else {
                owed += std::min(delta, 0.25);
                for (int n = 0; owed >= step; ++n) {
                    owed -= step;
                    if (n < 4) produce();
                }
            }
            panel.step = false;
            const double sincePresent = double(now - lastPresent) * 1e-9;
            if (!capturing && (panel.paused ? sincePresent < step : !fresh)) {
                const double wait = panel.paused ? step - sincePresent : step - owed;
                SDL_DelayPrecise(static_cast<Uint64>(std::max(0.0, wait) * 1e9));
                continue;
            }

            const scene::ClockTime shownTime = clockTime(wallNow() + offset, zoneWord());
            char text[64];
            std::snprintf(text, sizeof text, "%02d:%02d:%02d", shownTime.hours, shownTime.minutes, shownTime.seconds);
            info.clock = text;
            if (chain && chain->phase() != app::BootPhase::Clock) {
                info.screen = chain->name();
                info.counter = bootOpening->counter();
                info.stage = bootOpening->stage();
                info.cameraZ = bootOpening->cameraZ();
                if (const scene::opening::HandOff* h = bootOpening->handOff()) info.handOff = "module " + std::to_string(h->module) + ", execute type " + std::to_string(h->executeAppType);
                info.sounds = bootOpening->sounds().size();
            }
            info.logicFrames = logicFrames;
            info.phase = chain ? chain->name() : "clock";
            info.lastError = core::Log::get().lastError();
            info.audioAvailable = bool(audio);
            if (audio) {
                const audio::LiveAudioStats& a = audio->stats();
                char line[160];
                std::snprintf(line, sizeof line, "%s, queue %u..%u frames, %llu underruns, %llu overruns, peak %u", a.failed ? "stopped" : a.deviceOpen ? "device open" : "no device",
                              a.minQueuedFrames == UINT32_MAX ? 0u : a.minQueuedFrames, a.maxQueuedFrames, static_cast<unsigned long long>(a.underruns),
                              static_cast<unsigned long long>(a.overruns), a.peak);
                info.audio = line;
            }
            if (!chain || chain->phase() == app::BootPhase::Clock) info.screen = visited.empty() ? "" : visited.back();
            info.pad = inputs.menu.pad;
            info.framesPerSecond = fps;
            info.validationErrors = device.validationErrors();
            ImGui_ImplVulkan_NewFrame();
            ImGui_ImplSDL3_NewFrame();
            ImGui::NewFrame();
            app::drawPanel(panel, info);
            ImGui::Render();

            if (font && frame.textureSet == scene::TextureSet::Clock) renderer.setGlyphCache(*font, frame.glyphs);
            auto context = device.beginFrame();
            if (!context) {
                SDL_Delay(10);
                continue;
            }
            const float aspect = panel.tvAspect ? 4.0f / 3.0f : 640.0f / 448.0f;
            const render::NativeOutput output = outputFor(panel, device.swapchainExtent(), aspect);
            if (!(output == renderer.output())) {
                renderer.configure(output);
                fresh = true;
            }
            info.outputWidth = output.width;
            info.outputHeight = output.height;
            const std::string profileScreen = options.profile ? screenKey() : std::string();
            if (fresh) {
                const Uint64 recordStart = SDL_GetTicksNS();
                renderer.record(context->cmd, frame);
                if (options.profile) profile.add(profileScreen, app::Stage::Record, double(SDL_GetTicksNS() - recordStart) * 1e-6);
            }
            const Uint64 presentStart = SDL_GetTicksNS();
            const bool newFrame = fresh;
            fresh = false;
            renderer.present(context->cmd, context->image, device.swapchainExtent(), panel.shown, aspect);

            VkRenderingAttachmentInfo colour{VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO};
            colour.imageView = context->view;
            colour.imageLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;
            colour.loadOp = VK_ATTACHMENT_LOAD_OP_LOAD;
            colour.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
            VkRenderingInfo rendering{VK_STRUCTURE_TYPE_RENDERING_INFO};
            rendering.renderArea = {{0, 0}, device.swapchainExtent()};
            rendering.layerCount = 1;
            rendering.colorAttachmentCount = 1;
            rendering.pColorAttachments = &colour;
            vkCmdBeginRendering(context->cmd, &rendering);
            ImGui_ImplVulkan_RenderDrawData(ImGui::GetDrawData(), context->cmd);
            vkCmdEndRendering(context->cmd);
            device.endFrame(*context);
            if (options.profile) profile.add(profileScreen, app::Stage::Present, double(SDL_GetTicksNS() - presentStart) * 1e-6);
            ++presented;
            const Uint64 shown = now;
            if (newFrame && !panel.paused && presented > 1) {
                const double interval = double(shown - lastPresent) * 1e-9;
                ++intervals;
                intervalSum += interval;
                intervalWorst = std::max(intervalWorst, std::fabs(interval - step));
                uneven += std::fabs(interval - step) > 0.002;
            }
            lastPresent = shown;

            if (capturing) {
                if (captureAll || captureAt.count(logicFrames)) {
                    char name[32];
                    std::snprintf(name, sizeof name, "boot-%03llu", static_cast<unsigned long long>(logicFrames));
                    shoot(name);
                }
                if (logicFrames >= 246 + (captureAll ? 40 : 0)) running = false;
            }
            if (panel.skipOpening && chain && chain->phase() != app::BootPhase::Clock) {
                panel.skipOpening = false;
                chain.reset();
                bootOpening = nullptr;
                startClock(false, std::nullopt);
                clockThreadStarts();
                produce();
            }
            if (panel.restartOpening) {
                panel.restartOpening = false;
                visited.clear();
                lastPhase = app::BootPhase::Opening;
                buildBoot();
                logicFrames = 0;
                produce();
            }
            if (panel.screenshot || !screenshotName.empty()) {
                shoot(screenshotName.empty() ? "clock" : screenshotName);
                panel.screenshot = false;
                screenshotName.clear();
            }
        }
        if (audio) std::printf("%s\n", audio->finish().c_str());
        vkDeviceWaitIdle(device.device());
        if (!golden) {
            ImGui_ImplVulkan_Shutdown();
            ImGui_ImplSDL3_Shutdown();
            ImGui::DestroyContext();
        }
        if (options.soak > 0)
            std::printf("%s: %.1f s, %llu frames presented, %llu logic frames, %u validation errors\n", options.smoke ? "smoke" : "soak", options.soak,
                        static_cast<unsigned long long>(presented), static_cast<unsigned long long>(logicFrames), device.validationErrors());
        if (options.soak > 0)
            std::printf("display %.2f Hz; %llu present intervals, mean %.3f ms (step %.3f ms), %llu off by more than 2 ms, worst off by %.3f ms\n", refreshRate(),
                        static_cast<unsigned long long>(intervals), intervals ? intervalSum / double(intervals) * 1e3 : 0.0, step * 1e3,
                        static_cast<unsigned long long>(uneven), intervalWorst * 1e3);
        if (options.soak > 0 && clockPtr && clockPtr->menus()) {
            std::string list;
            for (const std::string& name : visited) list += (list.empty() ? "" : ", ") + name;
            std::printf("screens visited: %s\n", list.c_str());
            if (soakFailed) {
                std::fprintf(stderr, "soak: mode 3, leaving or screen code 9999 seen\n");
                code = 1;
            }
            if (adjustExpected && (adjustWrites != 1 || adjustFailed)) {
                std::fprintf(stderr, "soak: Clock Adjustment wrote %d times (one expected, none for the cancel) or the edited year was not shown next frame\n", adjustWrites);
                code = 1;
            }
        }
        if (options.profile) std::printf("%s", profile.table().c_str());
        if (device.validationErrors() != 0) code = 1;
    } catch (const render::DeviceLost& error) {
        core::log(core::Level::Error, core::Subsystem::Render, "device lost: {}", error.what());
        code = 2;
    } catch (const std::exception& error) {
        core::log(core::Level::Error, core::Subsystem::App, "fatal: {}", error.what());
        code = 1;
    }
    SDL_DestroyWindow(window);
    SDL_Quit();
    return code;
}
