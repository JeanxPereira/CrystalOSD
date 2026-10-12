#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "Scene/MenuTypes.hpp"

namespace scene {

struct MenusOptions {
    bool browserEnters = true;
};

class Menus {
public:
    explicit Menus(MenusOptions options = {}) : m_options(options) {}
    static void menuStep(MenuWorld& world, const MenuExternals& ext);
    void step(MenuWorld& world, MenuExternals& ext, std::vector<std::string>& notes) const;
    static void between(MenuWorld& world, const MenuExternals& ext, std::vector<std::string>& notes);
    static void endOfFrame(MenuWorld& world, const MenuExternals& ext);
    static void setMode(MenuWorld& world, int32_t mode);
    static void versionOpen(MenusState& menus, std::vector<SoundCommand>* sounds = nullptr);
    static void versionStep(MenusState& menus, uint32_t pressed, std::vector<std::string>& notes, std::vector<SoundCommand>* sounds = nullptr);
    static void show(Ramp& ramp);
    static void hide(Ramp& ramp);
    const MenusOptions& options() const { return m_options; }

private:
    MenusOptions m_options;
};

}
