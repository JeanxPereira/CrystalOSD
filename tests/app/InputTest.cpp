#include <cstdio>
#include <fstream>
#include <string>

#include <SDL3/SDL.h>
#include <nlohmann/json.hpp>

#include "App/Input.hpp"

namespace {

#define CHECK(condition)                                                         \
    do {                                                                         \
        if (!(condition)) {                                                      \
            std::fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #condition); \
            return 1;                                                            \
        }                                                                        \
    } while (0)

SDL_Event key(SDL_EventType type, SDL_Scancode code, bool repeat = false) {
    SDL_Event e{};
    e.type = type;
    e.key.scancode = code;
    e.key.repeat = repeat;
    return e;
}
SDL_Event button(SDL_EventType type, SDL_JoystickID which, SDL_GamepadButton b) {
    SDL_Event e{};
    e.type = type;
    e.gbutton.which = which;
    e.gbutton.button = static_cast<Uint8>(b);
    return e;
}

int bits() {
    CHECK(app::bitOf(app::PadButton::Up) == 0x1000 && app::bitOf(app::PadButton::Right) == 0x2000);
    CHECK(app::bitOf(app::PadButton::Down) == 0x4000 && app::bitOf(app::PadButton::Left) == 0x8000);
    CHECK(app::bitOf(app::PadButton::Triangle) == 0x10 && app::bitOf(app::PadButton::Cross) == 0x20);
    CHECK(app::bitOf(app::PadButton::Circle) == 0x40 && app::bitOf(app::PadButton::Square) == 0x80);
    return 0;
}

int defaults() {
    const app::Bindings b = app::Bindings::defaults();
    CHECK(b.keys.at(SDL_SCANCODE_RETURN) == app::PadButton::Cross && b.keys.at(SDL_SCANCODE_Z) == app::PadButton::Cross);
    CHECK(b.keys.at(SDL_SCANCODE_ESCAPE) == app::PadButton::Circle && b.keys.at(SDL_SCANCODE_X) == app::PadButton::Circle);
    CHECK(b.keys.at(SDL_SCANCODE_BACKSPACE) == app::PadButton::Square && b.keys.at(SDL_SCANCODE_S) == app::PadButton::Square);
    CHECK(b.keys.at(SDL_SCANCODE_T) == app::PadButton::Triangle && b.keys.at(SDL_SCANCODE_UP) == app::PadButton::Up);
    CHECK(b.buttons.at(SDL_GAMEPAD_BUTTON_SOUTH) == app::PadButton::Cross && b.buttons.at(SDL_GAMEPAD_BUTTON_EAST) == app::PadButton::Circle);
    CHECK(b.buttons.at(SDL_GAMEPAD_BUTTON_WEST) == app::PadButton::Square && b.buttons.at(SDL_GAMEPAD_BUTTON_NORTH) == app::PadButton::Triangle);
    app::Bindings r = b;
    r.bindKey(SDL_SCANCODE_Z, app::PadButton::Triangle);
    CHECK(r.keys.at(SDL_SCANCODE_Z) == app::PadButton::Triangle && r.keys.at(SDL_SCANCODE_RETURN) == app::PadButton::Cross);
    return 0;
}

// Review Focus 1.
int edges() {
    const app::Bindings b = app::Bindings::defaults();
    app::PadReader reader;
    app::feed(reader, b, key(SDL_EVENT_KEY_DOWN, SDL_SCANCODE_RETURN));
    app::feed(reader, b, key(SDL_EVENT_KEY_UP, SDL_SCANCODE_RETURN));
    scene::PadWords w = reader.frame();
    CHECK(w.pressed == 0x20 && w.released == 0x20 && w.held == 0 && w.repeating == 0x20);   // tap inside one frame
    w = reader.frame();
    CHECK(w.pressed == 0 && w.released == 0);
    app::feed(reader, b, key(SDL_EVENT_KEY_DOWN, SDL_SCANCODE_DOWN));
    CHECK(reader.frame().pressed == 0x4000);
    app::feed(reader, b, key(SDL_EVENT_KEY_DOWN, SDL_SCANCODE_DOWN, true));                 // held key gives one edge
    for (int i = 0; i < 5; ++i) { w = reader.frame(); CHECK(w.pressed == 0 && w.held == 0x4000); }
    app::feed(reader, b, key(SDL_EVENT_KEY_UP, SDL_SCANCODE_DOWN));
    w = reader.frame();
    CHECK(w.released == 0x4000 && w.held == 0);
    // Keyboard and gamepad hold the same button: it stays held until both let go.
    app::feed(reader, b, key(SDL_EVENT_KEY_DOWN, SDL_SCANCODE_Z));
    app::feed(reader, b, button(SDL_EVENT_GAMEPAD_BUTTON_DOWN, 7, SDL_GAMEPAD_BUTTON_SOUTH));
    CHECK(reader.frame().pressed == 0x20);
    app::feed(reader, b, key(SDL_EVENT_KEY_UP, SDL_SCANCODE_Z));
    CHECK(reader.frame().held == 0x20);
    return 0;
}

// Review Focus 4.
int releases() {
    const app::Bindings b = app::Bindings::defaults();
    app::PadReader reader;
    app::feed(reader, b, button(SDL_EVENT_GAMEPAD_BUTTON_DOWN, 3, SDL_GAMEPAD_BUTTON_EAST));
    CHECK(reader.frame().held == 0x40);
    SDL_Event removed{};
    removed.type = SDL_EVENT_GAMEPAD_REMOVED;
    removed.gdevice.which = 3;
    app::feed(reader, b, removed);                                                           // gamepad removed releases
    scene::PadWords w = reader.frame();
    CHECK(w.held == 0 && w.released == 0x40);
    app::feed(reader, b, button(SDL_EVENT_GAMEPAD_BUTTON_DOWN, 4, SDL_GAMEPAD_BUTTON_EAST));
    CHECK(reader.frame().pressed == 0x40);
    app::feed(reader, b, key(SDL_EVENT_KEY_DOWN, SDL_SCANCODE_LEFT));
    reader.frame();
    SDL_Event focus{};
    focus.type = SDL_EVENT_WINDOW_FOCUS_LOST;
    app::feed(reader, b, focus);                                                             // focus lost releases
    w = reader.frame();
    CHECK(w.held == 0 && (w.released & 0x8000) && (w.released & 0x40));
    app::feed(reader, b, key(SDL_EVENT_KEY_DOWN, SDL_SCANCODE_LEFT));
    CHECK(reader.frame().pressed == 0x8000);
    return 0;
}

// The cross bit is the one the console's pad word holds in the frame whose cross opens System Configuration.
int capture(const char* path) {
    std::ifstream in(path);
    const nlohmann::json scene = nlohmann::json::parse(in);
    for (const auto& frame : scene.at("frames")) {
        const auto& s = frame.at("expect").at("stages").at("menus");
        if (s.at("before").at("configPage").at("ramp").at("state") == 0 && s.at("after").at("configPage").at("ramp").at("state") == 1) {
            CHECK((frame.at("input").at("pad").at("pressed").get<uint32_t>() & app::bitOf(app::PadButton::Cross)) != 0);
            std::printf("cross bit seen in frame %d of the capture\n", frame.at("index").get<int>());
            return 0;
        }
    }
    std::fprintf(stderr, "no frame opens System Configuration in %s\n", path);
    return 1;
}

}

int main(int argc, char** argv) {
    if (int failed = bits()) return failed;
    if (int failed = defaults()) return failed;
    if (int failed = edges()) return failed;
    if (int failed = releases()) return failed;
    if (argc > 1)
        if (int failed = capture(argv[1])) return failed;
    std::printf("input: all equal\n");
    return 0;
}
