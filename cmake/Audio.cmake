add_library(ClockAudioCore STATIC Source/Audio/SpuWrite.cpp Source/Audio/EeSoundQueue.cpp)
target_include_directories(ClockAudioCore PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)

add_library(ClockAudioData STATIC Source/Audio/data/SndImage.cpp Source/Audio/data/HdBank.cpp Source/Audio/data/SqSequence.cpp)
target_include_directories(ClockAudioData PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(ClockAudioData PUBLIC ClockAudioCore ClockAssets)

add_library(ClockAudioDriver STATIC
    Source/Audio/driver/Driver.cpp Source/Audio/driver/Sequencer.cpp Source/Audio/driver/Ramp.cpp Source/Audio/driver/Init.cpp Source/Audio/driver/Effects.cpp Source/Audio/driver/Libsd.cpp
    Source/Audio/driver/Memory.cpp Source/Audio/driver/Registers.cpp Source/Audio/driver/IopClock.cpp)
target_include_directories(ClockAudioDriver PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(ClockAudioDriver PUBLIC ClockAudioCore ClockAssets)

add_library(ClockAudioSnapshot STATIC Source/Audio/driver/SnapshotBuilder.cpp)
target_include_directories(ClockAudioSnapshot PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(ClockAudioSnapshot PUBLIC ClockAudioDriver ClockAudioData ClockAssets)

add_library(ClockAudioSpu2 STATIC Source/Audio/spu2/Spu2.cpp Source/Audio/spu2/Restore.cpp Source/Audio/spu2/Snapshot.cpp Source/Audio/spu2/Envelope.cpp Source/Audio/spu2/Adpcm.cpp
    Source/Audio/spu2/Gauss.cpp Source/Audio/spu2/Mixer.cpp Source/Audio/spu2/Reverb.cpp)
target_include_directories(ClockAudioSpu2 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(ClockAudioSpu2 PUBLIC ClockAudioCore ClockAssets nlohmann_json::nlohmann_json)

add_library(ClockAudioFacade STATIC Source/Audio/ClockSound.cpp)
target_include_directories(ClockAudioFacade PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(ClockAudioFacade PUBLIC ClockAudioSnapshot ClockAudioDriver ClockAudioSpu2 ClockAudioCore ClockAssets)

add_library(ClockAudioLive STATIC Source/Audio/Output.cpp Source/Audio/LiveAudio.cpp)
target_include_directories(ClockAudioLive PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(ClockAudioLive PUBLIC SDL3::SDL3 ClockAudioFacade)

add_library(ClockAudio INTERFACE)
target_include_directories(ClockAudio INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(ClockAudio INTERFACE ClockAudioCore ClockAudioData ClockAudioDriver ClockAudioSnapshot ClockAudioSpu2 ClockAudioFacade)

foreach(target ClockAudioSpu2 ClockAudioDriver)
    target_compile_options(${target} PRIVATE $<$<CONFIG:Debug>:-O2>)
endforeach()
