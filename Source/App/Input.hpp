#pragma once

#include <cstdint>
#include <map>

#include <SDL3/SDL.h>

#include "Scene/MenuTypes.hpp"

namespace app {
enum class PadButton { Up, Down, Left, Right, Cross, Circle, Square, Triangle };
uint32_t bitOf(PadButton button);

class PadReader {
public:
    void down(uint32_t source, uint32_t bit);
    void up(uint32_t source, uint32_t bit);
    void dropSource(uint32_t source);
    void clear();
    scene::PadWords frame();
private:
    uint32_t held() const;
    std::map<uint32_t, uint32_t> m_held;
    uint32_t m_previous = 0, m_pressed = 0, m_released = 0;
};

struct Bindings {
    std::map<SDL_Scancode, PadButton> keys;
    std::map<SDL_GamepadButton, PadButton> buttons;
    static Bindings defaults();
    void bindKey(SDL_Scancode key, PadButton button);
    void bindButton(SDL_GamepadButton pad, PadButton button);
};

void feed(PadReader& reader, const Bindings& bindings, const SDL_Event& event);
}
