#pragma once
#include "Assets/Resources.hpp"
#include "Render/NativeRenderer.hpp"
#include "Scene/Rods.hpp"

namespace app {

// The decoded assets handed to the scene and the renderer: the same data the PNG and JSON files give.
scene::RodMesh rodMeshOf(const assets::Asset& mesh);
// The ten clock textures, texture n at its place in assets::kClockTextures; throws when one is missing.
void uploadClockTextures(render::NativeRenderer& renderer, const assets::AssetSet& set);
// The opening's nine textures at their opening indices (assets::kOpeningTextures); throws when one is missing.
void uploadOpeningTextures(render::NativeRenderer& renderer, const assets::AssetSet& set);

}
