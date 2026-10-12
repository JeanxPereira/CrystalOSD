#pragma once
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <mutex>

struct SDL_AudioStream;

namespace audio {

class Output {
public:
    explicit Output(std::function<void(int16_t*, size_t)> fill, bool muted = true);
    ~Output();
    Output(const Output&) = delete;
    Output& operator=(const Output&) = delete;

    bool available() const { return m_available; }
    bool open() const { return m_stream != nullptr; }
    void setMuted(bool muted);
    bool muted() const { return m_muted.load(); }
    void feed(SDL_AudioStream* stream, int additional);

private:
    void openDevice();
    void closeDevice();

    std::function<void(int16_t*, size_t)> m_fill;
    std::atomic<bool> m_muted;
    bool m_available = false;
    SDL_AudioStream* m_stream = nullptr;
    std::mutex m_lock;
};

}
