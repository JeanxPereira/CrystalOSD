#include "Scene/ColdConfig.hpp"

#include <algorithm>

#include "Scene/Arithmetic.hpp"
#include "Scene/ClockState.hpp"

namespace scene {

namespace {

constexpr uint32_t kParam = 0x371818;
constexpr uint32_t kDateWord = 0x37181C;
constexpr uint32_t kEntries = 0x2B2BF0;
constexpr uint32_t kPage = 0x2B2DE8;
constexpr uint32_t kMenu = 0x2B2E60;
constexpr uint32_t kPagePointers = 0x3701C0;
constexpr uint32_t kPageBuffer = 0x404370;
constexpr uint32_t kEntrySize = 0x38;
constexpr uint32_t kTemplateFour = 0x2B2E88;
constexpr uint32_t kTemplateVideo = 0x2B2EC0;
constexpr uint32_t kTemplateMiddle = 0x2B2EF8;
constexpr uint32_t kTemplateLast = 0x2B2F30;
constexpr int32_t kBaseCity = 0x33;
constexpr int32_t kCityLimit = 0x80;
constexpr int32_t kLanguageDefault = 1;

struct Table {
    int32_t count;
    uint32_t table;
};

constexpr std::array<Table, 3> kVideoEntry{{{2, 0x2B25D0}, {7, 0x2B2610}, {7, 0x2B26F0}}};
constexpr std::array<Table, 3> kLastEntry{{{2, 0x2B2930}, {9, 0x2B2970}, {9, 0x2B2A90}}};

ConfigEntry entryAt(const ProgramImage& program, uint32_t at) {
    ConfigEntry e;
    e.id = program.integer(at);
    e.valueCount = program.integer(at + 4);
    e.valueIndex = program.integer(at + 8);
    e.item = program.integer(at + 12);
    e.valueTable = program.word(at + 0x10);
    e.enter = program.word(at + 0x14);
    e.stringCallback = program.word(at + 0x18);
    e.frameCallback = program.word(at + 0x1C);
    e.confirm = program.word(at + 0x20);
    e.cancel = program.word(at + 0x24);
    e.focus = program.word(at + 0x28);
    for (uint32_t i = 0; i < 3; ++i) e.rest[i] = program.integer(at + 0x2C + 4 * i);
    return e;
}

int32_t languageOf(uint32_t& param, int videoMode) {
    const uint32_t field = (param >> 4) & 0x1F;
    if (videoMode == 0) return field == 1 ? 1 : 0;
    if (field == 0) {
        param = (param & ~0x1F0u) | (static_cast<uint32_t>(kLanguageDefault) << 4);
        return kLanguageDefault;
    }
    return field < 8 ? static_cast<int32_t>(field) : kLanguageDefault;
}

}

// HDD OSD 1.10U 0x203A20 (config_set_default_main), the getters 0x203CF8..0x204E18 verify_cold_config.mjs
ColdSettingsWords coldSettingsWords(const ProgramImage& program, const ColdInputs& inputs) {
    ColdSettingsWords w;
    const uint32_t kept = program.word(kParam) & 0x80000000u;
    w.param = kept | (static_cast<uint32_t>(inputs.aspect) & 3u) << 1 | (static_cast<uint32_t>(inputs.language) & 0x1Fu) << 4 |
              (static_cast<uint32_t>(inputs.timeZone) & 0x7FFu) << 9 | (static_cast<uint32_t>(inputs.city) & 0x1FFu) << 20 |
              (inputs.summerTime ? 1u : 0u) << 29 | (static_cast<uint32_t>(inputs.timeFormat) & 1u) << 30;
    w.date = (program.word(kDateWord) & ~3u) | (static_cast<uint32_t>(inputs.dateFormat) & 3u);
    w.keyboard = 0;
    return w;
}

// HDD OSD 1.10U 0x234F78 config_load_clock_osd 0x234F88, 0x227F08 verify_cold_config.mjs
template <class A>
ColdConfigOut coldConfig(const ProgramImage& program, const ColdSettingsWords& words, int videoMode, const ColdLengths& lengths, const ColdTimeOut& time, int selected) {
    ColdConfigOut out;
    uint32_t param = words.param;
    ConfigItems& items = out.items;
    for (size_t i = 0; i < items.size(); ++i) items[i] = program.integer(0x409130 + 4 * static_cast<uint32_t>(i));
    const uint32_t aspect = (param >> 1) & 3;
    items[0] = aspect < 3 ? static_cast<int32_t>(aspect) : 0;
    items[1] = static_cast<int32_t>(param & 1);
    items[2] = static_cast<int32_t>((param >> 3) & 1);
    items[3] = languageOf(param, videoMode);
    items[4] = static_cast<int32_t>(words.keyboard & 1);
    items[13] = static_cast<int32_t>((param >> 30) & 1);
    const uint32_t dateFormat = words.date & 3;
    items[14] = dateFormat < 3 ? static_cast<int32_t>(dateFormat) : 0;
    const int32_t city = static_cast<int32_t>((param >> 20) & 0x1FF);
    items[15] = std::min(city, kCityLimit);
    items[16] = static_cast<int32_t>((param >> 29) & 1);
    items[17] = static_cast<int32_t>((words.date >> 2) & 1);
    items[18] = static_cast<int32_t>((words.date >> 3) & 1);
    items[19] = static_cast<int32_t>((words.date >> 4) & 1);
    const float seconds = ClockLogic<A>::seconds(time.time);
    const float minutes = A::add(static_cast<float>(time.time.minutes), A::div(seconds, 60.0f));
    items[6] = time.year;
    items[7] = time.month;
    items[8] = time.day;
    items[9] = A::toInt(ClockLogic<A>::hours(time.time));
    items[10] = A::toInt(minutes);
    items[11] = A::toInt(seconds);
    out.param = param;

    for (size_t i = 0; i < out.entries.size(); ++i) out.entries[i] = entryAt(program, kEntries + kEntrySize * static_cast<uint32_t>(i));
    out.page.word0 = program.integer(kPage);
    out.page.entries = program.word(kPage + 4);
    out.page.count = program.integer(kPage + 8);
    out.page.titleWidth = program.integer(kPage + 12);
    out.page.selected = selected;
    out.page.word14 = program.integer(kPage + 0x14);
    out.page.level = program.integer(kPage + 0x18);
    out.page.ramp = lengths.config;
    out.page.word2c = program.integer(kPage + 0x2C);
    out.page.word30 = program.integer(kPage + 0x30);
    out.page.glow = program.integer(kPage + 0x34);
    out.menu.word0 = program.integer(kMenu);
    out.menu.items = program.word(kMenu + 4);
    out.menu.count = program.integer(kMenu + 8);
    out.menu.word0c = program.integer(kMenu + 12);
    out.menu.selected = program.integer(kMenu + 0x10);
    out.menu.word14 = program.integer(kMenu + 0x14);
    out.menu.ramp = lengths.mainMenu;
    for (size_t i = 0; i < out.pages.size(); ++i) out.pages[i] = program.integer(kPagePointers + 4 * static_cast<uint32_t>(i));
    out.pages[0] = static_cast<int32_t>(kPageBuffer);

    const int32_t keptId = out.entries[static_cast<size_t>(out.page.selected)].id;
    size_t k = 4;
    if (items[19] != 0) {
        out.entries[4] = entryAt(program, kTemplateFour);
        k = 5;
    }
    out.entries[k] = entryAt(program, kTemplateVideo);
    out.entries[k].valueCount = kVideoEntry[static_cast<size_t>(videoMode)].count;
    out.entries[k].valueTable = kVideoEntry[static_cast<size_t>(videoMode)].table;
    out.entries[k + 1] = entryAt(program, kTemplateMiddle);
    out.entries[k + 2] = entryAt(program, kTemplateLast);
    out.entries[k + 2].valueCount = kLastEntry[static_cast<size_t>(videoMode)].count;
    out.entries[k + 2].valueTable = kLastEntry[static_cast<size_t>(videoMode)].table;
    out.page.count = static_cast<int32_t>(k + 3);
    if (out.entries[static_cast<size_t>(out.page.selected)].id != keptId) {
        int32_t found = 0;
        for (size_t i = 0; i < k + 3; ++i)
            if (out.entries[i].id == keptId) { found = static_cast<int32_t>(i); break; }
        out.page.selected = found;
    }
    return out;
}

template <class A>
ColdConfigOut coldConfig(const ProgramImage& program, const ColdInputs& inputs, const ColdLengths& lengths, const ColdTimeOut& time) {
    return coldConfig<A>(program, coldSettingsWords(program, inputs), inputs.pal ? 2 : 1, lengths, time, 0);
}

#ifndef SCENE_NATIVE_ONLY
template ColdConfigOut coldConfig<EeArithmetic>(const ProgramImage&, const ColdSettingsWords&, int, const ColdLengths&, const ColdTimeOut&, int);
template ColdConfigOut coldConfig<EeArithmetic>(const ProgramImage&, const ColdInputs&, const ColdLengths&, const ColdTimeOut&);
#endif
template ColdConfigOut coldConfig<NativeArithmetic>(const ProgramImage&, const ColdSettingsWords&, int, const ColdLengths&, const ColdTimeOut&, int);
template ColdConfigOut coldConfig<NativeArithmetic>(const ProgramImage&, const ColdInputs&, const ColdLengths&, const ColdTimeOut&);

}
