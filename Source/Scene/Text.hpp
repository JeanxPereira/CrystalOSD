#pragma once
#include <array>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "Scene/Font.hpp"
#include "Scene/Frame.hpp"
#include "Scene/FrameHead.hpp"
#include "Scene/Matrix.hpp"
#include "Scene/MenuTypes.hpp"
#include "Scene/ProgramImage.hpp"
#include "Scene/Ramp.hpp"

namespace scene {

// facts/text.md section 2: one entry of the glyph cache's list (most recently used first). `block` is the
// offset in the font file of the block the code's glyph is in, 0 for none.
struct FontCacheEntry {
    int32_t code = 0, loaded = 0, cell = -1;
    uint32_t block = 0;
    bool operator==(const FontCacheEntry&) const = default;
};

// The library's cache (_scePFontSetupTexCache 0x00290B10): the list, the cells' layout in the texture at GS word
// `texture`, its colour table at `table`, and the block (offset in the font file) it was laid out for.
struct FontCache {
    std::vector<FontCacheEntry> list;
    int32_t format = 0, cellW = 0, cellH = 0, cells = 0, width = 0, height = 0, logW = 0, logH = 0, setUp = 0;
    uint32_t block = 0, memory = 0, texture = 0, table = 0;
};

// facts/text.md section 4: the program's font state at 0x003979B0 (Font_Set*, the escapes, updateTransMatrix).
struct FontState {
    int32_t lineHeight = 0, fixed = 0, percent = 0, pitch = 0, decoration = 0, clip = 0, blank = 0, ascent = 0, dirty = 0;
    float tv = 0, ratio = 0;
    std::array<float, 2> locate{};
    std::array<float, 4> colour{};
    Mat4 matrix{};
};

// What the alpha rules of the date, time and button hint read (References/scripts/verify_text2.mjs dateAlpha and
// panelsOf; HDD OSD 1.10U addresses). The menus' code writes them; on the clock screen they stand still.
struct TextRamps {
    Ramp config;          // D_002B2E04
    Ramp mainMenu;        // D_002B2E78
    Ramp version;         // D_002B3000
    Ramp dialogClosing;   // D_002B46B8
    Ramp firstRun;        // D_002B46D0
    Ramp dialog;          // the page D_003701C0 points at, + 0x1C
    int32_t lead = 0;     // D_003702E0
    int32_t body = 0;     // D_003702CC
    int32_t panel7 = 0;   // D_002B2E00
    int32_t panel8On = 0; // D_00370140
    int32_t panel8 = 0;   // D_0037013C
    int32_t adjustRow = 0;  // the flag of the row D_002B2FF8 selects in the table D_002B2FEC points at
    std::array<int32_t, 4> panel8Ids{1, 1, 1, 1};  // the string ids of panel 8, D_002B2300 (func_002266E0 writes them)
};

// The console's settings the text reads: configuration items 0xD (time format) and 0xE (date format), the settings
// word at 0x00371818 (language in bits 4 to 8, summer time in bit 29) and the video mode as cached (D_002AD228).
struct TextSettings {
    int32_t timeFormat = 0, dateFormat = 0;
    uint32_t settingsWord = 0;
    int32_t videoMode = 0;
};

// Configuration items 6 to 0xB: the date and time func_00226300 formats.
struct ClockItems {
    int32_t year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;
};

// What the text carries from frame to frame, and its constants.
struct TextInputs {
    FontCache cache;
    FontState font;
    TextRamps ramps;
    TextSettings settings;
};

// What the text reads of the frame: the items, configuration item 0, and the clock's own words the alpha rules read.
struct TextFrameInputs {
    ClockItems items;
    int32_t item0 = 0;
    int32_t overlayLevel = 0;
    int32_t tail = 0;
    Ramp menu;
    int32_t width = 640, height = 224;
    std::optional<TextRamps> ramps;
};

// A glyph: the twelve-vertex fan (facts/text.md section 3) in native units (pixels without the field's half line,
// S T Q, the RGBAQ bytes) and the region clamp of its cell.
struct GlyphVertex {
    float x = 0, y = 0;
    float s = 0, t = 0, q = 1;
    std::array<uint8_t, 4> colour{};
};
struct GlyphDraw {
    std::array<int32_t, 4> region{};
    std::array<GlyphVertex, 12> fan{};
};

// A string as the program hands it to Font_PutsPackets or calcDrawArea, with its font state at the call.
struct StringRun {
    std::string text;
    bool measuring = false;
    FontState own;
};

struct TextDraw {
    enum class Kind { Glyph, Icon } kind = Kind::Glyph;
    GlyphDraw glyph;
    Rect icon;
    int32_t texture = 0;
};

// `glyphs`: the cache as GS memory holds it when the text is drawn.
struct TextFrame {
    std::vector<TextDraw> draws;
    std::vector<StringRun> strings;
    GlyphCache glyphs;
};

// facts/text.md section 5: what the pages' strings read: the main menu, System Configuration's list and entries, the
// crossfade (R4), the configuration items (the clock's value) and the ramps of the alpha rules.
struct PagesInputs {
    MainMenu mainMenu;
    ConfigPage page;
    std::array<ConfigEntry, 9> entries{};
    ListFade listFade;
    ListConstants listConstants;
    std::array<AdjustField, 6> adjustFields{};
    ConfigItems items{};
    Ramp menuRamp;
    int32_t tail = 0, overlayLevel = 0;
    TextRamps ramps;
    int32_t width = 640, height = 224;
    int32_t pending = 0;   // D_003701D0, what func_0022AAF0 answers
    VersionPage version;   // D_002B2FE8 and its table, as the page's drawing sees them
};
struct PagesFrame {
    TextFrame text;
    std::optional<int32_t> titleWidth;   // configPage + 0xC as the list's drawing measures it (browser_str_related2)
    // Entry callbacks the model does not cover (their value is left undrawn); such an entry is not enterable until ported.
    std::vector<uint32_t> unmodelled;
};
// TextRamps from the menus' live ramps (config, mainMenu, version, dialogClosing, firstRun, lead, body); the rest from `constants`.
TextRamps textRampsOf(const MenusState& menus, const TextRamps& constants);
// The menus' state at the pages call: the state before the frame's input with the ramps as ticked (a ramp whose counter moved in the
// step is taken whole from `after`) and the glow as stepped; selection, level and entries are not yet changed by the frame's input.
MenusState menusAtPages(const MenusState& before, const MenusState& after);
PagesInputs pagesOf(const MenusState& menus, const ClockState& clock, const ConfigItems& items, const TextRamps& ramps, int32_t width, int32_t height);

// facts/text.md: the date and time (func_00226300) and the button hint (func_002269E0) of the clock screen, through
// the program's font code (Font_PutsPackets 0x00213BA8, fontFilter 0x00212D78) and the library's
// (_scePFont_Putc 0x00291858), the cache carried from string to string and frame to frame.
template <class A>
class Text {
public:
    Text(std::shared_ptr<const Font> font, std::shared_ptr<const ProgramImage> program, const TextInputs& inputs);
    TextFrame frame(const TextFrameInputs& in);
    // The pages function's text (the main menu's items, System Configuration's list), before the bars, the cache carried.
    PagesFrame pages(const PagesInputs& in);
    // func_00213EE8: the width of a string through calcDrawArea at the font state as it stands.
    int32_t stringWidth(const std::string& text);
    // One string through Font_PutsPackets at the font state as it stands, as a frame of its own (for tests).
    TextFrame drawString(const std::string& text, int32_t width = 640, int32_t height = 224);

    const FontCache& cache() const { return m_cache; }
    const FontState& font() const { return m_font; }

private:
    struct Character;
    float putString(const std::string& text, bool measuring, TextFrame& out);
    // The pen after the character, or nothing when the library gives the character up (no glyph).
    std::optional<float> putCharacter(const Character& c, bool measuring, TextFrame& out);
    int32_t widthOf(const std::string& text, TextFrame& out);
    void finish(TextFrame& out) const;
    void setRatio(float ratio);
    void setColour(int32_t r, int32_t g, int32_t b, int32_t a);
    void setLocate(int32_t x, int32_t y);
    void updateMatrix(FontState& s) const;
    float scaleX(const FontState& s) const;
    void buttonPanel(int32_t panel, int32_t alpha, int32_t y, const TextFrameInputs& in, TextFrame& out);
    void icon(int32_t picture, int32_t x, int32_t y, int32_t alpha, const TextFrameInputs& in, TextFrame& out);
    int32_t language() const;
    std::string languageString(int32_t id) const;
    void colourFrom(uint32_t at, int32_t alpha);
    int32_t drawItem(int32_t x, int32_t y, uint32_t colour, int32_t alpha, const std::string& text, TextFrame& out);
    void menuItem(int32_t x, int32_t y, uint32_t colour, int32_t alpha, const std::string& text, TextFrame& out);
    int32_t templateWidth(int32_t timeFormat, TextFrame& out);
    void mainMenuItems(const PagesInputs& in, TextFrame& out);
    std::optional<int32_t> list(const PagesInputs& in, TextFrame& out, std::vector<uint32_t>& unmodelled);
    void versionPage(const PagesInputs& in, TextFrame& out);
    void listEntry(const PagesInputs& in, int32_t index, int32_t alpha, TextFrame& out, std::vector<uint32_t>& unmodelled);
    bool clockValue(const PagesInputs& in, const ConfigEntry& entry, const std::array<AdjustField, 6>& fields, int32_t x, int32_t y, int32_t alpha, bool editing, TextFrame& out);
    void valueRow(const ConfigEntry& entry, int32_t x, int32_t y, int32_t alpha, TextFrame& out);
    bool entryValue(const PagesInputs& in, const ConfigEntry& entry, int32_t x, int32_t y, int32_t alpha, bool editing, TextFrame& out);
    bool pal() const { return m_settings.videoMode == 2; }

    std::shared_ptr<const Font> m_fontFile;
    std::shared_ptr<const ProgramImage> m_program;
    FontCache m_cache;
    FontState m_font;
    TextRamps m_ramps;
    TextSettings m_settings;
    std::array<float, 4> m_libraryColour{};
    std::vector<int32_t> m_cells;
    std::vector<bool> m_drawn;
    int32_t m_width = 640, m_height = 224;
    // D_00370158 and D_0037015C: the width of the clock value's template and the time format it was measured for.
    int32_t m_templateWidth = 0, m_templateFormat = 0;
    bool m_afterPages = false;
    std::array<int32_t, 4> m_panel8{1, 1, 1, 1};
};

extern template class Text<EeArithmetic>;
extern template class Text<NativeArithmetic>;

// The cache's texture as the GS samples it (facts/text.md sections 1 and 2): each cell's picture one texel in from its
// corner, through its block's colour table (the GS looks the colour up before it filters); the rest clear.
// 2^logWidth x 2^logHeight texels, R G B A.
std::vector<uint8_t> glyphCacheImage(const Font& font, const GlyphCache& cache);

}
