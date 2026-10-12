#include "App/Input.hpp"

namespace app {

uint32_t bitOf(PadButton button) {
    switch (button) {
    case PadButton::Up: return scene::pad::Up;
    case PadButton::Down: return scene::pad::Down;
    case PadButton::Left: return scene::pad::Left;
    case PadButton::Right: return scene::pad::Right;
    case PadButton::Cross: return scene::pad::Cross;
    case PadButton::Circle: return scene::pad::Circle;
    case PadButton::Square: return scene::pad::Square;
    case PadButton::Triangle: return scene::pad::Triangle;
    }
    return 0;
}

uint32_t PadReader::held() const {
    uint32_t out = 0;
    for (const auto& [source, bits] : m_held) out |= bits;
    return out;
}
void PadReader::down(uint32_t source, uint32_t bit) {
    if (!(held() & bit)) m_pressed |= bit;
    m_held[source] |= bit;
}
void PadReader::up(uint32_t source, uint32_t bit) {
    m_held[source] &= ~bit;
    if (!(held() & bit)) m_released |= bit;
}
void PadReader::dropSource(uint32_t source) {
    const auto found = m_held.find(source);
    if (found == m_held.end()) return;
    const uint32_t bits = found->second;
    m_held.erase(found);
    m_released |= bits & ~held();
}
void PadReader::clear() {
    m_released |= held();
    m_held.clear();
}
scene::PadWords PadReader::frame() {
    const uint32_t now = held();
    scene::PadWords w{now, (now & ~m_previous) | m_pressed, (m_previous & ~now) | m_released, 0};
    w.repeating = w.pressed;
    m_previous = now;
    m_pressed = m_released = 0;
    return w;
}

Bindings Bindings::defaults() {
    Bindings b;
    b.keys = {{SDL_SCANCODE_UP, PadButton::Up},         {SDL_SCANCODE_DOWN, PadButton::Down},     {SDL_SCANCODE_LEFT, PadButton::Left},
              {SDL_SCANCODE_RIGHT, PadButton::Right},   {SDL_SCANCODE_RETURN, PadButton::Cross},  {SDL_SCANCODE_Z, PadButton::Cross},
              {SDL_SCANCODE_ESCAPE, PadButton::Circle}, {SDL_SCANCODE_X, PadButton::Circle},      {SDL_SCANCODE_BACKSPACE, PadButton::Square},
              {SDL_SCANCODE_S, PadButton::Square},      {SDL_SCANCODE_T, PadButton::Triangle}};
    b.buttons = {{SDL_GAMEPAD_BUTTON_DPAD_UP, PadButton::Up},     {SDL_GAMEPAD_BUTTON_DPAD_DOWN, PadButton::Down}, {SDL_GAMEPAD_BUTTON_DPAD_LEFT, PadButton::Left},
                 {SDL_GAMEPAD_BUTTON_DPAD_RIGHT, PadButton::Right}, {SDL_GAMEPAD_BUTTON_SOUTH, PadButton::Cross},  {SDL_GAMEPAD_BUTTON_EAST, PadButton::Circle},
                 {SDL_GAMEPAD_BUTTON_WEST, PadButton::Square},     {SDL_GAMEPAD_BUTTON_NORTH, PadButton::Triangle}};
    return b;
}
void Bindings::bindKey(SDL_Scancode key, PadButton button) { keys[key] = button; }
void Bindings::bindButton(SDL_GamepadButton pad, PadButton button) { buttons[pad] = button; }

void feed(PadReader& reader, const Bindings& bindings, const SDL_Event& event) {
    switch (event.type) {
    case SDL_EVENT_KEY_DOWN:
    case SDL_EVENT_KEY_UP: {
        if (event.key.repeat) return;
        const auto found = bindings.keys.find(event.key.scancode);
        if (found == bindings.keys.end()) return;
        if (event.type == SDL_EVENT_KEY_DOWN) reader.down(0, bitOf(found->second));
        else reader.up(0, bitOf(found->second));
        return;
    }
    case SDL_EVENT_GAMEPAD_BUTTON_DOWN:
    case SDL_EVENT_GAMEPAD_BUTTON_UP: {
        const auto found = bindings.buttons.find(static_cast<SDL_GamepadButton>(event.gbutton.button));
        if (found == bindings.buttons.end()) return;
        const uint32_t source = static_cast<uint32_t>(event.gbutton.which);
        if (event.type == SDL_EVENT_GAMEPAD_BUTTON_DOWN) reader.down(source, bitOf(found->second));
        else reader.up(source, bitOf(found->second));
        return;
    }
    case SDL_EVENT_GAMEPAD_REMOVED: reader.dropSource(static_cast<uint32_t>(event.gdevice.which)); return;
    case SDL_EVENT_WINDOW_FOCUS_LOST: reader.clear(); return;
    default: return;
    }
}

}
