#pragma once
#include <initializer_list>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "Scene/Text.hpp"

namespace scenetest {

bool sameState(const scene::FontState& ours, const nlohmann::json& theirs, const std::string& at);
int compareStrings(const std::vector<scene::StringRun>& ours, const nlohmann::json& expect, std::initializer_list<const char*> parts, const std::string& at);
int compareCache(const scene::FontCache& ours, const nlohmann::json& theirs, const std::string& at);

}
