#include "App/OpeningScreen.hpp"

namespace app {

OpeningScreen::OpeningScreen(const scene::opening::BootOptions& options, std::shared_ptr<const scene::ProgramImage> program) : m_opening(options, std::move(program)) {}

void OpeningScreen::step() {
    m_frame = m_opening.frame(m_display, 0);
    m_display ^= 1;
}

}
