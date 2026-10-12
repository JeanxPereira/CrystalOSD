#include "Audio/Output.hpp"

#include <algorithm>
#include <string>
#include <vector>

#include <SDL3/SDL.h>

namespace audio {
namespace {

constexpr int kRate = 48000;

void SDLCALL pull(void* user, SDL_AudioStream* stream, int additional, int) {
    static_cast<Output*>(user)->feed(stream, additional);
}

bool requestedDriverLoaded() {
    const char* wanted = SDL_GetHint(SDL_HINT_AUDIO_DRIVER);
    const char* current = SDL_GetCurrentAudioDriver();
    if (wanted == nullptr || *wanted == 0) return true;
    if (current == nullptr) return false;
    const std::string list = wanted;
    for (size_t at = 0; at <= list.size();) {
        const size_t comma = std::min(list.find(',', at), list.size());
        if (list.compare(at, comma - at, current) == 0) return true;
        at = comma + 1;
    }
    return false;
}

}

Output::Output(std::function<void(int16_t*, size_t)> fill, bool muted) : m_fill(std::move(fill)), m_muted(true) {
    if (!SDL_InitSubSystem(SDL_INIT_AUDIO)) return;
    if (!requestedDriverLoaded()) {
        SDL_QuitSubSystem(SDL_INIT_AUDIO);
        return;
    }
    int count = 0;
    SDL_AudioDeviceID* devices = SDL_GetAudioPlaybackDevices(&count);
    m_available = devices != nullptr && count > 0;
    SDL_free(devices);
    if (!m_available) {
        SDL_QuitSubSystem(SDL_INIT_AUDIO);
        return;
    }
    if (!muted) setMuted(false);
}

Output::~Output() {
    closeDevice();
    if (m_available) SDL_QuitSubSystem(SDL_INIT_AUDIO);
}

void Output::setMuted(bool muted) {
    std::lock_guard lock(m_lock);
    if (muted) {
        m_muted = true;
        closeDevice();
        return;
    }
    if (!m_available) return;
    if (m_stream == nullptr) openDevice();
    m_muted = m_stream == nullptr;
}

void Output::openDevice() {
    const SDL_AudioSpec spec{SDL_AUDIO_S16, 2, kRate};
    m_stream = SDL_OpenAudioDeviceStream(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, &spec, pull, this);
    if (m_stream != nullptr) SDL_ResumeAudioStreamDevice(m_stream);
}

void Output::closeDevice() {
    if (m_stream == nullptr) return;
    SDL_DestroyAudioStream(m_stream);
    m_stream = nullptr;
}

void Output::feed(SDL_AudioStream* stream, int additional) {
    if (additional <= 0) return;
    std::vector<int16_t> chunk(size_t(additional) / 2, 0);
    if (!m_muted.load() && m_fill) m_fill(chunk.data(), chunk.size() / 2);
    SDL_PutAudioStreamData(stream, chunk.data(), int(chunk.size() * 2));
}

}
