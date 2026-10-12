#include "Scene/ColdStart.hpp"

#include <optional>
#include <type_traits>

#include "Scene/Arithmetic.hpp"
#include "Scene/ColdCamera.hpp"
#include "Scene/ColdConfig.hpp"
#include "Scene/ColdFont.hpp"
#include "Scene/ColdRamps.hpp"
#include "Scene/ColdState.hpp"
#include "Scene/ColdTime.hpp"
#include "Scene/ElfRecords.hpp"

namespace scene {

namespace {

constexpr uint32_t kScaleTarget = 0x370294;
constexpr uint32_t kScaleFactor = 0x36FC10;
constexpr uint32_t kPosition = 0x2B2190;
constexpr uint32_t kDirection = 0x2B21A0;
constexpr uint32_t kUp = 0x2B21B0;
constexpr uint32_t kRotation = 0x2B21C0;
constexpr uint32_t kZmax = 0x36FB8C;
constexpr uint32_t kCameraFactor = 0x36FB90;
constexpr uint32_t kGreys = 0x370AA8;
constexpr uint32_t kRingRecord = 0x2B5F70;
constexpr uint32_t kTint = 0x2B21E0;
constexpr uint32_t kBlur = 0x2B6120;
constexpr uint32_t kCopy = 0x2B6060;
constexpr uint32_t kBars = 0x2B2220;
constexpr uint32_t kColumn = 0x2B2500;
constexpr uint32_t kTemplate = 0x2B5490;
constexpr uint32_t kClearColour = 0x2B21D0;
constexpr uint32_t kTube = 0x36FC14;
constexpr uint32_t kOrbConstants = 0x36FBDC;
constexpr uint32_t kOrbColour = 0x2B5670;
constexpr uint32_t kOrbColours = 0x2B5680;
constexpr uint32_t kDialogClosing = 0x2B46B8;
constexpr uint32_t kFirstRun = 0x2B46D0;
constexpr uint32_t kPanel7 = 0x2B2E00;
constexpr uint32_t kPanel8On = 0x370140;
constexpr uint32_t kVersionRecord = 0x2B2FE8, kBrowserVersion = 0x370680;
constexpr uint32_t kPanel8 = 0x37013C;
constexpr uint32_t kEntryActive = 0x3702C8;
constexpr uint32_t kListConstants = 0x36FC00;
constexpr uint32_t kAdjustFields = 0x2B2580;
constexpr uint32_t kConfigGate = 0x370300;
constexpr uint32_t kListFade = 0x37029C;
constexpr uint32_t kCubeList = 0x3702A8;
constexpr uint32_t kCubeColours = 0x2B5750;
constexpr uint32_t kCubeRecord = 0x2B5AF0;
constexpr uint32_t kCubeConstants = 0x36FBE8;
constexpr uint32_t kCentreFactors = 0x36FC50;
constexpr uint32_t kLayerClear = 0x2B5CC0;
constexpr uint32_t kAddRecord = 0x2B5FE0;
constexpr uint32_t kHalfRecord = 0x2B6020;
constexpr uint32_t kChainRecord = 0x2B60E0;
constexpr uint32_t kZmaxScreen = 0x36FC0C;
constexpr int32_t kHandoffCode = 0x64;
constexpr float kScreenDistance = 512.0f;
constexpr float kScreenCentre = 2048.0f;
constexpr float kScreenMinZ = 1.0f;
constexpr float kScreenNear = 1.0f;
constexpr float kScreenFar = 65536.0f;

TubeConstants tubeAt(const ProgramImage& p, uint32_t a) {
    return {p.single(a), p.single(a + 4), p.single(a + 8), p.single(a + 12), p.single(a + 16), p.single(a + 20), p.single(a + 24), p.single(a + 28)};
}

}

// HDD OSD 1.10U 0x225DB0 module_clock_init_resources and the thread set-up, in the order of its calls
template <class A>
ColdStartOut coldStart(const ColdAssets& assets, const ColdInputs& in) {
    std::optional<EeRounding> truncating;
    if constexpr (std::is_same_v<A, NativeArithmetic>) truncating.emplace();
    const ProgramImage& p = *assets.program;
    const ColdCameraOut camera = coldCamera(p, in.pal, in.screenWidth, in.screenHeight, in.field);
    const ColdTimeOut time = coldTime<A>(p, in.rtc, in.timeZone, in.summerTime, in.pal);
    const ColdLengths lengths = coldLengths(in.pal);
    const ColdSettingsWords words = coldSettingsWords(p, in);
    const int32_t videoMode = in.pal ? 2 : 1;
    const ColdConfigOut config = coldConfig<A>(p, words, videoMode, lengths, time);
    const ColdStateOut state = coldState<A>(p, lengths, time.time, in.randState);

    ColdStartOut out;
    ClockInputs& c = out.clock;
    ClockState& s = c.state;
    s.time = time.time;
    s.eased = state.eased;
    s.state = state.rods;
    s.appearance = state.appearance;
    s.colours = state.colours;
    s.cycleCounters = state.cycle;
    s.cycleTables = state.cycleTables;
    s.logicConstants = state.logicConstants;
    s.scene = {camera.scale, camera.leaving ? 1 : 0, camera.field};
    s.scaleTarget = p.single(kScaleTarget);
    s.scaleFactor = p.single(kScaleFactor);
    s.timeFilled = time.timeFilled ? 1 : 0;
    s.spin = 0;
    s.mode = camera.mode;
    s.level = 0;
    s.overlayLevel = camera.overlayLevel;
    s.vignetteRamp = lengths.vignette;
    s.vignetteLength = lengths.vignetteLength;
    s.menuRamp = lengths.menu;
    s.tail = lengths.tail;
    s.counter = 0;
    s.proportions = camera.proportions;
    s.position = vec4At(p, kPosition);
    s.direction = vec4At(p, kDirection);
    s.up = vec4At(p, kUp);
    s.rotation = vec4At(p, kRotation);
    s.cameraOffset = camera.cameraOffset;
    s.zmax = p.single(kZmax);
    s.cameraFactor = p.single(kCameraFactor);

    HeadState& h = c.head;
    h.greyRamp = lengths.grey;
    for (uint32_t i = 0; i < 3; ++i) h.greys[i] = p.integer(kGreys + 4 * i);
    h.vignetteRamp = lengths.vignette;
    h.ring = {p.integer(kRingRecord), p.integer(kRingRecord + 4), p.integer(kRingRecord + 8), p.integer(kRingRecord + 12), p.integer(kRingRecord + 16), p.integer(kRingRecord + 20)};
    h.tint = rectAt(p, kTint);
    h.blur = rectAt(p, kBlur);
    h.copy = rectAt(p, kCopy);
    h.fade = camera.fade;
    h.bars = rectAt(p, kBars);
    h.column = rectAt(p, kColumn);

    c.rodTemplate = rodRecordAt(p, kTemplate);
    c.orbs.rings = state.rings;
    c.orbs.spriteFade = state.spriteFade;
    c.orbs.fraction = state.eased.fraction;
    c.mesh = assets.mesh;
    c.clearColour = colourAt(p, kClearColour);
    c.firstDisplayClear = {0, 0, 0, 0};
    c.tube = tubeAt(p, kTube);
    c.minuteFactor = p.single(kOrbConstants);
    c.fractionEasing = p.single(kOrbConstants + 4);
    c.orbColour = colourAt(p, kOrbColour);
    c.hasEntryData = true;
    c.wide = in.wide ? 1 : 0;
    c.orbRandom = state.orbRandom;
    for (uint32_t k = 0; k < kOrbCount; ++k) c.orbColours[k] = colourAt(p, kOrbColours + 16 * k);
    c.width = static_cast<int32_t>(in.screenWidth);
    c.height = static_cast<int32_t>(in.screenHeight);

    const int32_t screenCode = in.wide ? kHandoffCode : static_cast<int32_t>(in.screenCode);
    TextRamps& ramps = c.text.ramps;
    ramps.config = lengths.config;
    ramps.mainMenu = lengths.mainMenu;
    ramps.version = lengths.version;
    ramps.dialogClosing = rampAt(p, kDialogClosing);
    ramps.firstRun = rampAt(p, kFirstRun);
    ramps.dialog = rampSet({}, lengths.tail);
    ramps.lead = lengths.menuShort;
    ramps.body = lengths.body;
    ramps.panel7 = p.integer(kPanel7);
    ramps.panel8On = p.integer(kPanel8On);
    ramps.panel8 = p.integer(kPanel8);
    ramps.adjustRow = 0;
    c.text.settings = {config.items[13], config.items[14], config.param, videoMode};

    if (assets.font) {
        const ColdFontOut font = coldFont<A>(assets.program, assets.font, in.pal, in.gsAllocator);
        c.text.cache = font.cache;
        c.text.font = font.state;
        c.font = assets.font;
        c.program = assets.program;
    }

    MenusInputs menus;
    MenusState& m = menus.menus;
    m.page = config.page;
    m.entries = config.entries;
    m.mainMenu = config.menu;
    m.versionRamp = lengths.version;
    m.version.title = p.integer(kVersionRecord);
    m.version.count = p.integer(kVersionRecord + 8);
    m.version.shown = p.integer(kVersionRecord + 12);
    m.versionList = {{0x62, "Unknown", 1, 0}, {0x5a, p.string(kBrowserVersion), 0, 3}, {0x66, "1.30", 0, 5}};
    m.dialogRamp = rampAt(p, kDialogClosing);
    m.firstRunRamp = rampAt(p, kFirstRun);
    m.pagePointers = config.pages;
    m.entryActive = p.integer(kEntryActive);
    m.menuLengths = {lengths.menuShort, lengths.menuLong, lengths.one};
    m.listConstants = {p.single(kListConstants), p.single(kListConstants + 4), p.single(kListConstants + 8), p.single(kListConstants + 12)};
    m.screenCode = screenCode;
    for (uint32_t i = 0; i < 6; ++i) m.adjustFields[i] = {p.integer(kAdjustFields + 12 * i), p.integer(kAdjustFields + 12 * i + 4), p.integer(kAdjustFields + 12 * i + 8)};
    m.configGate = p.integer(kConfigGate);
    m.listFade = {p.integer(kListFade), p.integer(kListFade + 4), p.integer(kListFade + 8)};
    m.body = lengths.body;
    m.videoMode = videoMode;

    CubeState& cube = menus.cubes;
    cube.ramp = lengths.cube;
    cube.list = {p.single(kCubeList), p.integer(kCubeList + 4), p.integer(kCubeList + 8), p.integer(kCubeList + 12), p.integer(kCubeList + 16), p.integer(kCubeList + 20)};
    cube.colours = {colourAt(p, kCubeColours), colourAt(p, kCubeColours + 16), colourAt(p, kCubeColours + 32)};
    cube.record = rodRecordAt(p, kCubeRecord);
    for (uint32_t i = 0; i < 6; ++i) cube.constants[i] = p.single(kCubeConstants + 4 * i);
    cube.centreFactors = {p.single(kCentreFactors), p.single(kCentreFactors + 4)};
    cube.view = Matrix<A>::identity();
    cube.screen = Matrix<A>::viewScreen(kScreenDistance, camera.proportions.ax, camera.proportions.ay, kScreenCentre, kScreenCentre, kScreenMinZ, p.single(kZmaxScreen), kScreenNear, kScreenFar);
    cube.layerClear = colourAt(p, kLayerClear);
    cube.added = rectAt(p, kAddRecord);
    cube.half = rectAt(p, kHalfRecord);
    cube.chain = rectAt(p, kChainRecord);
    menus.cubeMesh = assets.cubeMesh;
    menus.items = config.items;
    c.menus = std::move(menus);

    FrameInputs& f = out.frame;
    f.time = time.time;
    f.field = camera.field;
    f.displayIndex = 0;
    f.item0 = config.items[0];
    f.items = {config.items[6], config.items[7], config.items[8], config.items[9], config.items[10], config.items[11]};
    f.menu.disc = screenCode;
    f.menu.configDirty = std::array<int32_t, 3>{0, 0, 0};
    f.menu.rtcMirror = std::array<int32_t, 6>{in.rtc.year, in.rtc.month, in.rtc.day, in.rtc.hour, in.rtc.minute, in.rtc.second};
    f.menu.mechaconParam = std::array<uint32_t, 2>{config.param, words.date};
    f.configItems = config.items;
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template ColdStartOut coldStart<EeArithmetic>(const ColdAssets&, const ColdInputs&);
#endif
template ColdStartOut coldStart<NativeArithmetic>(const ColdAssets&, const ColdInputs&);

}
