#include "Scene/Text.hpp"

#include <algorithm>
#include <bit>
#include <cmath>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>

namespace scene {

namespace {

// HDD OSD 1.10U data the text reads, by EE address (facts/text.md sections 4 and 5; disassembly in
// HDD OSD 1.10U disassembly: func_00226300, do_format_date, do_format_time, draw_button_panel_hkdosd_p4_tgt, DrawIcon).
constexpr uint32_t kLanguageTables = 0x002ad200;                 // langtblptrs: one string table per language
constexpr uint32_t kEscapeColours = 0x00348b20;                  // the escape c's colours, three words each
constexpr uint32_t kDateNone[3] = {0x00360d00, 0x00360d38, 0x00360d38};  // aP0P00P0P00P0P0, _0: a negative year
constexpr uint32_t kDateYearFirst = 0x00360d28;                  // "%04d/%02d/%02d"
constexpr uint32_t kDateYearLast = 0x00360d60;                   // "%02d/%02d/%04d"
constexpr uint32_t kTimeNone[2] = {0x00360d70, 0x00360db0};      // aP0P00P0P00P0P0_1, _2: a negative hour
constexpr uint32_t kTime24 = 0x00360d98;                         // "\ap@0%2d\ap00:%02d:%02d"
constexpr uint32_t kTime12 = 0x00360df0;                         // the same and " %s"
constexpr uint32_t kMorning = 0x00360e10, kAfternoon = 0x00360e28;  // "\ar0.80\ap@AA\ap00M\ar0.00", the same with P
constexpr uint32_t kSummerMark = 0x00365558, kNoMark = 0x00370138;  // "\ar0.88\ao020\ar0.00", ""
constexpr uint32_t kTimeLine = 0x00370130;                       // "%s %s"
constexpr uint32_t kDateRatio = 0x0036fb94, kHintRatio = 0x0036fb98, kVersionRatio = 0x0036fbb0;
constexpr uint32_t kVersionPal = 0x003656c8;
// A Version row not filled yet holds null pointers (the record's count is 3 from the start, its table zero): the page draws the string at
// address 0 of the console's RAM, the first eight bytes of the kernel's exception vector, before the job's list is in.
constexpr char kNullPointerText[] = "\x01\x80\x1a\x3c\x38\x59\x59\xff";
constexpr uint32_t kPalMultiply = 0x00365570, kPalDivide = 0x00365578;          // func_00226300
constexpr uint32_t kHintPalMultiply = 0x00365590, kHintPalDivide = 0x00365598;  // func_00226958
constexpr uint32_t kIconPalMultiply = 0x00365580, kIconPalDivide = 0x00365588;  // DrawIcon
constexpr uint32_t kPanels = 0x002b2318;  // four string ids per panel, 0x14 apart; + 0xA0 by video mode
constexpr uint32_t kSlots = 0x002b2470;                          // the four slots' x, 16 bytes per language
constexpr uint32_t kSlotPictures = 0x002b24f0;                   // the picture of each slot
constexpr uint32_t kHintColour = 0x002b2460;
constexpr uint32_t kIconRecord = 0x002b2260;                     // DrawIcon's rectangle record
constexpr uint32_t kIconPlaces = 0x002b22a0;                     // u0, v0, u1, v1 per picture

// The menus' strings and colours (draw_clock_menu_items, browser_str_related, func_002311E8, clock_str_related).
constexpr uint32_t kChosenColour = 0x002b2540, kPlainColour = 0x002b2550, kValueColour = 0x002b2560, kTitleColour = 0x002b2570;
constexpr uint32_t kArrow = 0x003702c0;                          // "o018"
constexpr uint32_t kAdjustTemplate = 0x003655b0;                 // year, month, day: item, lowest, highest (func_00226E68)
constexpr uint32_t kFormatYear = 0x00370160, kFormat02 = 0x00370168, kFormat2 = 0x00370170;  // "%04d", "%02d", "%2d"
constexpr uint32_t kFixedOpen = 0x00370178, kFixedClose = 0x00370180;                        // "p@0", "p00"
constexpr uint32_t kSlash = 0x00370188, kSpace = 0x00370190, kColon = 0x00370198;
constexpr uint32_t kValueTemplate12 = 0x003655d8, kValueTemplate24 = 0x00365600;
constexpr uint32_t kFieldMorning = 0x00365618, kFieldAfternoon = 0x00365630;
constexpr uint32_t kListPalChosen = 0x00365950, kListPalValue = 0x00365958;
constexpr uint32_t kClockString = 0x00227420, kItemString = 0x00228470, kItemStringJump = 0x00227c60, kClockEdit = 0x00227ad0, kRowEdit = 0x00228660;

int32_t clampTo(int32_t v, int32_t top) { return v < 0 ? 0 : v > top ? top : v; }
int32_t by128(int64_t x) { return static_cast<int32_t>((x < 0 ? x + 127 : x) >> 7); }
int32_t divide(int64_t a, int32_t b) {
    if (b == 0) throw std::runtime_error("text: a ramp or tail of length 0 divides");
    return static_cast<int32_t>(a / b);
}
int32_t scaleOf(const Ramp& r, int32_t n) { return divide(int64_t(r.counter) * n, r.length); }
int32_t half(int32_t n) { return (n + static_cast<int32_t>(static_cast<uint32_t>(n) >> 31)) >> 1; }

// func_00231E78: the main menu's items and their button panel.
int32_t menuAlphaOf(const TextRamps& r, int32_t tail, int32_t overlay) {
    int32_t a = scaleOf(r.mainMenu, 0x80);
    a = divide(int64_t(a) * clampTo(tail - r.config.counter, tail), tail);
    a = by128(int64_t(a) * (0x80 - scaleOf(r.version, 0x80)));
    a = by128(int64_t(a) * overlay);
    if (r.dialogClosing.state != 0 || r.firstRun.state != 0) a = 0;
    return a;
}

// func_00230E10: System Configuration's list and its button panel.
int32_t configAlphaOf(const TextRamps& r, int32_t tail, const Ramp& menu) {
    const int32_t a = divide(int64_t(clampTo(r.config.counter - (r.body + r.lead), tail)) << 7, tail);
    return divide(int64_t(a) * clampTo(tail - menu.counter, tail), tail);
}

// sprintf as the program uses it: %s, %d with a zero flag and a width.
std::string format(const std::string& pattern, const std::vector<std::string>& texts, const std::vector<int32_t>& numbers) {
    std::string out;
    size_t text = 0, number = 0;
    for (size_t i = 0; i < pattern.size(); ++i) {
        if (pattern[i] != '%') { out.push_back(pattern[i]); continue; }
        ++i;
        bool zero = false;
        if (i < pattern.size() && pattern[i] == '0') { zero = true; ++i; }
        int width = 0;
        while (i < pattern.size() && pattern[i] >= '0' && pattern[i] <= '9') width = width * 10 + (pattern[i++] - '0');
        if (i >= pattern.size()) throw std::runtime_error("text: a format ends in a conversion");
        if (pattern[i] == 's') {
            out += texts.at(text++);
        } else if (pattern[i] == 'd') {
            const int64_t v = numbers.at(number++);
            std::string digits = std::to_string(v < 0 ? -v : v);
            const size_t sign = v < 0 ? 1 : 0;
            while (digits.size() + sign < size_t(width) && zero) digits.insert(digits.begin(), '0');
            if (v < 0) digits.insert(digits.begin(), '-');
            while (digits.size() < size_t(width)) digits.insert(digits.begin(), ' ');
            out += digits;
        } else if (pattern[i] == '%') {
            out.push_back('%');
        } else {
            throw std::runtime_error(std::string("text: the conversion %") + pattern[i] + " is not modelled");
        }
    }
    return out;
}

}

// What the program's filter hands the library for one character (fontFilterPutc 0x00212A20).
template <class A>
struct Text<A>::Character {
    int32_t code = 0;
    Vec4 locate{};
    std::array<float, 4> colour{};
    Mat4 matrix{};
    bool fresh = false;
};

template <class A>
Text<A>::Text(std::shared_ptr<const Font> font, std::shared_ptr<const ProgramImage> program, const TextInputs& inputs)
    : m_fontFile(std::move(font)), m_program(std::move(program)), m_cache(inputs.cache), m_font(inputs.font), m_ramps(inputs.ramps), m_settings(inputs.settings) {
    if (!m_fontFile || !m_program) throw std::runtime_error("text: no font or program");
    // The library's context is read from the capture (scene.json's input.font); without it there is no cache to draw from.
    if (m_cache.list.empty()) throw std::runtime_error("text: the glyph cache is empty (the input has no font context); build the clock without text");
    m_libraryColour = m_font.colour;
    m_cells.assign(static_cast<size_t>(m_cache.cells), 0);
    for (const FontCacheEntry& e : m_cache.list)
        if (e.loaded && e.cell >= 0 && e.cell < m_cache.cells) m_cells[static_cast<size_t>(e.cell)] = e.code;
    // D_00370158 is written the first time the list draws the clock's value, which needs the configuration ramp running: an
    // input that starts with it running has the width already, measured at the size the list sets (1.0); the cache is left as it was.
    if (inputs.ramps.config.state != 0) {
        const FontCache cache = m_cache;
        const FontState font = m_font;
        const std::array<float, 4> colour = m_libraryColour;
        m_font.ratio = 1.0f;
        m_font.dirty = 1;
        TextFrame scratch;
        m_templateFormat = inputs.settings.timeFormat;
        m_templateWidth = widthOf(m_program->string(m_templateFormat == 1 ? kValueTemplate12 : kValueTemplate24), scratch);
        m_cache = cache;
        m_font = font;
        m_libraryColour = colour;
    }
}

// func_002132B8: the size, times the width in percent when one is set.
template <class A>
float Text<A>::scaleX(const FontState& s) const {
    return s.percent ? A::div(A::mul(s.ratio, static_cast<float>(s.percent)), 100.0f) : s.ratio;
}

// updateTransMatrix (0x00213380): diag(x, x tv, 1, 1) moved by (pitch x, ascent 0.7 tv size), when the size changed.
template <class A>
void Text<A>::updateMatrix(FontState& s) const {
    if (!s.dirty) return;
    s.dirty = 0;
    const float x = scaleX(s);
    s.matrix = {{{x, 0, 0, 0}, {0, A::mul(x, s.tv), 0, 0}, {0, 0, 1, 0},
                 {A::mul(static_cast<float>(s.pitch), x), A::mul(A::mul(A::mul(static_cast<float>(s.ascent), asFloat(0x3f333333)), s.tv), s.ratio), 0, 1}}};
}

// Font_SetRatio (0x002127B8): the size, and the matrix marked to be made again.
template <class A>
void Text<A>::setRatio(float ratio) {
    m_font.ratio = ratio;
    m_font.dirty = 1;
}

// Font_SetColor: each int times 1/128.
template <class A>
void Text<A>::setColour(int32_t r, int32_t g, int32_t b, int32_t a) {
    const float step = asFloat(0x3c000000);
    m_font.colour = {A::mul(static_cast<float>(r), step), A::mul(static_cast<float>(g), step), A::mul(static_cast<float>(b), step), A::mul(static_cast<float>(a), step)};
}

template <class A>
void Text<A>::setLocate(int32_t x, int32_t y) {
    m_font.locate = {static_cast<float>(x), static_cast<float>(y)};
}

// config_get_osd_language (0x00203DD8) with get_vidmode_with_fallback: the layout row of the hints.
template <class A>
int32_t Text<A>::language() const {
    const int32_t field = static_cast<int32_t>((m_settings.settingsWord >> 4) & 0x1f);
    if (m_settings.videoMode <= 0) return field == 1 ? 1 : 0;
    if (field == 0 || field >= 8) return 1;
    return field;
}

// References/model/clock_text.mjs putString with verify_text2.mjs stringOf: one string through Font_PutsPackets
// (0x00213BA8) or calcDrawArea (0x00213D38), the library asked for each character in turn. Returns the farthest the pen
// went (x), which is what a measurement gives.
template <class A>
float Text<A>::putString(const std::string& text, bool measuring, TextFrame& out) {
    out.strings.push_back({text, measuring, m_font});
    FontState& s = m_font;
    if (!measuring) m_cache.setUp = 1;
    updateMatrix(s);
    std::array<float, 4> colour = measuring ? m_libraryColour : s.colour;
    const float startX = measuring ? 0.0f : s.locate[0], startY = measuring ? 0.0f : s.locate[1];
    std::array<float, 2> pen{startX, startY};
    std::array<float, 2> reach{startX, startY};
    bool fresh = true;
    const auto widest = [&] {
        if (reach[0] < pen[0]) reach[0] = pen[0];
        if (reach[1] < pen[1]) reach[1] = pen[1];
    };
    const Font& font = *m_fontFile;
    bool drew = false;
    float lastPen = 0;

    // _scePFont_Getc (0x002928F8): UTF-8, 0 at the end, -1 on a broken sequence.
    size_t i = 0;
    const auto take = [&]() -> int32_t {
        if (i >= text.size()) return 0;
        int32_t c = static_cast<uint8_t>(text[i++]);
        if (c < 0x80) return c;
        int32_t more;
        if (c < 0xc0) return -1;
        if (c < 0xe0) { c &= 0x1f; more = 1; }
        else if (c < 0xf0) { c &= 0x0f; more = 2; }
        else if (c < 0xf8) { c &= 7; more = 3; }
        else return -1;
        for (; more > 0; --more) {
            const int32_t next = i < text.size() ? static_cast<uint8_t>(text[i++]) : 0;
            if ((next & 0xc0) != 0x80) return -1;
            c = (c << 6) | (next & 0x3f);
        }
        return c;
    };

    // fontFilterPutc (0x00212A20): a fixed width centres the character in it; the clip skips what is off the screen.
    const auto character = [&](int32_t code) {
        if (s.decoration) throw std::runtime_error("text: a string with a background or an underline is not modelled");
        bool fixedAfter = false;
        float after = 0;
        if (s.fixed != 0 || s.clip != 0) {
            std::optional<Glyph> glyph = font.glyph(code);
            if (!glyph) glyph = font.glyph(0xd818);
            if (!glyph) return;
            const float before = pen[0], x = s.matrix[0][0], pitch = s.matrix[3][0];
            if (s.fixed != 0) {
                pen[0] = A::add(before, A::mul(static_cast<float>((s.fixed - glyph->metrics[6]) / 2), x));
                after = A::add(A::add(before, pitch), A::mul(static_cast<float>(s.fixed), x));
                fixedAfter = true;
            } else {
                after = A::add(A::add(before, pitch), A::mul(static_cast<float>(glyph->metrics[6]), x));
            }
            if (s.clip && (640.0f < before || after < 0.0f)) {
                pen[0] = after;
                widest();
                return;
            }
        }
        Character c{code, {pen[0], pen[1], 0, 0}, colour, s.matrix, fresh};
        const std::optional<float> moved = putCharacter(c, measuring, out);
        // A character the library gives up leaves its pen where it was (the model has no pen for it; not captured).
        const float penX = moved.value_or(pen[0]);
        if (moved) {
            drew = true;
            lastPen = penX;
            m_libraryColour = colour;
        }
        pen[0] = fixedAfter ? after : penX;
        fresh = false;
    };

    for (int32_t c = take(); c > 0; c = take()) {
        if (c >= 0x20) {
            if (c == 0xfeff || c == 0xfffe || c == 0xffff) continue;
            character(c);
        } else if (c == 9) {
            const float along = A::sub(A::add(pen[0], 63.0f), 1.0f);
            pen[0] = A::sub(along, A::cut(std::fmod(double(along), 63.0)));
        } else if (c == 10) {
            fresh = true;
            pen[0] = startX;
            pen[1] = A::add(pen[1], static_cast<float>(s.lineHeight));
        } else if (c == 7) {
            const int32_t letter = take();
            const auto digit = [&] { return take() - 0x30; };
            if (letter == 'c') {
                const int32_t n = digit();
                const uint32_t at = kEscapeColours + 12u * static_cast<uint32_t>(n);
                const float step = asFloat(0x3c000000);
                colour = {A::mul(static_cast<float>(m_program->integer(at)), step), A::mul(static_cast<float>(m_program->integer(at + 4)), step),
                          A::mul(static_cast<float>(m_program->integer(at + 8)), step), colour[3]};
            } else if (letter == 'a') {
                const int32_t n = digit() * 100 + digit() * 10 + digit();
                colour[3] = A::div(static_cast<float>(n), 255.0f);
            } else if (letter == 'p') {
                const int32_t first = take();
                if (first == 0x40) {
                    if (const std::optional<Glyph> glyph = font.glyph(take())) s.fixed = glyph->metrics[6];
                } else {
                    s.fixed = (first - 0x30) * 10 + digit();
                }
            } else if (letter == 'r') {
                int32_t n = digit() * 100;
                take();
                n += digit() * 10;
                n += digit();
                s.percent = n;
                s.dirty = 1;
                updateMatrix(s);
            } else if (letter == 's') {
                pen[0] = A::add(pen[0], static_cast<float>(s.blank));
            } else if (letter == 'y') {
                const int32_t sign = take();
                const auto hex = [](int32_t v) { return v >= 0x30 && v <= 0x39 ? v - 0x30 : ((v | 0x20) >= 0x61 && (v | 0x20) <= 0x66) ? (v | 0x20) - 0x57 : 0; };
                int32_t n = hex(take()) * 16;
                n += hex(take());
                if (n != 0 && sign == 0x2d) n = -n;
                pen[1] = A::add(startY, A::mul(static_cast<float>(n), 0.0625f));
            } else if (letter == 'o') {
                character(0xd800 + digit() * 100 + digit() * 10 + digit());
            }
        }
        widest();
    }
    // Font_PutsPackets reads the pen and the colour back from the library.
    if (!measuring) {
        s.colour = colour;
        if (drew) s.locate = {lastPen, pen[1]};
    }
    return reach[0];
}

// References/model/clock_text.mjs carryList with verify_text2.mjs putCharacter: the cache entry for the code moves to
// the head of the list (taking the cell of the least recently used entry passed when it has none), its picture is
// uploaded when it is not loaded, and the twelve-vertex fan is placed (facts/text.md sections 2 and 3).
template <class A>
std::optional<float> Text<A>::putCharacter(const Character& c, bool measuring, TextFrame& out) {
    const Font& font = *m_fontFile;
    std::vector<FontCacheEntry>& list = m_cache.list;
    size_t at = 0;
    std::optional<size_t> spare;
    if (list[0].cell != -1) spare = 0;
    if (list[0].code != c.code && list[0].code != 0 && list.size() > 1) {
        for (at = 1;; ++at) {
            if (list[at].code == c.code) break;
            if (list[at].cell != -1) spare = at;
            if (at == list.size() - 1 || list[at].code == 0) break;
        }
    }
    FontCacheEntry entry = list[at];
    if (entry.cell == -1 && spare && *spare != at) {
        entry.loaded = 0;
        entry.cell = list[*spare].cell;
        list[*spare].cell = -1;
        list[*spare].loaded = 0;
    }
    const std::optional<Glyph> found = font.glyph(c.code);
    if (entry.code != c.code) {
        entry.loaded = 0;
        entry.code = c.code;
        entry.block = found ? found->block->at : 0;
    }
    list.erase(list.begin() + static_cast<std::ptrdiff_t>(at));
    list.insert(list.begin(), entry);
    // _scePFont_Putc (0x00291958..0x0029197C, 0x00291980): the entry keeps the code with no block, and the character is
    // given up (-2) with nothing drawn.
    if (!found || entry.block == 0) return std::nullopt;
    const Glyph& glyph = *found;
    const FontBlock& block = *glyph.block;

    if (!measuring) {
        if (entry.loaded == 0) {
            // _scePFontSetupTexCache: a block of another cell size lays the cache out again.
            if (m_cache.block != block.at) {
                if ((block.flags & 7) != 0) throw std::runtime_error("text: a block that is not 4 bits a pixel: its cache is not modelled");
                const int32_t cellW = (block.width + 2 + 7) & ~7, cellH = (block.height + 2 + 3) & ~3;
                if (!(m_cache.format == 0x14 && m_cache.cellW == cellW && m_cache.cellH == cellH)) {
                    for (const bool drawn : m_drawn)
                        if (drawn) throw std::runtime_error("text: the cache is laid out again after a glyph of this frame was drawn from it");
                    const int32_t pages = static_cast<int32_t>((m_cache.memory + 0x7ff) >> 11);
                    int32_t across = A::toInt(A::sqrt(static_cast<float>(pages)));
                    while (pages % across != 0) across -= 1;
                    m_cache.format = 0x14;
                    m_cache.cellW = cellW;
                    m_cache.cellH = cellH;
                    m_cache.width = across * 0x80;
                    m_cache.height = (pages / across) * 0x80;
                    m_cache.cells = (m_cache.width / cellW) * (m_cache.height / cellH);
                    m_cache.logW = 32 - std::countl_zero(static_cast<uint32_t>(m_cache.width - 1));
                    m_cache.logH = 32 - std::countl_zero(static_cast<uint32_t>(m_cache.height - 1));
                    for (size_t i = 0; i < list.size(); ++i) {
                        list[i].loaded = 0;
                        list[i].cell = static_cast<int32_t>(i) < m_cache.cells ? static_cast<int32_t>(i) : -1;
                    }
                    m_cells.assign(static_cast<size_t>(m_cache.cells), 0);
                    m_drawn.assign(static_cast<size_t>(m_cache.cells), false);
                }
                m_cache.setUp = 1;
                m_cache.block = block.at;
            }
            // _scePFontUpdateTex: the picture into the entry's cell, the one the lay-out dealt the head of the list.
            const size_t cell = static_cast<size_t>(list[0].cell);
            if (list[0].cell < 0 || cell >= m_drawn.size()) throw std::runtime_error("text: the entry for code " + std::to_string(c.code) + " has cell " + std::to_string(list[0].cell) + " of " + std::to_string(m_drawn.size()));
            if (m_drawn.at(cell)) throw std::runtime_error("text: a cell drawn in this frame is given another glyph in the same frame");
            m_cells.at(cell) = c.code;
            list[0].loaded = 1;
        }
        m_cache.setUp = 0;
    }

    const auto [originX, baseline, left, right, top, bottom, advance] = glyph.metrics;
    const float x0 = float(left - 1), x1 = float(right + 1), yTop = float(-(top + 1)), yBottom = float(-(bottom - 1)), pen = 0, step = float(advance);
    const std::array<std::array<float, 2>, 11> shape{{{pen, 0}, {pen, yTop}, {x0, yTop}, {x0, 0}, {x0, yBottom}, {pen, yBottom}, {step, yBottom}, {x1, yBottom}, {x1, 0},
                                                     {x1, yTop}, {step, yTop}}};
    const Vec4 scale{block.scaleX, block.scaleY, 1, 1};
    Mat4 m{};
    for (int r = 0; r < 4; ++r)
        for (int i = 0; i < 4; ++i) m[r][i] = A::mul(c.matrix[r][i], scale[i]);
    for (int i = 0; i < 4; ++i) m[3][i] = A::add(m[3][i], c.locate[i]);
    std::array<Vec4, 11> placed{};
    for (size_t k = 0; k < shape.size(); ++k) placed[k] = Matrix<A>::apply(m, {shape[k][0], shape[k][1], 0, 1});
    // The first character after the pen was set starts at the pen: the column through the pen is brought back to it.
    if (c.fresh) {
        const float rise = A::sub(placed[5][1], placed[1][1]);
        const float shift = rise == 0.0f ? A::sub(placed[1][0], c.locate[0])
                                         : A::sub(A::add(A::div(A::mul(A::sub(c.locate[1], placed[1][1]), A::sub(placed[5][0], placed[1][0])), rise), placed[1][0]), c.locate[0]);
        for (Vec4& v : placed) v[0] = A::sub(v[0], shift);
    }
    // The pen moves to where the advance's column crosses the pen's height.
    const float rise = A::sub(placed[10][1], placed[6][1]);
    const float penX = rise == 0.0f ? placed[6][0] : A::add(A::div(A::mul(A::sub(c.locate[1], placed[6][1]), A::sub(placed[10][0], placed[6][0])), rise), placed[6][0]);
    if (measuring) return penX;

    const int32_t columns = m_cache.width / m_cache.cellW;
    const int32_t cell = list[0].cell;
    const int32_t cellX = (cell % columns) * m_cache.cellW, cellY = (cell / columns) * m_cache.cellH;
    m_drawn.at(static_cast<size_t>(cell)) = true;
    const int32_t s0 = cellX + 1, t0 = cellY + 1;
    const int32_t sPen = originX + s0, tBase = baseline + t0;
    const int32_t sLeft = left - 1 + sPen, sRight = right + 1 + sPen, sAdvance = advance + sPen, tTop = -(top + 1) + tBase, tBottom = -(bottom - 1) + tBase;
    const std::array<std::array<int32_t, 2>, 11> texel{{{sPen, tBase}, {sPen, tTop}, {sLeft, tTop}, {sLeft, tBase}, {sLeft, tBottom}, {sPen, tBottom}, {sAdvance, tBottom},
                                                       {sRight, tBottom}, {sRight, tBase}, {sRight, tTop}, {sAdvance, tTop}}};
    const float perS = A::div(1.0f, static_cast<float>(1 << m_cache.logW)), perT = A::div(1.0f, static_cast<float>(1 << m_cache.logH));
    std::array<uint8_t, 4> colour{};
    for (int i = 0; i < 4; ++i) colour[i] = static_cast<uint8_t>(A::toInt(A::mul(c.colour[i], 128.0f)));
    // The screen matrix: the unit matrix moved to the GS's centre (2048 - W/2, 2048 - H/2).
    const float originXs = static_cast<float>(0x800 - (m_width >> 1)), originYs = static_cast<float>(0x800 - (m_height >> 1));
    const Mat4 screen{{{1, 0, 0, 0}, {0, 1, 0, 0}, {0, 0, 1, 0}, {originXs, originYs, 0, 1}}};
    TextDraw draw;
    draw.kind = TextDraw::Kind::Glyph;
    draw.glyph.region = {s0 - 1, s0 + block.width, t0 - 1, t0 + block.height};
    for (size_t k = 0; k < placed.size(); ++k) {
        const Vec4 on = Matrix<A>::apply(screen, placed[k]);
        const float q = A::div(1.0f, on[3]);
        GlyphVertex& v = draw.glyph.fan[k];
        v.s = A::mul(A::mul(static_cast<float>(texel[k][0]), perS), q);
        v.t = A::mul(A::mul(static_cast<float>(texel[k][1]), perT), q);
        v.q = A::mul(A::mul(1.0f, 1.0f), q);
        v.colour = colour;
        v.x = static_cast<float>(A::toInt(A::mul(A::mul(on[0], q), 16.0f))) / 16.0f - originXs;
        v.y = static_cast<float>(A::toInt(A::mul(A::mul(on[1], q), 16.0f))) / 16.0f - originYs;
    }
    draw.glyph.fan[11] = draw.glyph.fan[1];
    out.draws.push_back(draw);
    return penX;
}

// func_00213EE8: the measured width, (int)((int)reach + pitch x scale).
template <class A>
int32_t Text<A>::widthOf(const std::string& text, TextFrame& out) {
    const float x = scaleX(m_font);
    const float reach = putString(text, true, out);
    return A::toInt(A::add(static_cast<float>(A::toInt(reach)), A::mul(static_cast<float>(m_font.pitch), x)));
}

template <class A>
int32_t Text<A>::stringWidth(const std::string& text) {
    TextFrame scratch;
    return widthOf(text, scratch);
}

// DrawIcon (0x00226508): a button's picture, 28 wide from texture 8 (pictures 0 and 1) or 25 wide from texture 9, half
// as high, its corners from D_002B22A0; in PAL its bottom is scaled by 0.5405 / 0.47 (facts/text.md section 5).
template <class A>
void Text<A>::icon(int32_t picture, int32_t x, int32_t y, int32_t alpha, const TextFrameInputs&, TextFrame& out) {
    const bool wide = picture >= 0 && picture < 2;
    const int32_t size = wide ? 0x1c : 0x19;
    const ProgramImage& p = *m_program;
    Rect r;
    for (int i = 0; i < 4; ++i) r.colour[i] = p.integer(kIconRecord + 4 * i);
    r.z = p.integer(kIconRecord + 0x30);
    r.blend = p.integer(kIconRecord + 0x34);
    r.textured = p.integer(kIconRecord + 0x38);
    r.colour[3] = alpha;
    r.x0 = x << 4;
    r.y0 = y << 4;
    r.x1 = (x + size) << 4;
    r.y1 = (y + static_cast<int32_t>(static_cast<uint32_t>(size) >> 1)) << 4;
    const uint32_t place = kIconPlaces + 16u * static_cast<uint32_t>(picture);
    r.u0 = (p.integer(place) << 4) + 8;
    r.v0 = (p.integer(place + 4) << 4) + 8;
    r.u1 = (p.integer(place + 8) << 4) + 8;
    r.v1 = (p.integer(place + 12) << 4) + 8;
    if (pal())
        r.y1 = static_cast<int32_t>(std::trunc(double(r.y0) + double(static_cast<float>(r.y1 - r.y0)) * p.doubleAt(kIconPalMultiply) / p.doubleAt(kIconPalDivide)));
    TextDraw draw;
    draw.kind = TextDraw::Kind::Icon;
    draw.icon = r;
    draw.texture = wide ? 8 : 9;
    out.draws.push_back(draw);
}

// draw_button_panel (0x00226770): the panel's four slots, each a string id (1 for none); a slot's picture at the
// slot's x for the language and its text 28 to the right, one line lower; the fourth slot ends 24 from the right.
template <class A>
void Text<A>::buttonPanel(int32_t panel, int32_t alpha, int32_t y, const TextFrameInputs& in, TextFrame& out) {
    const ProgramImage& p = *m_program;
    const int32_t row = language();
    setRatio(p.single(kHintRatio));
    const int32_t video = m_settings.videoMode > -1 ? m_settings.videoMode : 0;
    const uint32_t table = kPanels + 0x14u * static_cast<uint32_t>(panel) + (video != 0 ? 0xa0u : 0u);
    const uint32_t slots = kSlots + 16u * static_cast<uint32_t>(row);
    for (uint32_t slot = 0; slot < 4; ++slot) {
        const int32_t id = panel == 8 ? m_panel8[slot] : p.integer(table + 4 * slot);
        if (id == 1) continue;
        const std::string text = languageString(id);
        int32_t x;
        if (slot == 3) {
            const int32_t reach = widthOf(text, out) + 0x18;
            icon(p.integer(kSlotPictures + 0xc), in.width - reach - 0x1c, y, alpha, in, out);
            x = in.width - reach;
        } else {
            icon(p.integer(kSlotPictures + 4 * slot), p.integer(slots + 4 * slot), y, alpha, in, out);
            x = p.integer(slots + 4 * slot) + 0x1c;
        }
        // DrawNonSelectableItem: the colour D_002B2460 with the panel's alpha, one line under the picture's top.
        setColour(p.integer(kHintColour), p.integer(kHintColour + 4), p.integer(kHintColour + 8), alpha);
        setLocate(x, y + 1);
        putString(text, false, out);
    }
    setRatio(1.0f);
}

template <class A>
TextFrame Text<A>::frame(const TextFrameInputs& in) {
    const ProgramImage& p = *m_program;
    m_width = in.width;
    m_height = in.height;
    if (!m_afterPages) m_drawn.assign(m_cells.size(), false);
    m_afterPages = false;
    const TextRamps& ramps = in.ramps ? *in.ramps : m_ramps;
    m_panel8 = ramps.panel8Ids;
    TextFrame out;

    // func_00226300: the date at the left and the time ending 22 from the right, 14 from the top (32 when item 0 is 2).
    int32_t y = in.item0 == 2 ? 0x20 : 0xe;
    if (pal()) y = static_cast<int32_t>(std::trunc(double(static_cast<float>(y)) * p.doubleAt(kPalMultiply) / p.doubleAt(kPalDivide)));
    setRatio(p.single(kDateRatio));
    // func_00230008: 128 unless a dialog closes (or the first run's ramp holds it at 0), by the ramps of System
    // Configuration otherwise; times the overlay level.
    int32_t dateAlpha;
    if (ramps.dialogClosing.state != 0) dateAlpha = 0x80;
    else if (ramps.firstRun.state != 0) dateAlpha = 0;
    else dateAlpha = divide(int64_t(clampTo(ramps.config.counter - (ramps.lead + ramps.body), in.tail)) << 7, in.tail);
    setColour(0x60, 0x60, 0x60, by128(int64_t(dateAlpha) * in.overlayLevel));

    // do_format_date (0x00214550) by item 0xE; do_format_time (0x00214640) by item 0xD.
    const ClockItems& t = in.items;
    std::string date;
    switch (m_settings.dateFormat) {
    case 0: date = t.year < 0 ? p.string(kDateNone[0]) : format(p.string(kDateYearFirst), {}, {t.year, t.month, t.day}); break;
    case 1: date = t.year < 0 ? p.string(kDateNone[1]) : format(p.string(kDateYearLast), {}, {t.month, t.day, t.year}); break;
    case 2: date = t.year < 0 ? p.string(kDateNone[2]) : format(p.string(kDateYearLast), {}, {t.day, t.month, t.year}); break;
    default: throw std::runtime_error("text: date format " + std::to_string(m_settings.dateFormat) + " gives no string");
    }
    setLocate(0x16, y);
    putString(date, false, out);
    // config_get_daylight_saving: bit 29 of the settings word.
    const std::string mark = p.string(((m_settings.settingsWord >> 29) & 1) ? kSummerMark : kNoMark);
    std::string time;
    switch (m_settings.timeFormat) {
    case 0: time = t.hour < 0 ? p.string(kTimeNone[0]) : format(p.string(kTime24), {}, {t.hour, t.minute, t.second}); break;
    case 1: {
        if (t.hour < 0) { time = p.string(kTimeNone[1]); break; }
        const int32_t twelve = t.hour % 12 != 0 ? t.hour % 12 : 12;
        time = format(p.string(kTime12), {p.string(t.hour < 12 ? kMorning : kAfternoon)}, {twelve, t.minute, t.second});
        break;
    }
    default: throw std::runtime_error("text: time format " + std::to_string(m_settings.timeFormat) + " gives no string");
    }
    const std::string line = format(p.string(kTimeLine), {mark, time}, {});
    const int32_t width = widthOf(line, out);
    setLocate(in.width - width - 0x16, y);
    putString(line, false, out);

    // func_002269E0: the button panels and their alpha; func_00226958: their line, 200 (182 when item 0 is 2).
    int32_t hintY = in.item0 == 2 ? 0xb6 : 0xc8;
    if (pal()) hintY = static_cast<int32_t>(std::trunc(double(static_cast<float>(hintY)) * p.doubleAt(kHintPalMultiply) / p.doubleAt(kHintPalDivide)));
    if (ramps.panel7 == 1) {
        buttonPanel(7, 0x80, hintY, in, out);
    } else {
        if (ramps.panel8On != 0) buttonPanel(8, ramps.panel8, hintY, in, out);
        // func_002326F0: the first of panels 1 to 6 whose alpha is above 0 (0x00226A6C returns after it), by func_00231E78, func_00230E10, func_0022A238 (1 and 0), func_00228F40,
        // func_00230C28, capped at 128 (verify_text2.mjs panelsOf).
        const Ramp& menu = in.menu;
        const int32_t tail = in.tail;
        const auto mainMenu = [&] {
            return menuAlphaOf(ramps, tail, in.overlayLevel);
        };
        const auto configuration = [&] {
            return configAlphaOf(ramps, tail, menu);
        };
        const auto adjust = [&](int32_t side) {
            const int32_t a = by128(int64_t(scaleOf(ramps.version, 0x80)) * (0x80 - scaleOf(ramps.dialog, 0x80)));
            if (a <= 0) return 0;
            return ((ramps.adjustRow != 0 ? 1 : 0) ^ side) == 0 ? a : 0;
        };
        const auto clock = [&] { return divide(int64_t(clampTo(menu.counter - ramps.body, tail)) << 7, tail); };
        for (int32_t panel = 1; panel < 7; ++panel) {
            int32_t a = 0;
            switch (panel) {
            case 1: a = mainMenu(); break;
            case 2: a = configuration(); break;
            case 3: a = adjust(1); break;
            case 4: a = adjust(0); break;
            case 5: a = scaleOf(ramps.dialog, 0x80); break;
            case 6: a = clock(); break;
            }
            if (a > 0x80) a = 0x80;
            if (a > 0) {
                buttonPanel(panel, a, hintY, in, out);
                break;
            }
        }
    }

    finish(out);
    return out;
}

// get_lang_string (0x002081B8): the language's table, as config_set_langtbl chose it (clock_text.mjs languageOf).
template <class A>
std::string Text<A>::languageString(int32_t id) const {
    const ProgramImage& p = *m_program;
    if (m_settings.videoMode > 0 && (id == 0x55 || id == 0x56)) id = 0x55 + 0x56 - id;
    const uint32_t language = ((m_settings.settingsWord >> 4) & 0x1f) ? ((m_settings.settingsWord >> 4) & 0x1f) : 1;
    const uint32_t strings = p.word(kLanguageTables + 4 * language);
    return p.string(p.word(strings + 4 * static_cast<uint32_t>(id)));
}

template <class A>
void Text<A>::colourFrom(uint32_t at, int32_t alpha) {
    const ProgramImage& p = *m_program;
    setColour(p.integer(at), p.integer(at + 4), p.integer(at + 8), alpha);
}

// DrawNonSelectableItem (0x002269E6..): the colour at `colour` with the alpha, the pen, the string; returns what
// func_00213E90 gives the caller after it: (int)((int)(reach - start) + pitch x scale).
template <class A>
int32_t Text<A>::drawItem(int32_t x, int32_t y, uint32_t colour, int32_t alpha, const std::string& text, TextFrame& out) {
    colourFrom(colour, alpha);
    setLocate(x, y);
    const float start = m_font.locate[0];
    const float reach = putString(text, false, out);
    return A::toInt(A::add(static_cast<float>(A::toInt(A::sub(reach, start))), A::mul(static_cast<float>(m_font.pitch), scaleX(m_font))));
}

// draw_menu_item (0x00226C00): nothing under alpha 16; otherwise the string centred on x by its measured width.
template <class A>
void Text<A>::menuItem(int32_t x, int32_t y, uint32_t colour, int32_t alpha, const std::string& text, TextFrame& out) {
    if (alpha < 16) return;
    const int32_t width = widthOf(text, out);
    drawItem(x - half(width), y, colour, alpha, text, out);
}

// clock_str_related (0x002270A8): the width of the value's template, measured when the time format changes.
template <class A>
int32_t Text<A>::templateWidth(int32_t timeFormat, TextFrame& out) {
    const ProgramImage& p = *m_program;
    if (m_templateWidth == 0 || m_templateFormat != timeFormat) {
        m_templateFormat = timeFormat;
        m_templateWidth = widthOf(p.string(timeFormat == 1 ? kValueTemplate12 : kValueTemplate24), out);
    }
    return m_templateWidth;
}

// draw_clock_menu_items (0x00232170): item n centred on 430, 16 apart from 14 above the middle; the chosen one in
// D_002B2540, the others in D_002B2550. func_00232020 and the main menu's ramp decide whether it draws at all.
template <class A>
void Text<A>::mainMenuItems(const PagesInputs& in, TextFrame& out) {
    const TextRamps& r = in.ramps;
    if (r.mainMenu.state != 2) return;
    if (r.config.state != 0 || r.version.state != 0 || r.dialogClosing.state != 0 || r.firstRun.state != 0 || in.pending != 0) return;
    const int32_t alpha = menuAlphaOf(r, in.tail, in.overlayLevel);
    const ProgramImage& p = *m_program;
    setRatio(1.0f);
    for (int32_t n = 0; n < in.mainMenu.count; ++n) {
        const int32_t id = p.integer(in.mainMenu.items + 16u * static_cast<uint32_t>(n));
        menuItem(430, half(in.height) - 14 + 16 * n, n == in.mainMenu.selected ? kChosenColour : kPlainColour, alpha, languageString(id), out);
    }
}

// func_0022A410: the Version page. The title centred on 404 (27 above the table's top, 31.05 on PAL), the rows from two above the
// first shown one, a line (11, 13 on PAL) a row whether it shows or not; the label right-aligned on 391, the value at 417; the
// chosen row's label in the chosen colour when its module has sub-rows. The page's alpha is func_0022A1D8's.
template <class A>
void Text<A>::versionPage(const PagesInputs& in, TextFrame& out) {
    const TextRamps& r = in.ramps;
    if (r.version.state == 0 || r.dialog.state == 2) return;
    const VersionPage& v = in.version;
    const ProgramImage& p = *m_program;
    const int32_t alpha = by128(int64_t(scaleOf(r.version, 0x80)) * (0x80 - scaleOf(r.dialog, 0x80)));
    const double centre = double(half(in.height));
    const int32_t top = static_cast<int32_t>(std::trunc(centre - (pal() ? p.doubleAt(kVersionPal) : 6.0)));
    const int32_t titleY = static_cast<int32_t>(std::trunc(double(top) - (pal() ? p.doubleAt(kVersionPal + 8) : 27.0)));
    const int32_t first = static_cast<int32_t>(std::trunc(0.0 - (pal() ? p.doubleAt(kVersionPal + 16) : 17.0)));
    const int32_t step = pal() ? 13 : 11;
    setRatio(p.single(kVersionRatio));
    menuItem(0x194, titleY, kTitleColour, alpha, languageString(v.title), out);
    int32_t y = first + top;
    for (int32_t row = v.first - 2; row < v.first + v.shown + 4; ++row, y += step) {
        if (row < 0 || row >= v.count || row < v.first || row >= v.first + v.shown) continue;
        const VersionRow& entry = v.rows.at(static_cast<size_t>(row));
        const std::string label = entry.label != 0 ? languageString(entry.label) : std::string(kNullPointerText);
        const std::string value = entry.value.empty() ? std::string(kNullPointerText) : entry.value;
        uint32_t labelColour = kPlainColour, valueColour = kPlainColour;
        if (row == v.selected) {
            labelColour = entry.subRows != 0 ? kChosenColour : kValueColour;
            valueColour = kValueColour;
        }
        if (alpha >= 16) drawItem(0x187 - widthOf(label, out), y, labelColour, alpha, label, out);
        drawItem(0x1a1, y, valueColour, alpha, value, out);
    }
}

// browser_str_related (0x00231388): the title, the widest entry's width (browser_str_related2), the arrow and the one or two
// entries of the crossfade (R4); the places and colours are verify_text2.mjs LIST_Y and PLACES.
template <class A>
std::optional<int32_t> Text<A>::list(const PagesInputs& in, TextFrame& out, std::vector<uint32_t>& unmodelled) {
    const TextRamps& r = in.ramps;
    const ProgramImage& p = *m_program;
    const int32_t top = pal() ? 0x65 : 0x58;
    const int32_t chosenY = static_cast<int32_t>(std::trunc(double(top) + (pal() ? p.doubleAt(kListPalChosen) : 24.0)));
    if (r.config.state == 0 || in.menuRamp.state == 2) return std::nullopt;
    const int32_t alpha = configAlphaOf(r, in.tail, in.menuRamp);
    setRatio(1.0f);
    menuItem(430, top, kTitleColour, alpha, languageString(in.page.word0), out);
    int32_t widest = 0;
    for (int32_t i = 0; i < in.page.count; ++i) {
        const std::string name = languageString(in.entries.at(static_cast<size_t>(i)).id);
        widthOf(name, out);
        widest = std::max(widest, widthOf(name, out));
    }
    const std::string arrow = p.string(kArrow);
    const int32_t reach = half(widest) + widthOf(arrow, out) + 0x1be;
    const int32_t centre = reach < in.width - 0x18 ? 430 : 430 - (reach + 0x18 - in.width);
    if (in.page.level != 1 && r.config.state == 2 && in.menuRamp.state == 0) {
        // The pulse after the chosen entry: |(int)(sinf(counter x 0x7AA8 / (fps x 0x7AA8 / 60) / divisor) x 128)|.
        const int32_t period = (pal() ? 50 : 60) * 0x7aa8 / 60;
        const int32_t counter = static_cast<int32_t>(static_cast<uint32_t>(in.page.glow) * 0x7aa8u) / period;
        const int32_t pulse = A::toInt(A::mul(A::sinf(A::div(static_cast<float>(counter), in.listConstants.divisor)), 128.0f));
        drawItem(centre + half(widest) + 0x10, chosenY, kValueColour, pulse < 0 ? -pulse : pulse, arrow, out);
    }
    listEntry(in, in.page.selected, by128(int64_t(in.listFade.first) * alpha), out, unmodelled);
    if (in.listFade.second != 0) listEntry(in, in.listFade.secondIndex, by128(int64_t(in.listFade.second) * alpha), out, unmodelled);
    return widest;
}

// func_002311E8: one entry of the list, its name under the title and its value under that.
template <class A>
void Text<A>::listEntry(const PagesInputs& in, int32_t index, int32_t alpha, TextFrame& out, std::vector<uint32_t>& unmodelled) {
    const ProgramImage& p = *m_program;
    const int32_t top = pal() ? 0x65 : 0x58;
    const int32_t chosenY = static_cast<int32_t>(std::trunc(double(top) + (pal() ? p.doubleAt(kListPalChosen) : 24.0)));
    const int32_t valueY = static_cast<int32_t>(std::trunc(double(top) + (pal() ? p.doubleAt(kListPalValue) : 42.0)));
    const ConfigEntry& entry = in.entries.at(static_cast<size_t>(index));
    const std::string name = languageString(entry.id);
    const int32_t arrows = widthOf(p.string(kArrow), out) + 0x10;
    const int32_t width = widthOf(name, out);
    const int32_t end = 430 + half(width) + arrows;
    const int32_t centre = end < in.width - 0x18 ? 430 : 430 - (end + 0x18 - in.width);
    const bool inside = in.page.level == 1;
    menuItem(centre, chosenY, inside ? kValueColour : kChosenColour, alpha, name, out);
    const bool editing = inside && in.page.selected == index;
    if (!entryValue(in, entry, 430, valueY, alpha, editing, out)) unmodelled.push_back(editing ? entry.frameCallback : entry.stringCallback);
}

// The entry's callback at +0x18 (its value), or at +0x1C while it is being changed.
template <class A>
bool Text<A>::entryValue(const PagesInputs& in, const ConfigEntry& entry, int32_t x, int32_t y, int32_t alpha, bool editing, TextFrame& out) {
    const ProgramImage& p = *m_program;
    const uint32_t callback = editing ? entry.frameCallback : entry.stringCallback;
    if (callback == kClockString) {
        // func_00226E68: the first three fields in the order of the date format, from the template at D_003655B0.
        std::array<AdjustField, 6> fields = in.adjustFields;
        const auto field = [&](uint32_t n) { return AdjustField{p.integer(kAdjustTemplate + 12 * n), p.integer(kAdjustTemplate + 12 * n + 4), p.integer(kAdjustTemplate + 12 * n + 8)}; };
        switch (in.items[0xe]) {
        case 0: fields[0] = field(0); fields[1] = field(1); fields[2] = field(2); break;
        case 1: fields[0] = field(1); fields[1] = field(2); fields[2] = field(0); break;
        case 2: fields[0] = field(2); fields[1] = field(1); fields[2] = field(0); break;
        default: break;
        }
        return clockValue(in, entry, fields, x, y, alpha, false, out);
    } else if (callback == kClockEdit) {
        return clockValue(in, entry, in.adjustFields, x, y, alpha, true, out);
    } else if (callback == kItemString || callback == kItemStringJump) {
        // func_002283C0: the row of the value table the item holds, then clock_config_get_item_str's string for it.
        if (entry.item < 0 || static_cast<size_t>(entry.item) >= in.items.size()) return false;
        const int32_t value = in.items[static_cast<size_t>(entry.item)];
        const uint32_t table = entry.valueTable;
        int32_t index = entry.valueIndex;
        if (value != p.integer(table + 32u * static_cast<uint32_t>(index))) {
            index = 0;
            if (entry.valueCount > 0 && value != p.integer(table)) {
                for (int32_t row = 1; row < entry.valueCount; ++row)
                    if (value == p.integer(table + 32u * static_cast<uint32_t>(row))) { index = row; break; }
            }
        }
        menuItem(x, y, kValueColour, alpha, languageString(p.integer(table + 32u * static_cast<uint32_t>(index) + 4)), out);
    } else if (callback == kRowEdit) {
        valueRow(entry, x, y, alpha, out);
    } else {
        return false;
    }
    return true;
}

// func_002284F8: every value of the entry side by side, 16 apart, centred on x; the chosen one in D_002B2540.
template <class A>
void Text<A>::valueRow(const ConfigEntry& entry, int32_t x, int32_t y, int32_t alpha, TextFrame& out) {
    const ProgramImage& p = *m_program;
    const auto name = [&](int32_t row) { return languageString(p.integer(entry.valueTable + 32u * static_cast<uint32_t>(row) + 4)); };
    int32_t total = 0;
    for (int32_t row = 0; row < entry.valueCount; ++row) total += widthOf(name(row), out);
    total += (entry.valueCount - 1) * 16;
    int32_t at = x - half(total);
    for (int32_t row = 0; row < entry.valueCount; ++row) {
        drawItem(at, y, row == entry.valueIndex ? kChosenColour : kPlainColour, alpha, name(row), out);
        at += widthOf(name(row), out) + 16;
    }
}

// clock_str_related (0x002270A8): the date and time field by field (the program draws each as \ap@0, the digits, \ap00,
// then the separator), the pen carried by func_00213E90; `editing` draws the chosen field in D_002B2540, the others in D_002B2550.
template <class A>
bool Text<A>::clockValue(const PagesInputs& in, const ConfigEntry& entry, const std::array<AdjustField, 6>& fields, int32_t x, int32_t y, int32_t alpha, bool editing, TextFrame& out) {
    const ProgramImage& p = *m_program;
    const uint32_t chosen = editing ? kChosenColour : kValueColour, plain = editing ? kPlainColour : kValueColour;
    const int32_t timeFormat = in.items[0xd];
    int32_t at = x - half(templateWidth(timeFormat, out));
    for (int32_t n = 0; n < entry.valueCount; ++n) {
        const int32_t kind = fields.at(static_cast<size_t>(n)).item - 6;
        if (kind < 0 || kind > 5) return false;
        const int32_t value = in.items[static_cast<size_t>(6 + kind)];
        std::string text;
        switch (kind) {
        case 0: text = format(p.string(kFormatYear), {}, {value}); break;
        case 3: text = format(p.string(kFormat2), {}, {timeFormat == 1 ? (value % 12 != 0 ? value % 12 : 12) : value}); break;
        default: text = format(p.string(kFormat02), {}, {value}); break;
        }
        putString(p.string(kFixedOpen), false, out);
        at += drawItem(at, y, n == entry.valueIndex ? chosen : plain, alpha, text, out);
        putString(p.string(kFixedClose), false, out);
        switch (n) {
        case 0:
        case 1: at += drawItem(at, y, plain, alpha, p.string(kSlash), out); break;
        case 2: at += 2 * widthOf(p.string(kSpace), out); break;
        case 3:
        case 4: at += drawItem(at, y, plain, alpha, p.string(kColon), out); break;
        case 5:
            if (timeFormat == 1) drawItem(at, y, plain, alpha, p.string(in.items[9] < 12 ? kFieldMorning : kFieldAfternoon), out);
            break;
        default: break;
        }
    }
    return true;
}

// The pages function: the main menu's items, then System Configuration's list.
template <class A>
PagesFrame Text<A>::pages(const PagesInputs& in) {
    m_width = in.width;
    m_height = in.height;
    m_drawn.assign(m_cells.size(), false);
    m_afterPages = true;
    PagesFrame out;
    mainMenuItems(in, out.text);
    out.titleWidth = list(in, out.text, out.unmodelled);
    versionPage(in, out.text);
    finish(out.text);
    return out;
}

TextRamps textRampsOf(const MenusState& menus, const TextRamps& constants) {
    TextRamps r = constants;
    r.config = menus.page.ramp;
    r.mainMenu = menus.mainMenu.ramp;
    r.version = menus.versionRamp;
    r.dialogClosing = menus.dialogRamp;
    r.firstRun = menus.firstRunRamp;
    r.lead = menus.menuLengths[0];
    r.body = menus.body;
    // func_002266E0(0x5E, 0x55, 0x56, 0x57), which the list's entry callbacks call when the page opens (D_00227BE8, D_00227CA8,
    // clock_config_change_cb_*); inside an entry the page calls it with others.
    if (menus.page.level == 0) r.panel8Ids = {0x5e, 0x55, 0x56, 0x57};
    if (menus.versionRamp.state != 0 || menus.version.panelOn != 0) {
        const VersionPage& v = menus.version;
        r.panel8On = v.panelOn;
        r.panel8 = v.panelAlpha;
        if (menus.versionRamp.state != 0) r.panel8Ids = v.hints;
        r.adjustRow = v.rows.at(static_cast<size_t>(std::clamp(v.selected, 0, int(kVersionRows) - 1))).subRows;
    }
    return r;
}

MenusState menusAtPages(const MenusState& before, const MenusState& after) {
    MenusState at = before;
    at.page.glow = after.page.glow;
    const auto ticked = [](Ramp& b, const Ramp& a) {
        if (b.counter != a.counter) b = a;
    };
    ticked(at.page.ramp, after.page.ramp);
    ticked(at.mainMenu.ramp, after.mainMenu.ramp);
    ticked(at.versionRamp, after.versionRamp);
    ticked(at.dialogRamp, after.dialogRamp);
    ticked(at.firstRunRamp, after.firstRunRamp);
    if (after.versionDrawnValid) {
        at.version = after.versionDrawn;
        at.versionRamp = after.versionRampDrawn;
    }
    return at;
}

PagesInputs pagesOf(const MenusState& menus, const ClockState& clock, const ConfigItems& items, const TextRamps& ramps, int32_t width, int32_t height) {
    PagesInputs in;
    in.mainMenu = menus.mainMenu;
    in.page = menus.page;
    in.entries = menus.entries;
    in.listFade = menus.listFade;
    in.listConstants = menus.listConstants;
    in.adjustFields = menus.adjustFields;
    in.items = items;
    in.menuRamp = clock.menuRamp;
    in.tail = clock.tail;
    in.overlayLevel = clock.overlayLevel;
    in.ramps = ramps;
    in.width = width;
    in.height = height;
    in.pending = menus.pagePointers[4];
    in.version = menus.version;
    return in;
}

template <class A>
TextFrame Text<A>::drawString(const std::string& text, int32_t width, int32_t height) {
    m_width = width;
    m_height = height;
    m_drawn.assign(m_cells.size(), false);
    TextFrame out;
    putString(text, false, out);
    finish(out);
    return out;
}

// The cache as GS memory holds it once the frame's text is drawn.
template <class A>
void Text<A>::finish(TextFrame& out) const {
    out.glyphs.address = m_cache.texture;
    out.glyphs.cellWidth = m_cache.cellW;
    out.glyphs.cellHeight = m_cache.cellH;
    out.glyphs.width = m_cache.width;
    out.glyphs.logWidth = m_cache.logW;
    out.glyphs.logHeight = m_cache.logH;
    out.glyphs.cells = m_cells;
}

std::vector<uint8_t> glyphCacheImage(const Font& font, const GlyphCache& cache) {
    const int32_t size = 1 << cache.logWidth, rows = 1 << cache.logHeight;
    std::vector<uint8_t> out(size_t(size) * size_t(rows) * 4, 0);
    if (cache.cellWidth <= 0) return out;
    const int32_t columns = cache.width / cache.cellWidth;
    for (size_t n = 0; n < cache.cells.size(); ++n) {
        if (cache.cells[n] == 0) continue;
        const std::optional<Glyph> glyph = font.glyph(cache.cells[n]);
        if (!glyph) throw std::runtime_error("glyph cache: no glyph for a cell's code");
        const std::array<Rgba, 16> table = font.table(*glyph->block);
        const int32_t cellX = (static_cast<int32_t>(n) % columns) * cache.cellWidth, cellY = (static_cast<int32_t>(n) / columns) * cache.cellHeight;
        for (int32_t y = 0; y < glyph->block->height; ++y)
            for (int32_t x = 0; x < glyph->block->width; ++x) {
                const Rgba& c = table[static_cast<size_t>(font.pixel(*glyph, x, y))];
                const size_t at = (size_t(cellY + 1 + y) * size_t(size) + size_t(cellX + 1 + x)) * 4;
                for (size_t i = 0; i < 4; ++i) out[at + i] = c[i];
            }
    }
    return out;
}

#ifndef SCENE_NATIVE_ONLY
template class Text<EeArithmetic>;
#endif
template class Text<NativeArithmetic>;

}
