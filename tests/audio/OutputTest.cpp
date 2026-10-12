#include <cstdio>

#include <SDL3/SDL.h>

#include "../Check.hpp"
#include "Audio/Output.hpp"

namespace {

void useDriver(const char* name) { SDL_SetHintWithPriority(SDL_HINT_AUDIO_DRIVER, name, SDL_HINT_OVERRIDE); }

}

int main() {
    useDriver("dummy");
    int calls = 0;
    {
        audio::Output out([&](int16_t*, size_t) { ++calls; }, true);
        CHECK(out.available());
        CHECK(out.muted());
        CHECK(!out.open());
        out.setMuted(true);
        CHECK(out.muted());
        CHECK(!out.open());
    }
    CHECK(calls == 0);
    useDriver("does-not-exist");
    audio::Output missing([](int16_t*, size_t) {}, true);
    CHECK(!missing.available());
    CHECK(missing.muted());
    CHECK(!missing.open());
    missing.setMuted(true);
    std::printf("output: dummy device available, muted and never opened, a missing device is survived\n");
    return 0;
}
