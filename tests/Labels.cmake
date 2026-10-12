set(CLOCK_AREA_RULES
    "audio|^Audio"
    "cold|^Cold|^HostInputsTest$"
    "assets|^Assets|^AssetFrameTest$|^AppMissingAssetsTest$"
    "opening|Opening|Tower|^TimelineTest$|^FogTest$|^LightsTest$|^FlatTest$|^HandoffTest$|^ClockEntryTest$|^Vu0Test$|^BootChainTest$|^PendingTowers"
    "menus|Menu|^ScreensTest$|^InputTest$|^CubesTest|^ParityEnter$|^ParityBack$"
    "render|^HeadlessTest$|^RendererTest$|^DeviceTest$|^NativeRendererTest$|^HeaderDepsTest$"
    "clock|^ArithmeticTest$|^ArithmeticSceneTest$|^HeadTest$|^OrbsTest$|^RodsTest$|^StateTest$|^TextTest$|^ClockParityTest$|^ClockScreenTest$|^ConsoleClockTest$|^ParityClock|^ParityConfig$|^ParityToClock$"
    "scripts|^Script"
    "parity|^Parity|^FixtureTest$|^CompareTest$|^ColdCompareTest$|^BudgetCause|^PendingTowers"
)
set(CLOCK_SLOW_TESTS
    ArithmeticSceneTest AssetsRobustTest AudioAppBoot AudioAppWav AudioClockSoundRender AudioLabRender-boot-modelled
    AudioLabRender-boot-oracle AudioLabRender-boot-paired AudioLabRender-boot-paired-init AudioLabRender-boot-paired-tick
    AudioLabRender-boot-render BudgetCauseOpening51 ClockParityTest ColdRunTest-clock
    ColdRunTest-menu ColdRunTest-square CubesTestSubset FlatTest
    FogTest HeadTest InputTest LightsTest
    MenuInputsTest MenuTextTest MenusAdjust MenusBack
    MenusBackPixels MenusBackText MenusConfig MenusDown
    MenusEnter MenusMenu MenusSquare MenusVersion MenusTest
    NativeRendererTest OpeningCarriedTowersTest OpeningCubesTest OpeningGateTest
    OpeningGateTowersTest OrbsTest ParityBack ParityClock
    ParityClockScene ParityConfig ParityEnter ParityMenu
    ParityOpening51 ParityToClock ParityTowers0 ParityTowers4
    ParityTowers7 RodsTest StateTest TimelineTest
    TowerVu1Test TowersWholeTest
)

function(clock_label_tests DIRECTORY)
    set(UNLABELLED "")
    get_property(TESTS DIRECTORY ${DIRECTORY} PROPERTY TESTS)
    set(SLOW ${CLOCK_SLOW_TESTS})
    set(SLOW_FIXTURES "")
    foreach(NAME ${TESTS})
        get_property(SETS TEST ${NAME} DIRECTORY ${DIRECTORY} PROPERTY FIXTURES_SETUP)
        if(NAME IN_LIST CLOCK_SLOW_TESTS AND SETS)
            list(APPEND SLOW_FIXTURES ${SETS})
        endif()
    endforeach()
    foreach(NAME ${TESTS})
        get_property(NEEDS TEST ${NAME} DIRECTORY ${DIRECTORY} PROPERTY FIXTURES_REQUIRED)
        foreach(FIXTURE ${NEEDS})
            if(FIXTURE IN_LIST SLOW_FIXTURES)
                list(APPEND SLOW ${NAME})
            endif()
        endforeach()
    endforeach()
    foreach(NAME ${TESTS})
        set(LABELS "")
        foreach(RULE ${CLOCK_AREA_RULES})
            string(FIND "${RULE}" "|" BAR)
            string(SUBSTRING "${RULE}" 0 ${BAR} AREA)
            math(EXPR START "${BAR} + 1")
            string(SUBSTRING "${RULE}" ${START} -1 PATTERN)
            if(NAME MATCHES "${PATTERN}")
                list(APPEND LABELS ${AREA})
            endif()
        endforeach()
        if(NOT LABELS)
            list(APPEND UNLABELLED ${NAME})
            continue()
        endif()
        if(NAME IN_LIST SLOW)
            list(APPEND LABELS slow)
        else()
            list(APPEND LABELS fast)
        endif()
        set_property(TEST ${NAME} DIRECTORY ${DIRECTORY} APPEND PROPERTY LABELS ${LABELS})
    endforeach()
    if(UNLABELLED)
        message(FATAL_ERROR "tests with no area rule in tests/Labels.cmake: ${UNLABELLED}")
    endif()
endfunction()

clock_label_tests(${CMAKE_CURRENT_SOURCE_DIR})
clock_label_tests(${CMAKE_CURRENT_SOURCE_DIR}/audio)
