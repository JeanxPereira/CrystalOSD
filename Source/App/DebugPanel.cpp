#include "App/DebugPanel.hpp"

#include <imgui.h>

namespace app {

void drawPanel(PanelState& state, const PanelInfo& info) {
    ImGui::SetNextWindowPos(ImVec2(12, 12), ImGuiCond_FirstUseEver);
    ImGui::SetNextWindowBgAlpha(0.85f);
    ImGui::Begin("CrystalOSD", nullptr, ImGuiWindowFlags_AlwaysAutoResize);
    ImGui::Text("%s", info.clock.c_str());
    ImGui::Text("output %ux%u, %.1f fps, logic frame %llu", info.outputWidth, info.outputHeight, info.framesPerSecond, static_cast<unsigned long long>(info.logicFrames));
    ImGui::Text("validation errors: %u", info.validationErrors);
    if (!info.phase.empty()) ImGui::Text("chain phase: %s", info.phase.c_str());
    if (!info.lastError.empty()) ImGui::TextColored(ImVec4(1.0f, 0.3f, 0.3f, 1.0f), "last error: %s", info.lastError.c_str());
    if (!info.screen.empty()) {
        ImGui::Text("pad held %04x pressed %04x", info.pad.held, info.pad.pressed);
        ImGui::Text("screen: %s", info.screen.c_str());
        ImGui::Text("module counter %d, stage %d, camera z %.2f", info.counter, info.stage, info.cameraZ);
        ImGui::Text("hand-off: %s", info.handOff.empty() ? "pending" : info.handOff.c_str());
        ImGui::Text("sound events of the last frame: %zu", info.sounds);
        if (ImGui::Button("Restart opening")) state.restartOpening = true;
        ImGui::SameLine();
        if (ImGui::Button("Skip opening")) state.skipOpening = true;
    }
    ImGui::Separator();

    static const char* resolutions[] = {"640x448 (native)", "window", "x2", "x4"};
    int resolution = static_cast<int>(state.resolution);
    if (ImGui::Combo("resolution", &resolution, resolutions, 4)) state.resolution = static_cast<Resolution>(resolution);
    static const uint32_t counts[] = {1, 2, 4, 8};
    static const char* msaa[] = {"off", "2x", "4x", "8x"};
    int chosen = 0;
    for (int i = 0; i < 4; ++i)
        if (counts[i] == state.samples) chosen = i;
    if (ImGui::BeginCombo("MSAA", msaa[chosen])) {
        for (int i = 0; i < 4; ++i) {
            if (!(info.sampleCounts & counts[i])) continue;
            if (ImGui::Selectable(msaa[i], i == chosen)) state.samples = counts[i];
        }
        ImGui::EndCombo();
    }
    static const char* targets[] = {"display", "refraction source", "work"};
    int shown = static_cast<int>(state.shown);
    if (ImGui::Combo("show", &shown, targets, 3)) state.shown = static_cast<scene::TargetName>(shown);
    ImGui::Checkbox("4:3 picture", &state.tvAspect);
    ImGui::Separator();

    ImGui::Checkbox("pause", &state.paused);
    ImGui::SameLine();
    ImGui::BeginDisabled(!state.paused);
    if (ImGui::Button("step")) state.step = true;
    ImGui::EndDisabled();
    ImGui::SetNextItemWidth(120);
    ImGui::InputInt3("h m s", state.time);
    if (ImGui::Button("set time")) state.setTime = true;
    ImGui::SameLine();
    if (ImGui::Button("local time")) state.localTime = true;
    ImGui::Separator();

    if (info.audioAvailable) {
        ImGui::Checkbox("mute", &state.mute);
        ImGui::SetNextItemWidth(160);
        ImGui::SliderFloat("volume", &state.volume, 0.0f, 1.0f, "%.2f");
        ImGui::Text("audio: %s", info.audio.c_str());
    } else {
        ImGui::Text("audio: off");
    }
    ImGui::Separator();

    if (ImGui::Button("screenshot")) state.screenshot = true;
    if (!info.lastScreenshot.empty()) ImGui::TextWrapped("%s", info.lastScreenshot.c_str());
    ImGui::End();
}

}  // namespace app
