#include "App/ClockAssets.hpp"

#include <cstring>
#include <stdexcept>
#include <string>

#include "Assets/ClockTextures.hpp"

namespace app {

scene::RodMesh rodMeshOf(const assets::Asset& mesh) {
    if (mesh.kind != assets::AssetKind::Mesh || (mesh.width != 16 && mesh.width != 6) || mesh.data.size() != size_t(mesh.width) * 9 * 16) throw std::runtime_error("mesh: not 16 or 6 faces");
    scene::RodMesh out;
    size_t at = 0;
    const auto take = [&](std::vector<scene::Vec4>& list, size_t count) {
        list.resize(count);
        for (scene::Vec4& v : list) {
            std::memcpy(v.data(), mesh.data.data() + at, 16);
            at += 16;
        }
    };
    take(out.positions, size_t(mesh.width) * 4);
    take(out.normals, mesh.width);
    take(out.coordinates, size_t(mesh.width) * 4);
    return out;
}

void uploadClockTextures(render::NativeRenderer& renderer, const assets::AssetSet& set) {
    for (size_t n = 0; n < assets::kClockTextures.size(); ++n) {
        const assets::Asset* texture = set.find(assets::kClockTextures[n].name);
        const assets::ClockTextureInfo& info = assets::kClockTextures[n];
        if (!texture || texture->kind != assets::AssetKind::TextureRgba32) throw std::runtime_error("no clock texture " + std::string(info.name));
        if (texture->width != info.width || texture->height != info.height || texture->data.size() != size_t(info.width) * info.height * 4)
            throw std::runtime_error("clock texture " + std::string(info.name) + ": not " + std::to_string(info.width) + " x " + std::to_string(info.height));
        renderer.setTexture(int32_t(n), texture->width, texture->height, texture->data);
    }
}

void uploadOpeningTextures(render::NativeRenderer& renderer, const assets::AssetSet& set) {
    for (const assets::OpeningTextureInfo& info : assets::kOpeningTextures) {
        const assets::Asset* texture = set.find(info.name);
        if (!texture || texture->kind != assets::AssetKind::TextureRgba32) throw std::runtime_error("no opening texture " + std::string(info.name));
        if (texture->width != info.width || texture->height != info.height || texture->data.size() != size_t(info.width) * info.height * 4)
            throw std::runtime_error("opening texture " + std::string(info.name) + ": not " + std::to_string(info.width) + " x " + std::to_string(info.height));
        renderer.setTexture(scene::TextureSet::Opening, info.index, texture->width, texture->height, texture->data);
    }
}

}
