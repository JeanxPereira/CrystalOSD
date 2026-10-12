#pragma once
#include <vulkan/vulkan.h>
#include <vk_mem_alloc.h>
#include <array>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <map>
#include <span>
#include <tuple>
#include <vector>

#include "Render/Device.hpp"
#include "Scene/Font.hpp"
#include "Scene/Frame.hpp"
#include "Scene/Text.hpp"

namespace render {

// The resolution the frame is drawn at (its scale is height / 448: the NTSC frame of two 224-line fields)
// and the MSAA sample count, which replaces the OSD's edge antialiasing.
struct NativeOutput {
    uint32_t width = 640, height = 448;
    uint32_t samples = 1;
    bool operator==(const NativeOutput&) const = default;
};

struct GpuVertex {
    float x, y, z;
    float u, v, q;
    uint8_t r, g, b, a;
};

// Draws a scene::Frame with an ordinary graphics pipeline: float blending, no GS rules.
// Units (scene/Frame.hpp): colour bytes, alpha 0x80 = 1.0. Targets store alpha / 128, so a target read back
// or sampled gives the alpha byte the OSD would have; readTarget converts at that boundary.
class NativeRenderer {
public:
    NativeRenderer(Device& device, const std::filesystem::path& shaderDirectory);
    ~NativeRenderer();
    NativeRenderer(const NativeRenderer&) = delete;
    NativeRenderer& operator=(const NativeRenderer&) = delete;

    void setTexture(int32_t number, uint32_t width, uint32_t height, std::span<const uint8_t> rgba);
    void setTexture(scene::TextureSet set, int32_t number, uint32_t width, uint32_t height, std::span<const uint8_t> rgba);
    // The opening's textures (References/textures/opening, written by References/scripts/extract_opening_textures.mjs):
    // tex<number>-<width>x<height>.png, RGBA8 with TEXA's alpha, drawn by frames of scene::TextureSet::Opening.
    void loadOpeningTextures(const std::filesystem::path& directory);
    // The ten clock textures (References/textures, written by References/scripts/extract_textures.mjs and
    // checked against the ROM by extract_rom_textures.mjs), texture n at its 640 x 224 address.
    void loadClockTextures(const std::filesystem::path& directory);
    // The glyph cache (scene::kGlyphTexture) a frame's text samples; made again only when its cells change.
    void setGlyphCache(const scene::Font& font, const scene::GlyphCache& cache);

    void configure(const NativeOutput& output);
    const NativeOutput& output() const { return m_output; }

    void record(VkCommandBuffer cmd, const scene::Frame& frame);
    void draw(const scene::Frame& frame);
    std::vector<uint8_t> readTarget(scene::TargetName target);
    // `image` is in COLOR_ATTACHMENT_OPTIMAL and is left so; the target is fitted in `extent` at `aspect`
    // (width / height of the shown picture) with black around it.
    void present(VkCommandBuffer cmd, VkImage image, VkExtent2D extent, scene::TargetName shown, float aspect);

    // The largest alpha byte a pass writes (its As): 0x80 with edge smoothing, else the vertex alpha times, when
    // textured, the texture's largest alpha / 128 or the source target's bound / 128 (0x7f when colour only).
    // Each target's bound is the largest alpha drawn into it since configure().
    uint32_t writtenAlpha(const scene::Pass& pass, scene::TextureSet set = scene::TextureSet::Clock) const;
    // The largest blend factor of a pass, in bytes: 0 when opaque, the constant for the fixed modes, the target's
    // bound for AddDestinationAlpha, else As.
    uint32_t blendAlpha(const scene::Pass& pass, scene::TextureSet set = scene::TextureSet::Clock) const;

private:
    struct Image {
        VkImage image{VK_NULL_HANDLE};
        VkImageView view{VK_NULL_HANDLE};
        VmaAllocation allocation{VK_NULL_HANDLE};
        VkFormat format{VK_FORMAT_UNDEFINED};
        VkImageAspectFlags aspect{VK_IMAGE_ASPECT_COLOR_BIT};
        uint32_t width{0}, height{0};
        VkImageLayout layout{VK_IMAGE_LAYOUT_UNDEFINED};
        VkPipelineStageFlags2 stage{VK_PIPELINE_STAGE_2_NONE};
        VkAccessFlags2 access{0};
    };
    struct Target {
        Image resolved;
        Image multisampled;
    };
    struct Buffer {
        VkBuffer buffer{VK_NULL_HANDLE};
        VmaAllocation allocation{VK_NULL_HANDLE};
        void* mapped{nullptr};
        VkDeviceSize size{0};
    };
    struct Texture {
        Image image;
        uint8_t largestAlpha{0};
    };
    using PipelineKey = std::tuple<int, int, bool, uint32_t>;
    using TextureKey = std::pair<int32_t, int32_t>;
    static constexpr size_t kTargets = 5;

    Image createImage(uint32_t width, uint32_t height, VkFormat format, VkImageUsageFlags usage, VkSampleCountFlagBits samples, VkImageAspectFlags aspect);
    void destroyImage(Image& image);
    Buffer createBuffer(VkDeviceSize size, VkBufferUsageFlags usage);
    void destroyBuffer(Buffer& buffer);
    void destroyTargets();
    void submit(const std::function<void(VkCommandBuffer)>& record);
    void transition(VkCommandBuffer cmd, Image& image, VkImageLayout layout, VkPipelineStageFlags2 stage, VkAccessFlags2 access);
    VkPipeline pipeline(const scene::Pass& pass, scene::BlendOp blend);
    void createTarget(Target& target);
    void ensureTargets(VkCommandBuffer cmd, const scene::Frame& frame);
    Target& target(scene::TargetName name) { return m_targets[static_cast<size_t>(name)]; }
    void beginRendering(VkCommandBuffer cmd, Target& target);
    uint32_t writtenAlphaWith(const scene::Pass& pass, scene::TextureSet set, const std::array<uint32_t, kTargets>& bounds) const;
    void checkAlpha(const scene::Frame& frame);

    Device& m_device;
    VkShaderModule m_vertex{VK_NULL_HANDLE}, m_fragment{VK_NULL_HANDLE};
    VkDescriptorSetLayout m_setLayout{VK_NULL_HANDLE};
    VkPipelineLayout m_layout{VK_NULL_HANDLE};
    std::array<VkSampler, 4> m_samplers{};
    std::map<PipelineKey, VkPipeline> m_pipelines;
    VkCommandPool m_pool{VK_NULL_HANDLE};
    VkCommandBuffer m_commands{VK_NULL_HANDLE};
    std::map<TextureKey, Texture> m_textures;
    Image m_blank;
    std::array<Target, kTargets> m_targets{};
    std::array<uint32_t, kTargets> m_alphaBound{};
    Image m_depth;
    NativeOutput m_output{0, 0, 0};
    std::array<Buffer, 3> m_vertices{};
    uint32_t m_slot{0};
    std::vector<GpuVertex> m_staging;
    std::vector<std::pair<uint32_t, uint32_t>> m_ranges;
    scene::GlyphCache m_glyphs;
};

}  // namespace render
