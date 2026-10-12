#pragma once
#include <array>
#include <cstdint>
#include <filesystem>
#include <vector>

#include "Scene/Matrix.hpp"

namespace scene {

using Colour = std::array<int32_t, 4>;

// The rod's mesh (facts/data/rod-mesh.json): each face a triangle strip of four vertices.
struct RodMesh {
    std::vector<Vec4> positions;
    std::vector<Vec4> normals;
    std::vector<Vec4> coordinates;
};
RodMesh loadRodMesh(const std::filesystem::path& file);

// The rod record (facts/clock-rod-draw.md, "The rod record").
struct RodRecord {
    int32_t number = 0;
    int32_t faces = 0;
    Mat4 local{};
    float sx = 0, sy = 0, sz = 0;
    Colour base{};
    float strength = 0;
    Colour textured{};
    std::array<float, 2> pair{};
    float refraction = 0;
    Colour reflection{};
    Colour extra{};
};

// What the rods read of the clock's state (facts/clock-state.md, facts/clock-scene.md).
struct RodLight {
    float appearance = 0;
    float progress = 0;
    Colour base{};
    Colour reflection{};
};
struct RodsInput {
    int32_t currentRod = 0;
    int32_t secondsAngle = 0;
    int32_t rodAngle = 0;
    std::array<RodLight, 12> rods{};
    Colour accent{};
    Colour fourth{};
    int32_t width = 640;
    int32_t height = 224;
    int32_t field = 0;
};

// One face through the transform (facts/clock-rod-draw.md, "Transform"). `fixed` is the
// screen position in the OSD's 4-bit fixed point (sceVu0FTOI4Vector).
struct RodFaceVertex {
    Vec4 eye{};
    Vec4 screen{};
    float q = 0, s = 0, t = 0;
    std::array<int32_t, 3> fixed{};
};
struct RodFace {
    int32_t index = 0;
    Vec4 normal{};
    std::array<RodFaceVertex, 4> vertices{};
    int32_t flag = 0;
};
struct RodTransform {
    float cx = 0, cy = 0, cz = 0;
    std::vector<RodFace> faces;
};

enum class RodPiece { Whole, A, B };

// Native units: x, y in pixels from the screen's top-left, z the depth (screen matrix units),
// colour with 1.0 = the OSD's 0x80. Texel sends: u, v in texels of the source, q = 1.
// Perspective sends: u, v, q are the S, T, Q the OSD computes (divide by q to sample).
struct RodVertex {
    float x = 0, y = 0, z = 0, u = 0, v = 0, q = 0;
    float r = 0, g = 0, b = 0, a = 0;
};
struct RodFaceDraw {
    int32_t face = 0;
    RodPiece piece = RodPiece::Whole;
    bool edgeSmoothing = false;
    std::array<RodVertex, 4> strip{};
};

// The five sends of a rod and the two of an extra pass (facts/clock-rod-draw.md, facts/clock-extra-passes.md).
enum class RodSendKind { RefractedFar, GrainSubtracted, GrainAdded, RefractedNearToFrame, RefractedNearToRefraction, Reflection, Grain };
inline bool perspective(RodSendKind kind) {
    return kind == RodSendKind::GrainSubtracted || kind == RodSendKind::GrainAdded || kind == RodSendKind::Grain;
}
struct RodSend {
    RodSendKind kind = RodSendKind::RefractedFar;
    std::vector<RodFaceDraw> faces;
};

struct RodPieceRecord {
    RodPiece piece = RodPiece::A;
    RodRecord record;
    RodTransform transform;
};

struct Rod {
    int32_t placement = 0;
    RodRecord record;
    float t = -1;
    float key = 0;
    Mat4 matrix{};
    bool drawn = false;
    RodTransform whole;
    float cx = 0, cy = 0;
    std::vector<RodPieceRecord> pieces;
    std::vector<RodSend> sends;
};

// One rod in an extra pass; `grainTexture` is the clock texture the grain samples (2 or 3).
struct RodExtraDraw {
    size_t rod = 0;
    bool split = false;
    int32_t grainTexture = 2;
    RodSend reflection;
    RodSend grain;
};

// The draw list (facts/clock-scene.md, "The draw list"): deepest first; a new node goes in
// front of the first one that is not deeper than it.
struct DepthNode {
    bool orb = false;
    int32_t index = 0;
    float key = 0;
};
inline void insertByDepth(std::vector<DepthNode>& list, const DepthNode& node) {
    size_t at = 0;
    while (at < list.size() && node.key < list[at].key) ++at;
    list.insert(list.begin() + static_cast<std::ptrdiff_t>(at), node);
}

struct RodsFrame {
    std::vector<DepthNode> list;
    std::vector<Rod> rods;
    std::array<std::vector<RodExtraDraw>, 2> extraPasses;
};

// The rods of a frame (References/model/clock_frame.mjs scene(), HDD OSD 1.10U). The rod
// template is state: it is written in place each frame and carried to the next.
template <class A>
class Rods {
public:
    Rods(RodMesh mesh, const RodRecord& rodTemplate);

    RodsFrame frame(const RodsInput& input, const Mat4& view, const Mat4& screen);

    const RodRecord& rodTemplate() const { return m_template; }
    RodRecord& rodTemplate() { return m_template; }

    static Mat4 rodMatrix(int32_t i, int32_t ring, int32_t spin);
    static RodTransform transform(const RodRecord& rod, const Mat4& view, const Mat4& screen, const RodMesh& mesh);
    static float edgeTerm(const RodFace& face);
    static float depthKey(const Mat4& view, const Mat4& local) { return Matrix<A>::apply(view, local[3])[2]; }

private:
    RodMesh m_mesh;
    RodRecord m_template;
};

}
