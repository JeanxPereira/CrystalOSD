#pragma once
#include <cstdint>
#include <string>

#include "Scene/Frame.hpp"
#include "Scene/MenuTypes.hpp"

namespace app {

enum class Resolution { Native, Window, Double, Quadruple };

// What the panel edits; the frame loop reads it and clears the one-shot requests.
struct PanelState {
    Resolution resolution = Resolution::Native;
    uint32_t samples = 1;
    bool paused = false;
    bool step = false;
    bool tvAspect = true;
    scene::TargetName shown = scene::TargetName::Display;
    int time[3] = {12, 0, 0};
    bool setTime = false;
    bool localTime = false;
    bool screenshot = false;
    bool restartOpening = false;
    bool skipOpening = false;
    bool mute = false;
    float volume = 1.0f;
};

// What the panel shows.
struct PanelInfo {
    uint32_t outputWidth = 0, outputHeight = 0;
    uint32_t sampleCounts = 1;
    uint64_t logicFrames = 0;
    float framesPerSecond = 0;
    uint32_t validationErrors = 0;
    std::string clock;
    std::string lastScreenshot;
    std::string screen, handOff, phase, lastError;
    int32_t counter = 0, stage = 0;
    float cameraZ = 0;
    size_t sounds = 0;
    bool audioAvailable = false;
    std::string audio;
    scene::PadWords pad;
};

void drawPanel(PanelState& state, const PanelInfo& info);

}  // namespace app
