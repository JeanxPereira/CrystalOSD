#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "Scene/Clock.hpp"

struct FieldDiff {
    std::string piece, leaf;
    uint32_t got = 0, want = 0;
};

struct Exempt {
    std::string piece, leaf, reason;
};
using ExemptList = std::vector<Exempt>;

struct StartLeaf {
    std::string piece, leaf;
    uint32_t bits = 0;
};

std::vector<StartLeaf> startLeaves(const scene::ClockInputs& inputs);
std::vector<FieldDiff> compareStart(const scene::ClockInputs& got, const nlohmann::json& input, const ExemptList& exempt, std::vector<Exempt>* staleExemptions = nullptr);
