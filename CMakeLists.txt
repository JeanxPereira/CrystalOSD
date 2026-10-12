cmake_minimum_required(VERSION 4.2)
set(CMAKE_CXX_SCAN_FOR_MODULES OFF)
project(CrystalOSD VERSION 0.1.0 DESCRIPTION "The PS2 OSDSYS, native in C++ and Vulkan" LANGUAGES C CXX)

if(NOT CMAKE_CXX_COMPILER_ID STREQUAL "Clang" OR NOT CMAKE_CXX_COMPILER_FRONTEND_VARIANT STREQUAL "GNU")
    message(FATAL_ERROR "CrystalOSD builds with clang++ (got ${CMAKE_CXX_COMPILER_ID}, ${CMAKE_CXX_COMPILER_FRONTEND_VARIANT} front end); use a preset from CMakePresets.json")
endif()

set(CMAKE_CXX_STANDARD 26)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
add_compile_options(-ffp-contract=off)

add_compile_definitions(_MSVC_STL_HARDENING=1 $<$<CONFIG:Debug>:_ITERATOR_DEBUG_LEVEL=0>)
include(FetchContent)

option(CLOCK_BUILD_TESTS "Build the tests tree (tests/CMakeLists.txt, when present) instead of the app" OFF)
set(CLOCK_DEPS_DIR ${CMAKE_SOURCE_DIR}/build/_deps CACHE PATH "Dependency sources shared by the app and tests build trees")
if(CLOCK_BUILD_TESTS)
    set(CLOCK_BIN_DIR ${CMAKE_BINARY_DIR}/bin)
else()
    set(CLOCK_BIN_DIR ${CMAKE_SOURCE_DIR}/bin)
endif()

find_package(Git REQUIRED)
function(clock_fetch NAME REPOSITORY TAG)
    string(TOUPPER ${NAME} UPPER)
    set(DIR ${CLOCK_DEPS_DIR}/${NAME}-src)
    if(NOT EXISTS ${DIR}/.git)
        file(REMOVE_RECURSE ${DIR})
        execute_process(COMMAND ${GIT_EXECUTABLE} clone --quiet --depth 1 --branch ${TAG} ${REPOSITORY} ${DIR} RESULT_VARIABLE STATUS)
        if(NOT STATUS EQUAL 0)
            file(REMOVE_RECURSE ${DIR})
            message(FATAL_ERROR "clone of ${REPOSITORY} ${TAG} failed")
        endif()
    else()
        execute_process(COMMAND ${GIT_EXECUTABLE} -C ${DIR} rev-parse HEAD OUTPUT_VARIABLE CURRENT OUTPUT_STRIP_TRAILING_WHITESPACE)
        execute_process(COMMAND ${GIT_EXECUTABLE} -C ${DIR} rev-parse --verify --quiet ${TAG}^{commit} OUTPUT_VARIABLE WANTED OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
        if(WANTED STREQUAL "" OR NOT CURRENT STREQUAL WANTED)
            execute_process(COMMAND ${GIT_EXECUTABLE} -C ${DIR} fetch --quiet --depth 1 origin tag ${TAG} RESULT_VARIABLE FETCHED)
            execute_process(COMMAND ${GIT_EXECUTABLE} -C ${DIR} checkout --quiet ${TAG} RESULT_VARIABLE MOVED)
            if(NOT FETCHED EQUAL 0 OR NOT MOVED EQUAL 0)
                message(FATAL_ERROR "moving ${DIR} to ${TAG} failed")
            endif()
            message(STATUS "${NAME}: moved from ${CURRENT} to ${TAG}")
        endif()
    endif()
    set(FETCHCONTENT_SOURCE_DIR_${UPPER} ${DIR} CACHE PATH "" FORCE)
    FetchContent_Declare(${NAME} GIT_REPOSITORY ${REPOSITORY} GIT_TAG ${TAG})
    FetchContent_MakeAvailable(${NAME})
endfunction()

clock_fetch(SDL3 https://github.com/libsdl-org/SDL.git release-3.4.18)
clock_fetch(vma https://github.com/GPUOpen-LibrariesAndSDKs/VulkanMemoryAllocator.git v3.4.0)
clock_fetch(vk-bootstrap https://github.com/charles-lunarg/vk-bootstrap.git v1.4.350)
clock_fetch(glm https://github.com/g-truc/glm.git 1.0.3)
clock_fetch(json https://github.com/nlohmann/json.git v3.12.0)

if(NOT CLOCK_BUILD_TESTS)
set(IMGUI_DIR ${CMAKE_CURRENT_SOURCE_DIR}/ThirdParty/imgui)
add_library(ImGui STATIC
    ${IMGUI_DIR}/imgui.cpp
    ${IMGUI_DIR}/imgui_draw.cpp
    ${IMGUI_DIR}/imgui_tables.cpp
    ${IMGUI_DIR}/imgui_widgets.cpp
    ${IMGUI_DIR}/backends/imgui_impl_sdl3.cpp
    ${IMGUI_DIR}/backends/imgui_impl_vulkan.cpp
)
target_include_directories(ImGui PUBLIC
    ${IMGUI_DIR}
    ${IMGUI_DIR}/backends
)
endif()

find_program(GLSLC glslc HINTS "$ENV{VULKAN_SDK}/bin")
if(NOT GLSLC)
    message(FATAL_ERROR "glslc not found! Ensure Vulkan SDK is in PATH or VULKAN_SDK is set.")
endif()

set(SHADER_SRC_DIR ${CMAKE_CURRENT_SOURCE_DIR}/Shaders)
set(SHADER_OUT_DIR ${CLOCK_BIN_DIR}/shaders)
file(MAKE_DIRECTORY ${SHADER_OUT_DIR})

file(GLOB SHADER_SOURCES
    ${SHADER_SRC_DIR}/*.vert
    ${SHADER_SRC_DIR}/*.frag
    ${SHADER_SRC_DIR}/*.comp
)

set(SHADER_SPIRV_OUTPUTS "")
foreach(SHADER_SRC ${SHADER_SOURCES})
    get_filename_component(SHADER_NAME ${SHADER_SRC} NAME)
    set(SHADER_SPV ${SHADER_OUT_DIR}/${SHADER_NAME}.spv)

    add_custom_command(
        OUTPUT ${SHADER_SPV}
        COMMAND ${GLSLC} -o ${SHADER_SPV} ${SHADER_SRC}
        DEPENDS ${SHADER_SRC}
        COMMENT "Compiling shader: ${SHADER_NAME}"
        VERBATIM
    )
    list(APPEND SHADER_SPIRV_OUTPUTS ${SHADER_SPV})
endforeach()

add_custom_target(Shaders ALL DEPENDS ${SHADER_SPIRV_OUTPUTS})

find_package(Vulkan REQUIRED)
if(NOT CLOCK_BUILD_TESTS)
target_link_libraries(ImGui PRIVATE Vulkan::Vulkan SDL3::SDL3)
endif()

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CLOCK_BIN_DIR})
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_DEBUG ${CLOCK_BIN_DIR})
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CLOCK_BIN_DIR})

add_library(ClockVma STATIC Source/Core/VmaUsage.cpp)
target_link_libraries(ClockVma PUBLIC VulkanMemoryAllocator Vulkan::Vulkan)

add_library(ClockStb STATIC Source/Core/StbImage.cpp)
target_include_directories(ClockStb PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/ThirdParty)

add_library(ClockScene STATIC Source/Scene/Arithmetic.cpp Source/Scene/ClockState.cpp Source/Scene/Camera.cpp
    Source/Scene/FrameHead.cpp Source/Scene/Orbs.cpp Source/Scene/Rods.cpp Source/Scene/Clock.cpp Source/Scene/Font.cpp Source/Scene/ProgramImage.cpp Source/Scene/Text.cpp
    Source/Scene/ClockDate.cpp Source/Scene/ConsoleClock.cpp Source/Scene/Menus.cpp Source/Scene/Cubes.cpp)
target_include_directories(ClockScene PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(ClockScene PRIVATE nlohmann_json::nlohmann_json)
target_compile_options(ClockScene PRIVATE -ffp-model=strict -ffp-contract=off)

add_library(SceneInputs STATIC Source/Scene/SceneInputs.cpp)
target_include_directories(SceneInputs PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(SceneInputs PUBLIC nlohmann_json::nlohmann_json)

# The app's scene: the same sources with NativeArithmetic only. EeArithmetic's functions are defined in
# Arithmetic.cpp alone, which this library leaves out, so any use of them in the app fails to link.
add_library(ClockSceneNative STATIC Source/Scene/ClockState.cpp Source/Scene/Camera.cpp Source/Scene/FrameHead.cpp Source/Scene/Orbs.cpp Source/Scene/Rods.cpp Source/Scene/Clock.cpp
    Source/Scene/Font.cpp Source/Scene/ProgramImage.cpp Source/Scene/Text.cpp Source/Scene/ClockDate.cpp Source/Scene/ConsoleClock.cpp Source/Scene/Menus.cpp Source/Scene/Cubes.cpp)
target_include_directories(ClockSceneNative PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_compile_definitions(ClockSceneNative PRIVATE SCENE_NATIVE_ONLY)
target_link_libraries(ClockSceneNative PRIVATE nlohmann_json::nlohmann_json)
target_sources(ClockScene PRIVATE Source/Scene/ColdRamps.cpp)
target_sources(ClockScene PRIVATE Source/Scene/ColdTime.cpp)
target_sources(ClockScene PRIVATE Source/Scene/ColdCamera.cpp)
target_sources(ClockScene PRIVATE Source/Scene/ColdFont.cpp)
target_sources(ClockScene PRIVATE Source/Scene/ColdState.cpp)
target_sources(ClockScene PRIVATE Source/Scene/ColdConfig.cpp)
target_sources(ClockScene PRIVATE Source/Scene/ColdStart.cpp)
target_sources(ClockSceneNative PRIVATE Source/Scene/ColdRamps.cpp)
target_sources(ClockSceneNative PRIVATE Source/Scene/ColdTime.cpp)
target_sources(ClockSceneNative PRIVATE Source/Scene/ColdCamera.cpp)
target_sources(ClockSceneNative PRIVATE Source/Scene/ColdFont.cpp)
target_sources(ClockSceneNative PRIVATE Source/Scene/ColdState.cpp)
target_sources(ClockSceneNative PRIVATE Source/Scene/ColdConfig.cpp)
target_sources(ClockSceneNative PRIVATE Source/Scene/ColdStart.cpp)

add_library(ClockRender STATIC Source/Render/Device.cpp Source/Render/NativeRenderer.cpp)
add_dependencies(ClockRender Shaders)
target_include_directories(ClockRender PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(ClockRender PUBLIC ClockVma ClockStb vk-bootstrap VulkanMemoryAllocator Vulkan::Vulkan SDL3::SDL3 ClockSceneNative)

# The clock's assets from the console's own resource files (Source/Assets: no Vulkan), and their decoded cache.
add_library(ClockAssets STATIC Source/Assets/Bytes.cpp Source/Assets/Expand.cpp Source/Assets/Romdir.cpp Source/Assets/ElfImage.cpp Source/Assets/ImageCipher.cpp
    Source/Assets/ClockTextures.cpp Source/Assets/Resources.cpp Source/Assets/Program.cpp)
target_include_directories(ClockAssets PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)

include(cmake/Audio.cmake)

add_library(ClockInput STATIC Source/App/Input.cpp Source/App/Screens.cpp)
add_library(HostInputs STATIC Source/App/HostInputs.cpp Source/App/SettingsStore.cpp)
target_include_directories(HostInputs PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(HostInputs PUBLIC nlohmann_json::nlohmann_json)
target_include_directories(ClockInput PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(ClockInput PUBLIC SDL3::SDL3 ClockScene)

add_library(ClockScreen STATIC Source/App/ClockScreen.cpp)
target_include_directories(ClockScreen PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_link_libraries(ClockScreen PUBLIC ClockSceneNative)

# The app's opening: the same sources with NativeArithmetic only, linked into CrystalOSD.
add_library(OpeningSceneNative STATIC Source/Scene/opening/Timeline.cpp Source/Scene/opening/Cubes.cpp Source/Scene/opening/Fog.cpp Source/Scene/opening/Lights.cpp Source/Scene/opening/Flat.cpp
    Source/Scene/opening/Handoff.cpp Source/Scene/opening/Opening.cpp Source/Scene/opening/Towers.cpp Source/Scene/opening/TowerVu1.cpp)
target_include_directories(OpeningSceneNative PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/Source)
target_compile_definitions(OpeningSceneNative PRIVATE SCENE_NATIVE_ONLY)
target_link_libraries(OpeningSceneNative PUBLIC ClockSceneNative)
target_compile_options(OpeningSceneNative PRIVATE -ffp-model=strict -ffp-contract=off)

add_library(BootScreens STATIC Source/App/OpeningScreen.cpp Source/App/BootChain.cpp)
target_link_libraries(BootScreens PUBLIC OpeningSceneNative ClockScreen)

if(NOT CLOCK_BUILD_TESTS)
add_executable(CrystalOSD Source/App/Main.cpp Source/App/Golden.cpp Source/App/GoldenScenario.cpp Source/App/DebugPanel.cpp Source/App/Png.cpp Source/App/Profile.cpp Source/App/ClockAssets.cpp)
target_link_libraries(CrystalOSD PRIVATE ClockRender ClockSceneNative ImGui ClockAssets ClockInput BootScreens HostInputs ClockAudioLive)
target_compile_definitions(CrystalOSD PRIVATE
    CLOCK_SHADERS="${CLOCK_BIN_DIR}/shaders" CLOCK_SCREENSHOTS="${CMAKE_SOURCE_DIR}/out/screenshots")
add_custom_command(TARGET CrystalOSD POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory_if_different ${CMAKE_SOURCE_DIR}/Resources ${CLOCK_BIN_DIR}/resources)
endif()

if(CLOCK_BUILD_TESTS AND EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/tests/CMakeLists.txt)
    enable_testing()
    add_subdirectory(tests)
endif()
