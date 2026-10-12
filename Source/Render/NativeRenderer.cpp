#include "Render/NativeRenderer.hpp"

#include <stb_image.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <stdexcept>
#include <string>

namespace render {

namespace {

constexpr VkFormat kColourFormat = VK_FORMAT_R8G8B8A8_UNORM;
constexpr VkFormat kDepthFormat = VK_FORMAT_D32_SFLOAT;

struct PushState {
    float scene[4];
    float source[4];
    float region[4];
    int32_t mode[4];
    int32_t shade[4];
    float extent[4];
};

void check(VkResult result, const char* what) {
    if (result != VK_SUCCESS) throw std::runtime_error(std::string(what) + ": " + std::to_string(result));
}

std::vector<char> readFile(const std::filesystem::path& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot read " + path.string());
    return std::vector<char>(std::istreambuf_iterator<char>(in), {});
}

void barrier(VkCommandBuffer cmd, VkImage image, VkImageAspectFlags aspect, VkImageLayout from, VkImageLayout to, VkPipelineStageFlags2 srcStage, VkAccessFlags2 srcAccess,
             VkPipelineStageFlags2 dstStage, VkAccessFlags2 dstAccess) {
    VkImageMemoryBarrier2 b{VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2};
    b.srcStageMask = srcStage;
    b.srcAccessMask = srcAccess;
    b.dstStageMask = dstStage;
    b.dstAccessMask = dstAccess;
    b.oldLayout = from;
    b.newLayout = to;
    b.srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
    b.dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
    b.image = image;
    b.subresourceRange = {aspect, 0, 1, 0, 1};
    VkDependencyInfo dependency{VK_STRUCTURE_TYPE_DEPENDENCY_INFO};
    dependency.imageMemoryBarrierCount = 1;
    dependency.pImageMemoryBarriers = &b;
    vkCmdPipelineBarrier2(cmd, &dependency);
}

VkPipelineColorBlendAttachmentState blendState(scene::BlendOp op) {
    VkPipelineColorBlendAttachmentState s{};
    s.colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT | VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;
    if (op == scene::BlendOp::Opaque) return s;
    // The destination's alpha becomes the source's, as on the GS (blending touches the colour only).
    s.blendEnable = VK_TRUE;
    s.srcAlphaBlendFactor = VK_BLEND_FACTOR_ONE;
    s.dstAlphaBlendFactor = VK_BLEND_FACTOR_ZERO;
    s.alphaBlendOp = VK_BLEND_OP_ADD;
    s.colorBlendOp = VK_BLEND_OP_ADD;
    switch (op) {
    case scene::BlendOp::Add:
        s.srcColorBlendFactor = VK_BLEND_FACTOR_ONE;
        s.dstColorBlendFactor = VK_BLEND_FACTOR_ONE;
        break;
    case scene::BlendOp::Subtract:
        s.srcColorBlendFactor = VK_BLEND_FACTOR_ONE;
        s.dstColorBlendFactor = VK_BLEND_FACTOR_ONE;
        s.colorBlendOp = VK_BLEND_OP_REVERSE_SUBTRACT;
        break;
    case scene::BlendOp::AlphaOver:
        s.srcColorBlendFactor = VK_BLEND_FACTOR_SRC_ALPHA;
        s.dstColorBlendFactor = VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA;
        break;
    case scene::BlendOp::FixedOver:
        s.srcColorBlendFactor = VK_BLEND_FACTOR_CONSTANT_ALPHA;
        s.dstColorBlendFactor = VK_BLEND_FACTOR_ONE_MINUS_CONSTANT_ALPHA;
        break;
    case scene::BlendOp::FixedAdd:
        s.srcColorBlendFactor = VK_BLEND_FACTOR_CONSTANT_ALPHA;
        s.dstColorBlendFactor = VK_BLEND_FACTOR_ONE;
        break;
    case scene::BlendOp::AddDestinationAlpha:
        s.srcColorBlendFactor = VK_BLEND_FACTOR_DST_ALPHA;
        s.dstColorBlendFactor = VK_BLEND_FACTOR_ONE;
        break;
    case scene::BlendOp::SubtractFixed:
        s.srcColorBlendFactor = VK_BLEND_FACTOR_CONSTANT_ALPHA;
        s.dstColorBlendFactor = VK_BLEND_FACTOR_ONE;
        s.colorBlendOp = VK_BLEND_OP_REVERSE_SUBTRACT;
        break;
    case scene::BlendOp::Opaque: break;
    }
    return s;
}

// Add and Subtract leave the shader as Cs * As: the attachment clamps a factor to 1, the shader does not,
// and the sum or difference then clamps as the GS's does (both terms are non-negative).
bool premultiplied(scene::BlendOp op) { return op == scene::BlendOp::Add || op == scene::BlendOp::Subtract; }

VkCompareOp compareOf(scene::DepthTest test) {
    switch (test) {
    case scene::DepthTest::Always: return VK_COMPARE_OP_ALWAYS;
    case scene::DepthTest::GreaterEqual: return VK_COMPARE_OP_GREATER_OR_EQUAL;
    case scene::DepthTest::Greater: return VK_COMPARE_OP_GREATER;
    }
    return VK_COMPARE_OP_ALWAYS;
}

// Scene vertices as the GPU draws them, all as triangles; z / 2^24 the depth. A sprite's two corners become two
// triangles. A line becomes the band the GS covers: one pixel across its minor axis (a row for an x-major line,
// a column for a y-major one), so consecutive segments of a strip meet edge to edge. Wide lines (square across
// the line) overlapped at the joints and covered two GS pixels across steep segments at the window's scale, and
// the trail's additive blend showed both as bright patches.
void appendVertices(std::vector<GpuVertex>& out, const scene::Pass& pass, int32_t depthBits) {
    const uint32_t depthMask = depthBits == 24 ? 0xffffffu : 0xffffffffu;
    const auto put = [&](const scene::Vertex& v, float x, float y, float u, float t, uint32_t z, float q) {
        out.push_back({x, y, static_cast<float>(z & depthMask) / 16777216.0f, u, t, q, v.r, v.g, v.b, v.a});
    };
    if (pass.topology == scene::PassTopology::Lines) {
        for (size_t i = 0; i + 1 < pass.vertices.size(); i += 2) {
            const scene::Vertex& a = pass.vertices[i];
            const scene::Vertex& b = pass.vertices[i + 1];
            const bool xMajor = std::fabs(b.x - a.x) >= std::fabs(b.y - a.y);
            const float ox = xMajor ? 0.0f : 0.5f, oy = xMajor ? 0.5f : 0.0f;
            put(a, a.x - ox, a.y - oy, a.u, a.v, a.z, a.q);
            put(a, a.x + ox, a.y + oy, a.u, a.v, a.z, a.q);
            put(b, b.x - ox, b.y - oy, b.u, b.v, b.z, b.q);
            put(a, a.x + ox, a.y + oy, a.u, a.v, a.z, a.q);
            put(b, b.x + ox, b.y + oy, b.u, b.v, b.z, b.q);
            put(b, b.x - ox, b.y - oy, b.u, b.v, b.z, b.q);
        }
        return;
    }
    if (pass.topology != scene::PassTopology::Sprites) {
        for (const scene::Vertex& v : pass.vertices) put(v, v.x, v.y, v.u, v.v, v.z, v.q);
        return;
    }
    for (size_t i = 0; i + 1 < pass.vertices.size(); i += 2) {
        const scene::Vertex& a = pass.vertices[i];
        const scene::Vertex& b = pass.vertices[i + 1];
        put(b, a.x, a.y, a.u, a.v, b.z, b.q);
        put(b, b.x, a.y, b.u, a.v, b.z, b.q);
        put(b, a.x, b.y, a.u, b.v, b.z, b.q);
        put(b, b.x, a.y, b.u, a.v, b.z, b.q);
        put(b, b.x, b.y, b.u, b.v, b.z, b.q);
        put(b, a.x, b.y, a.u, b.v, b.z, b.q);
    }
}

// The clock's textures at their 640 x 224 addresses (clock_frame.mjs stateWriters; parity/FromScene clockLayout):
// TEXCFLOW, TEXCKABE, TEXCBUMP, TEXCBINV, TEXCSMOK, TEXCREFA, TEXCNAVI, TEXCBLUR, TEXCSTSL, TEXCMARU.
constexpr float kTargetTextureWidth = 1024.0f, kTargetTextureHeight = 256.0f;
constexpr int32_t kClockSet = static_cast<int32_t>(scene::TextureSet::Clock);

constexpr const char* kClockTextures[10] = {
    "tbp-2bc0-64x64.png", "tbp-2c00-128x128.png", "tbp-2d00-64x64.png", "tbp-2d40-64x64.png", "tbp-2d80-64x64.png",
    "tbp-2dc0-64x64.png", "tbp-2e00-64x64.png", "tbp-2e40-64x64.png", "tbp-2e80-64x64.png", "tbp-2ec0-64x64.png",
};

}  // namespace

NativeRenderer::NativeRenderer(Device& device, const std::filesystem::path& shaderDirectory) : m_device(device) {
    const VkDevice d = m_device.device();
    const auto module = [&](const char* name) {
        const std::vector<char> code = readFile(shaderDirectory / name);
        VkShaderModuleCreateInfo info{VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO};
        info.codeSize = code.size();
        info.pCode = reinterpret_cast<const uint32_t*>(code.data());
        VkShaderModule m{VK_NULL_HANDLE};
        check(vkCreateShaderModule(d, &info, nullptr, &m), "shader module");
        return m;
    };
    m_vertex = module("Native.vert.spv");
    m_fragment = module("Native.frag.spv");

    VkDescriptorSetLayoutBinding binding{0, VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, 1, VK_SHADER_STAGE_FRAGMENT_BIT, nullptr};
    VkDescriptorSetLayoutCreateInfo set{VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO};
    set.flags = VK_DESCRIPTOR_SET_LAYOUT_CREATE_PUSH_DESCRIPTOR_BIT;
    set.bindingCount = 1;
    set.pBindings = &binding;
    check(vkCreateDescriptorSetLayout(d, &set, nullptr, &m_setLayout), "set layout");
    VkPushConstantRange push{VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT, 0, sizeof(PushState)};
    VkPipelineLayoutCreateInfo layout{VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO};
    layout.setLayoutCount = 1;
    layout.pSetLayouts = &m_setLayout;
    layout.pushConstantRangeCount = 1;
    layout.pPushConstantRanges = &push;
    check(vkCreatePipelineLayout(d, &layout, nullptr, &m_layout), "pipeline layout");

    for (size_t i = 0; i < m_samplers.size(); ++i) {
        VkSamplerCreateInfo s{VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO};
        s.magFilter = s.minFilter = i & 1 ? VK_FILTER_LINEAR : VK_FILTER_NEAREST;
        s.mipmapMode = VK_SAMPLER_MIPMAP_MODE_NEAREST;
        s.addressModeU = s.addressModeV = s.addressModeW = i & 2 ? VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE : VK_SAMPLER_ADDRESS_MODE_REPEAT;
        s.maxLod = 0.0f;
        check(vkCreateSampler(d, &s, nullptr, &m_samplers[i]), "sampler");
    }

    VkCommandPoolCreateInfo pool{VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO};
    pool.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
    pool.queueFamilyIndex = m_device.queueFamily();
    check(vkCreateCommandPool(d, &pool, nullptr, &m_pool), "command pool");
    VkCommandBufferAllocateInfo alloc{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO};
    alloc.commandPool = m_pool;
    alloc.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    alloc.commandBufferCount = 1;
    check(vkAllocateCommandBuffers(d, &alloc, &m_commands), "command buffer");

    m_blank = createImage(1, 1, kColourFormat, VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT, VK_SAMPLE_COUNT_1_BIT, VK_IMAGE_ASPECT_COLOR_BIT);
    submit([&](VkCommandBuffer cmd) {
        transition(cmd, m_blank, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_PIPELINE_STAGE_2_TRANSFER_BIT, VK_ACCESS_2_TRANSFER_WRITE_BIT);
        const VkClearColorValue white{{1.0f, 1.0f, 1.0f, 1.0f}};
        const VkImageSubresourceRange range{VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
        vkCmdClearColorImage(cmd, m_blank.image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, &white, 1, &range);
        transition(cmd, m_blank, VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL, VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT, VK_ACCESS_2_SHADER_SAMPLED_READ_BIT);
    });
}

NativeRenderer::~NativeRenderer() {
    const VkDevice d = m_device.device();
    vkDeviceWaitIdle(d);
    destroyTargets();
    for (Buffer& b : m_vertices) destroyBuffer(b);
    for (auto& [key, t] : m_textures) destroyImage(t.image);
    destroyImage(m_blank);
    for (auto& [key, p] : m_pipelines) vkDestroyPipeline(d, p, nullptr);
    for (VkSampler s : m_samplers) vkDestroySampler(d, s, nullptr);
    vkDestroyCommandPool(d, m_pool, nullptr);
    vkDestroyPipelineLayout(d, m_layout, nullptr);
    vkDestroyDescriptorSetLayout(d, m_setLayout, nullptr);
    vkDestroyShaderModule(d, m_vertex, nullptr);
    vkDestroyShaderModule(d, m_fragment, nullptr);
}

NativeRenderer::Image NativeRenderer::createImage(uint32_t width, uint32_t height, VkFormat format, VkImageUsageFlags usage, VkSampleCountFlagBits samples, VkImageAspectFlags aspect) {
    Image image;
    image.format = format;
    image.aspect = aspect;
    image.width = width;
    image.height = height;
    VkImageCreateInfo info{VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO};
    info.imageType = VK_IMAGE_TYPE_2D;
    info.format = format;
    info.extent = {width, height, 1};
    info.mipLevels = 1;
    info.arrayLayers = 1;
    info.samples = samples;
    info.tiling = VK_IMAGE_TILING_OPTIMAL;
    info.usage = usage;
    info.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    VmaAllocationCreateInfo alloc{};
    alloc.usage = VMA_MEMORY_USAGE_AUTO_PREFER_DEVICE;
    check(vmaCreateImage(m_device.allocator(), &info, &alloc, &image.image, &image.allocation, nullptr), "image");
    VkImageViewCreateInfo view{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO};
    view.image = image.image;
    view.viewType = VK_IMAGE_VIEW_TYPE_2D;
    view.format = format;
    view.subresourceRange = {aspect, 0, 1, 0, 1};
    check(vkCreateImageView(m_device.device(), &view, nullptr, &image.view), "image view");
    return image;
}

void NativeRenderer::destroyImage(Image& image) {
    if (image.view) vkDestroyImageView(m_device.device(), image.view, nullptr);
    if (image.image) vmaDestroyImage(m_device.allocator(), image.image, image.allocation);
    image = Image{};
}

NativeRenderer::Buffer NativeRenderer::createBuffer(VkDeviceSize size, VkBufferUsageFlags usage) {
    Buffer buffer;
    buffer.size = size;
    VkBufferCreateInfo info{VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO};
    info.size = size;
    info.usage = usage;
    VmaAllocationCreateInfo alloc{};
    alloc.usage = VMA_MEMORY_USAGE_AUTO;
    alloc.flags = VMA_ALLOCATION_CREATE_MAPPED_BIT |
                  (usage & VK_BUFFER_USAGE_TRANSFER_DST_BIT ? VMA_ALLOCATION_CREATE_HOST_ACCESS_RANDOM_BIT : VMA_ALLOCATION_CREATE_HOST_ACCESS_SEQUENTIAL_WRITE_BIT);
    VmaAllocationInfo result{};
    check(vmaCreateBuffer(m_device.allocator(), &info, &alloc, &buffer.buffer, &buffer.allocation, &result), "buffer");
    buffer.mapped = result.pMappedData;
    return buffer;
}

void NativeRenderer::destroyBuffer(Buffer& buffer) {
    if (buffer.buffer) vmaDestroyBuffer(m_device.allocator(), buffer.buffer, buffer.allocation);
    buffer = Buffer{};
}

void NativeRenderer::destroyTargets() {
    for (Target& t : m_targets) {
        destroyImage(t.resolved);
        destroyImage(t.multisampled);
    }
    destroyImage(m_depth);
}

void NativeRenderer::submit(const std::function<void(VkCommandBuffer)>& record) {
    check(vkResetCommandBuffer(m_commands, 0), "reset command buffer");
    VkCommandBufferBeginInfo begin{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO};
    begin.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    check(vkBeginCommandBuffer(m_commands, &begin), "begin command buffer");
    record(m_commands);
    check(vkEndCommandBuffer(m_commands), "end command buffer");
    VkCommandBufferSubmitInfo cmd{VK_STRUCTURE_TYPE_COMMAND_BUFFER_SUBMIT_INFO};
    cmd.commandBuffer = m_commands;
    VkSubmitInfo2 info{VK_STRUCTURE_TYPE_SUBMIT_INFO_2};
    info.commandBufferInfoCount = 1;
    info.pCommandBufferInfos = &cmd;
    m_device.verify(vkQueueSubmit2(m_device.queue(), 1, &info, VK_NULL_HANDLE), "submit");
    m_device.verify(vkQueueWaitIdle(m_device.queue()), "wait");
}

void NativeRenderer::transition(VkCommandBuffer cmd, Image& image, VkImageLayout layout, VkPipelineStageFlags2 stage, VkAccessFlags2 access) {
    barrier(cmd, image.image, image.aspect, image.layout, layout, image.stage, image.access, stage, access);
    image.layout = layout;
    image.stage = stage;
    image.access = access;
}

void NativeRenderer::setTexture(int32_t number, uint32_t width, uint32_t height, std::span<const uint8_t> rgba) {
    setTexture(scene::TextureSet::Clock, number, width, height, rgba);
}

void NativeRenderer::setTexture(scene::TextureSet set, int32_t number, uint32_t width, uint32_t height, std::span<const uint8_t> rgba) {
    const TextureKey key{static_cast<int32_t>(set), number};
    if (rgba.size() != size_t(width) * height * 4) throw std::runtime_error("texture " + std::to_string(number) + ": wrong size");
    vkDeviceWaitIdle(m_device.device());
    if (auto found = m_textures.find(key); found != m_textures.end()) {
        destroyImage(found->second.image);
        m_textures.erase(found);
    }
    Texture texture;
    texture.image = createImage(width, height, kColourFormat, VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT, VK_SAMPLE_COUNT_1_BIT, VK_IMAGE_ASPECT_COLOR_BIT);
    for (size_t i = 3; i < rgba.size(); i += 4) texture.largestAlpha = std::max(texture.largestAlpha, rgba[i]);
    Buffer staging = createBuffer(rgba.size(), VK_BUFFER_USAGE_TRANSFER_SRC_BIT);
    std::memcpy(staging.mapped, rgba.data(), rgba.size());
    check(vmaFlushAllocation(m_device.allocator(), staging.allocation, 0, VK_WHOLE_SIZE), "flush");
    submit([&](VkCommandBuffer cmd) {
        transition(cmd, texture.image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_PIPELINE_STAGE_2_TRANSFER_BIT, VK_ACCESS_2_TRANSFER_WRITE_BIT);
        VkBufferImageCopy copy{};
        copy.imageSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
        copy.imageExtent = {width, height, 1};
        vkCmdCopyBufferToImage(cmd, staging.buffer, texture.image.image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, &copy);
        transition(cmd, texture.image, VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL, VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT, VK_ACCESS_2_SHADER_SAMPLED_READ_BIT);
    });
    destroyBuffer(staging);
    m_textures.emplace(key, texture);
}

// facts/text.md sections 1 and 2: 4-bit pictures through the block's colour table. The GS looks a texel's colour up
// before it filters, so the table is applied here, once, and the pass samples the colours.
void NativeRenderer::setGlyphCache(const scene::Font& font, const scene::GlyphCache& cache) {
    if (cache == m_glyphs && m_textures.contains({kClockSet, scene::kGlyphTexture})) return;
    const std::vector<uint8_t> image = scene::glyphCacheImage(font, cache);
    setTexture(scene::kGlyphTexture, 1u << cache.logWidth, 1u << cache.logHeight, image);
    m_glyphs = cache;
}

void NativeRenderer::loadClockTextures(const std::filesystem::path& directory) {
    for (int32_t n = 0; n < 10; ++n) {
        const std::string path = (directory / kClockTextures[n]).string();
        int w = 0, h = 0, channels = 0;
        stbi_uc* pixels = stbi_load(path.c_str(), &w, &h, &channels, 4);
        if (!pixels) throw std::runtime_error("cannot read the clock texture " + path);
        try {
            setTexture(n, uint32_t(w), uint32_t(h), std::span<const uint8_t>(pixels, size_t(w) * h * 4));
        } catch (...) {
            stbi_image_free(pixels);
            throw;
        }
        stbi_image_free(pixels);
    }
}

void NativeRenderer::loadOpeningTextures(const std::filesystem::path& directory) {
    size_t loaded = 0;
    for (const auto& entry : std::filesystem::directory_iterator(directory)) {
        const std::string name = entry.path().filename().string();
        int number = 0, width = 0, height = 0;
        if (std::sscanf(name.c_str(), "tex%d-%dx%d.png", &number, &width, &height) != 3 || entry.path().extension() != ".png") continue;
        int w = 0, h = 0, channels = 0;
        stbi_uc* pixels = stbi_load(entry.path().string().c_str(), &w, &h, &channels, 4);
        if (!pixels) throw std::runtime_error("cannot read the opening texture " + entry.path().string());
        try {
            if (w != width || h != height) throw std::runtime_error("the opening texture " + name + " is " + std::to_string(w) + "x" + std::to_string(h));
            setTexture(scene::TextureSet::Opening, number, uint32_t(w), uint32_t(h), std::span<const uint8_t>(pixels, size_t(w) * h * 4));
        } catch (...) {
            stbi_image_free(pixels);
            throw;
        }
        stbi_image_free(pixels);
        ++loaded;
    }
    if (loaded == 0) throw std::runtime_error("no opening textures in " + directory.string());
}

void NativeRenderer::configure(const NativeOutput& output) {
    if (output == m_output) return;
    if (output.width == 0 || output.height == 0) throw std::runtime_error("an empty output");
    if (!(m_device.sampleCounts() & output.samples)) throw std::runtime_error("MSAA " + std::to_string(output.samples) + "x is not supported");
    vkDeviceWaitIdle(m_device.device());
    destroyTargets();
    m_output = output;
    m_alphaBound = {};
    const auto samples = static_cast<VkSampleCountFlagBits>(output.samples);
    for (size_t i = 0; i <= static_cast<size_t>(scene::TargetName::Work); ++i) createTarget(m_targets[i]);
    m_depth = createImage(output.width, output.height, kDepthFormat, VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT, samples, VK_IMAGE_ASPECT_DEPTH_BIT);
    submit([&](VkCommandBuffer cmd) {
        const VkClearColorValue black{};
        const VkImageSubresourceRange colour{VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
        for (Target& t : m_targets)
            for (Image* image : {&t.resolved, &t.multisampled}) {
                if (!image->image) continue;
                transition(cmd, *image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_PIPELINE_STAGE_2_TRANSFER_BIT, VK_ACCESS_2_TRANSFER_WRITE_BIT);
                vkCmdClearColorImage(cmd, image->image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, &black, 1, &colour);
            }
        transition(cmd, m_depth, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_PIPELINE_STAGE_2_TRANSFER_BIT, VK_ACCESS_2_TRANSFER_WRITE_BIT);
        const VkClearDepthStencilValue zero{0.0f, 0};
        const VkImageSubresourceRange depth{VK_IMAGE_ASPECT_DEPTH_BIT, 0, 1, 0, 1};
        vkCmdClearDepthStencilImage(cmd, m_depth.image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, &zero, 1, &depth);
    });
}

void NativeRenderer::createTarget(Target& t) {
    t.resolved = createImage(m_output.width, m_output.height, kColourFormat,
                             VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT,
                             VK_SAMPLE_COUNT_1_BIT, VK_IMAGE_ASPECT_COLOR_BIT);
    if (m_output.samples > 1)
        t.multisampled = createImage(m_output.width, m_output.height, kColourFormat, VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT,
                                     static_cast<VkSampleCountFlagBits>(m_output.samples), VK_IMAGE_ASPECT_COLOR_BIT);
}

// The opening's Store and Extra targets exist only for frames that use them; the clock keeps its three.
void NativeRenderer::ensureTargets(VkCommandBuffer cmd, const scene::Frame& frame) {
    const VkClearColorValue black{};
    const VkImageSubresourceRange colour{VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
    const auto ensure = [&](scene::TargetName name) {
        Target& t = target(name);
        if (t.resolved.image) return;
        createTarget(t);
        for (Image* image : {&t.resolved, &t.multisampled}) {
            if (!image->image) continue;
            transition(cmd, *image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_PIPELINE_STAGE_2_TRANSFER_BIT, VK_ACCESS_2_TRANSFER_WRITE_BIT);
            vkCmdClearColorImage(cmd, image->image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, &black, 1, &colour);
        }
    };
    for (const scene::Pass& pass : frame.passes) {
        if (pass.vertices.empty()) continue;
        ensure(pass.target);
        if (pass.material.source == scene::SourceKind::Target) ensure(pass.material.sourceTarget);
    }
}

VkPipeline NativeRenderer::pipeline(const scene::Pass& pass, scene::BlendOp blendOp) {
    const scene::Material& m = pass.material;
    // AA1 writes no depth on an edge pixel, and every pixel of an AA1 line is an edge pixel (shaders/GsParity.frag).
    const bool depthWrite = m.depthWrite && !(pass.topology == scene::PassTopology::Lines && pass.edgeSmoothing);
    const PipelineKey key{static_cast<int>(blendOp), static_cast<int>(m.depthTest), depthWrite, m_output.samples};
    if (auto found = m_pipelines.find(key); found != m_pipelines.end()) return found->second;

    VkPipelineShaderStageCreateInfo stages[2]{};
    stages[0] = {VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO, nullptr, 0, VK_SHADER_STAGE_VERTEX_BIT, m_vertex, "main", nullptr};
    stages[1] = {VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO, nullptr, 0, VK_SHADER_STAGE_FRAGMENT_BIT, m_fragment, "main", nullptr};
    const VkVertexInputBindingDescription binding{0, sizeof(GpuVertex), VK_VERTEX_INPUT_RATE_VERTEX};
    const VkVertexInputAttributeDescription attributes[3] = {
        {0, 0, VK_FORMAT_R32G32B32_SFLOAT, offsetof(GpuVertex, x)},
        {1, 0, VK_FORMAT_R32G32B32_SFLOAT, offsetof(GpuVertex, u)},
        {2, 0, VK_FORMAT_R8G8B8A8_UINT, offsetof(GpuVertex, r)},
    };
    VkPipelineVertexInputStateCreateInfo input{VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO};
    input.vertexBindingDescriptionCount = 1;
    input.pVertexBindingDescriptions = &binding;
    input.vertexAttributeDescriptionCount = 3;
    input.pVertexAttributeDescriptions = attributes;
    VkPipelineInputAssemblyStateCreateInfo assembly{VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO};
    assembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    VkPipelineViewportStateCreateInfo viewport{VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO};
    viewport.viewportCount = 1;
    viewport.scissorCount = 1;
    VkPipelineRasterizationStateCreateInfo raster{VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO};
    raster.polygonMode = VK_POLYGON_MODE_FILL;
    raster.cullMode = VK_CULL_MODE_NONE;
    raster.frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE;
    raster.lineWidth = 1.0f;
    VkPipelineMultisampleStateCreateInfo multisample{VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO};
    multisample.rasterizationSamples = static_cast<VkSampleCountFlagBits>(m_output.samples);
    VkPipelineDepthStencilStateCreateInfo depth{VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO};
    depth.depthTestEnable = VK_TRUE;
    depth.depthWriteEnable = depthWrite ? VK_TRUE : VK_FALSE;
    depth.depthCompareOp = compareOf(m.depthTest);
    const VkPipelineColorBlendAttachmentState attachment = blendState(blendOp);
    VkPipelineColorBlendStateCreateInfo blend{VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO};
    blend.attachmentCount = 1;
    blend.pAttachments = &attachment;
    const VkDynamicState dynamics[] = {VK_DYNAMIC_STATE_VIEWPORT, VK_DYNAMIC_STATE_SCISSOR, VK_DYNAMIC_STATE_BLEND_CONSTANTS};
    VkPipelineDynamicStateCreateInfo dynamic{VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO};
    dynamic.dynamicStateCount = 3;
    dynamic.pDynamicStates = dynamics;
    VkPipelineRenderingCreateInfo rendering{VK_STRUCTURE_TYPE_PIPELINE_RENDERING_CREATE_INFO};
    rendering.colorAttachmentCount = 1;
    rendering.pColorAttachmentFormats = &kColourFormat;
    rendering.depthAttachmentFormat = kDepthFormat;
    VkGraphicsPipelineCreateInfo info{VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO};
    info.pNext = &rendering;
    info.stageCount = 2;
    info.pStages = stages;
    info.pVertexInputState = &input;
    info.pInputAssemblyState = &assembly;
    info.pViewportState = &viewport;
    info.pRasterizationState = &raster;
    info.pMultisampleState = &multisample;
    info.pDepthStencilState = &depth;
    info.pColorBlendState = &blend;
    info.pDynamicState = &dynamic;
    info.layout = m_layout;
    VkPipeline p{VK_NULL_HANDLE};
    check(vkCreateGraphicsPipelines(m_device.device(), VK_NULL_HANDLE, 1, &info, nullptr, &p), "pipeline");
    m_pipelines.emplace(key, p);
    return p;
}

void NativeRenderer::beginRendering(VkCommandBuffer cmd, Target& t) {
    const bool multisampled = t.multisampled.image != VK_NULL_HANDLE;
    const VkAccessFlags2 colourAccess = VK_ACCESS_2_COLOR_ATTACHMENT_READ_BIT | VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT;
    if (multisampled) transition(cmd, t.multisampled, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL, VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, colourAccess);
    transition(cmd, t.resolved, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL, VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, colourAccess);
    transition(cmd, m_depth, VK_IMAGE_LAYOUT_DEPTH_ATTACHMENT_OPTIMAL, VK_PIPELINE_STAGE_2_EARLY_FRAGMENT_TESTS_BIT | VK_PIPELINE_STAGE_2_LATE_FRAGMENT_TESTS_BIT,
               VK_ACCESS_2_DEPTH_STENCIL_ATTACHMENT_READ_BIT | VK_ACCESS_2_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT);

    VkRenderingAttachmentInfo colour{VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO};
    colour.imageView = multisampled ? t.multisampled.view : t.resolved.view;
    colour.imageLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;
    colour.loadOp = VK_ATTACHMENT_LOAD_OP_LOAD;
    colour.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
    if (multisampled) {
        colour.resolveMode = VK_RESOLVE_MODE_AVERAGE_BIT;
        colour.resolveImageView = t.resolved.view;
        colour.resolveImageLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;
    }
    VkRenderingAttachmentInfo depth{VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO};
    depth.imageView = m_depth.view;
    depth.imageLayout = VK_IMAGE_LAYOUT_DEPTH_ATTACHMENT_OPTIMAL;
    depth.loadOp = VK_ATTACHMENT_LOAD_OP_LOAD;
    depth.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
    VkRenderingInfo info{VK_STRUCTURE_TYPE_RENDERING_INFO};
    info.renderArea = {{0, 0}, {m_output.width, m_output.height}};
    info.layerCount = 1;
    info.colorAttachmentCount = 1;
    info.pColorAttachments = &colour;
    info.pDepthAttachment = &depth;
    vkCmdBeginRendering(cmd, &info);
    const VkViewport viewport{0.0f, 0.0f, float(m_output.width), float(m_output.height), 0.0f, 1.0f};
    const VkRect2D scissor{{0, 0}, {m_output.width, m_output.height}};
    vkCmdSetViewport(cmd, 0, 1, &viewport);
    vkCmdSetScissor(cmd, 0, 1, &scissor);
}

uint32_t NativeRenderer::writtenAlphaWith(const scene::Pass& pass, scene::TextureSet set, const std::array<uint32_t, kTargets>& bounds) const {
    if (pass.edgeSmoothing) return 0x80;
    const scene::Material& m = pass.material;
    uint32_t vertex = 0;
    for (const scene::Vertex& v : pass.vertices) vertex = std::max<uint32_t>(vertex, v.a);
    if (m.source == scene::SourceKind::Texture) {
        const auto found = m_textures.find({static_cast<int32_t>(set), m.texture});
        return found == m_textures.end() ? vertex : vertex * found->second.largestAlpha / 128;
    }
    if (m.source == scene::SourceKind::Target) return vertex * (m.colourOnly ? 0x7fu : bounds[static_cast<size_t>(m.sourceTarget)]) / 128;
    return vertex;
}

uint32_t NativeRenderer::writtenAlpha(const scene::Pass& pass, scene::TextureSet set) const { return writtenAlphaWith(pass, set, m_alphaBound); }

uint32_t NativeRenderer::blendAlpha(const scene::Pass& pass, scene::TextureSet set) const {
    switch (pass.material.blend) {
    case scene::BlendOp::Opaque: return 0;
    case scene::BlendOp::FixedOver:
    case scene::BlendOp::FixedAdd:
    case scene::BlendOp::SubtractFixed: return pass.material.blendConstant;
    case scene::BlendOp::AddDestinationAlpha: return m_alphaBound[static_cast<size_t>(pass.target)];
    default: return writtenAlpha(pass, set);
    }
}

// Targets store alpha / 128 in UNORM, so a byte above 0x80 would saturate. The frame's passes are walked first:
// each target's bound grows with what is written to it, and in Debug a frame that would write or multiply by more
// than 0x80 is refused before anything is recorded.
void NativeRenderer::checkAlpha(const scene::Frame& frame) {
    std::array<uint32_t, kTargets> bounds = m_alphaBound;
    for (const scene::Pass& pass : frame.passes) {
        if (pass.vertices.empty()) continue;
        if (pass.material.perPixelAlpha && pass.material.blend != scene::BlendOp::Opaque)
            throw std::logic_error("pass " + pass.name + ": per-pixel alpha with blending is not drawn (every opening pass that sets it has blending off)");
        const uint32_t written = writtenAlphaWith(pass, frame.textureSet, bounds);
        const scene::BlendOp blend = pass.material.blend;
        uint32_t factor = written;
        if (blend == scene::BlendOp::Opaque) factor = 0;
        else if (blend == scene::BlendOp::FixedOver || blend == scene::BlendOp::FixedAdd || blend == scene::BlendOp::SubtractFixed) factor = pass.material.blendConstant;
        else if (blend == scene::BlendOp::AddDestinationAlpha) factor = bounds[static_cast<size_t>(pass.target)];
#ifndef NDEBUG
        if (written > 0x80 || factor > 0x80) {
            char text[96];
            std::snprintf(text, sizeof text, " writes alpha 0x%x and blends by 0x%x, above 0x80", written, factor);
            throw std::logic_error("pass " + pass.name + text);
        }
#endif
        uint32_t& bound = bounds[static_cast<size_t>(pass.target)];
        bound = std::max(bound, std::min(written, 0x80u));
    }
    m_alphaBound = bounds;
}

void NativeRenderer::record(VkCommandBuffer cmd, const scene::Frame& frame) {
    if (m_output.width == 0) throw std::runtime_error("the renderer has no output");
    checkAlpha(frame);
    ensureTargets(cmd, frame);
    std::vector<GpuVertex>& vertices = m_staging;
    std::vector<std::pair<uint32_t, uint32_t>>& ranges = m_ranges;
    vertices.clear();
    ranges.clear();
    for (const scene::Pass& pass : frame.passes) {
        const size_t first = vertices.size();
        appendVertices(vertices, pass, frame.depthBits);
        ranges.emplace_back(static_cast<uint32_t>(first), static_cast<uint32_t>(vertices.size() - first));
    }
    if (vertices.empty()) return;

    Buffer& buffer = m_vertices[m_slot];
    m_slot = (m_slot + 1) % m_vertices.size();
    const VkDeviceSize bytes = vertices.size() * sizeof(GpuVertex);
    if (buffer.size < bytes) {
        destroyBuffer(buffer);
        buffer = createBuffer(std::max<VkDeviceSize>(bytes * 2, 1 << 20), VK_BUFFER_USAGE_VERTEX_BUFFER_BIT);
    }
    std::memcpy(buffer.mapped, vertices.data(), bytes);
    check(vmaFlushAllocation(m_device.allocator(), buffer.allocation, 0, VK_WHOLE_SIZE), "flush");
    const VkDeviceSize offset = 0;
    vkCmdBindVertexBuffers(cmd, 0, 1, &buffer.buffer, &offset);

    Target* open = nullptr;
    VkPipeline bound = VK_NULL_HANDLE;
    struct Pushed {
        VkSampler sampler{VK_NULL_HANDLE};
        VkImageView view{VK_NULL_HANDLE};
        bool valid{false};
    } pushedImage;
    float lastConstant = 0.0f;
    bool constantValid = false;
    PushState lastPush{};
    bool pushValid = false;
    for (size_t i = 0; i < frame.passes.size(); ++i) {
        const scene::Pass& pass = frame.passes[i];
        const scene::Material& m = pass.material;
        if (ranges[i].second == 0) continue;
        Target& drawn = target(pass.target);
        Target* source = m.source == scene::SourceKind::Target ? &target(m.sourceTarget) : nullptr;
        if (source == &drawn) throw std::logic_error("pass " + pass.name + " reads the target it draws to");
        const bool settle = source && source->resolved.layout != VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        if (open && (open != &drawn || settle)) {
            vkCmdEndRendering(cmd);
            open = nullptr;
        }
        if (settle) transition(cmd, source->resolved, VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL, VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT, VK_ACCESS_2_SHADER_SAMPLED_READ_BIT);
        if (!open) {
            beginRendering(cmd, drawn);
            open = &drawn;
            bound = VK_NULL_HANDLE;
        }
        if (m_device.labels()) m_device.beginLabel(cmd, pass.name);
        PushState push{};
        push.scene[0] = float(frame.width);
        push.scene[1] = float(frame.height);
        push.scene[2] = float(m_output.width);
        push.scene[3] = float(m_output.height);
        VkImageView view = m_blank.view;
        if (m.source == scene::SourceKind::Texture) {
            const auto found = m_textures.find({static_cast<int32_t>(frame.textureSet), m.texture});
            if (found == m_textures.end()) throw std::runtime_error("pass " + pass.name + ": no texture " + std::to_string(m.texture));
            if (frame.textureSet == scene::TextureSet::Clock && m.texture == scene::kGlyphTexture && !(frame.glyphs == m_glyphs)) throw std::runtime_error("pass " + pass.name + ": the glyph cache set is not the frame's");
            const Image& image = found->second.image;
            view = image.view;
            push.source[0] = push.source[2] = float(image.width);
            push.source[1] = push.source[3] = float(image.height);
            push.mode[0] = 1;
            push.shade[2] = 255;
        } else if (source) {
            view = source->resolved.view;
            push.source[0] = float(frame.width);
            push.source[1] = float(frame.height);
            push.source[2] = float(m_output.width);
            push.source[3] = float(m_output.height);
            push.mode[0] = 2;
            push.shade[2] = 128;
            if (frame.textureSet == scene::TextureSet::Opening) {
                push.extent[0] = kTargetTextureWidth;
                push.extent[1] = kTargetTextureHeight;
            }
        }
        for (int k = 0; k < 4; ++k) push.region[k] = float(m.region[k]);
        push.mode[1] = m.coordinates == scene::CoordinateKind::Projective;
        push.mode[2] = m.sampling == scene::Sampling::ClampToRegion;
        push.mode[3] = m.colourOnly;
        push.shade[0] = pass.edgeSmoothing;

        const VkSampler sampler = m_samplers[(m.bilinear ? 1 : 0) | (m.sampling == scene::Sampling::Repeat ? 0 : 2)];
        if (!pushedImage.valid || pushedImage.sampler != sampler || pushedImage.view != view) {
            VkDescriptorImageInfo image{sampler, view, VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL};
            VkWriteDescriptorSet write{VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET};
            write.dstBinding = 0;
            write.descriptorCount = 1;
            write.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
            write.pImageInfo = &image;
            vkCmdPushDescriptorSet(cmd, VK_PIPELINE_BIND_POINT_GRAPHICS, m_layout, 0, 1, &write);
            pushedImage = {sampler, view, true};
        }

        const float constant = float(m.blendConstant) / 128.0f;
        if (!constantValid || std::memcmp(&constant, &lastConstant, sizeof constant) != 0) {
            const float constants[4] = {constant, constant, constant, constant};
            vkCmdSetBlendConstants(cmd, constants);
            lastConstant = constant;
            constantValid = true;
        }
        const VkPipeline p = pipeline(pass, m.blend);
        if (p != bound) {
            vkCmdBindPipeline(cmd, VK_PIPELINE_BIND_POINT_GRAPHICS, p);
            bound = p;
        }
        push.shade[1] = premultiplied(m.blend);
        if (!pushValid || std::memcmp(&push, &lastPush, sizeof push) != 0) {
            vkCmdPushConstants(cmd, m_layout, VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT, 0, sizeof push, &push);
            lastPush = push;
            pushValid = true;
        }
        vkCmdDraw(cmd, ranges[i].second, 1, ranges[i].first, 0);
        m_device.endLabel(cmd);
    }
    if (open) vkCmdEndRendering(cmd);
}

void NativeRenderer::draw(const scene::Frame& frame) {
    submit([&](VkCommandBuffer cmd) { record(cmd, frame); });
}

std::vector<uint8_t> NativeRenderer::readTarget(scene::TargetName name) {
    if (m_output.width == 0) throw std::runtime_error("the renderer has no output");
    const size_t bytes = size_t(m_output.width) * m_output.height * 4;
    Image& image = target(name).resolved;
    if (!image.image) return std::vector<uint8_t>(bytes, 0);
    Buffer readback = createBuffer(bytes, VK_BUFFER_USAGE_TRANSFER_DST_BIT);
    submit([&](VkCommandBuffer cmd) {
        transition(cmd, image, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, VK_PIPELINE_STAGE_2_TRANSFER_BIT, VK_ACCESS_2_TRANSFER_READ_BIT);
        VkBufferImageCopy copy{};
        copy.imageSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
        copy.imageExtent = {m_output.width, m_output.height, 1};
        vkCmdCopyImageToBuffer(cmd, image.image, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, readback.buffer, 1, &copy);
    });
    check(vmaInvalidateAllocation(m_device.allocator(), readback.allocation, 0, VK_WHOLE_SIZE), "invalidate");
    std::vector<uint8_t> rgba(bytes);
    std::memcpy(rgba.data(), readback.mapped, bytes);
    destroyBuffer(readback);
    for (size_t i = 3; i < bytes; i += 4) rgba[i] = static_cast<uint8_t>(std::lround(rgba[i] * 128.0 / 255.0));
    return rgba;
}

void NativeRenderer::present(VkCommandBuffer cmd, VkImage image, VkExtent2D extent, scene::TargetName shown, float aspect) {
    Image& source = target(shown).resolved;
    if (!source.image) throw std::runtime_error("the shown target has not been drawn");
    transition(cmd, source, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, VK_PIPELINE_STAGE_2_BLIT_BIT, VK_ACCESS_2_TRANSFER_READ_BIT);
    barrier(cmd, image, VK_IMAGE_ASPECT_COLOR_BIT, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
            VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT, VK_PIPELINE_STAGE_2_CLEAR_BIT, VK_ACCESS_2_TRANSFER_WRITE_BIT);
    const VkClearColorValue black{{0.0f, 0.0f, 0.0f, 1.0f}};
    const VkImageSubresourceRange range{VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
    vkCmdClearColorImage(cmd, image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, &black, 1, &range);
    barrier(cmd, image, VK_IMAGE_ASPECT_COLOR_BIT, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_PIPELINE_STAGE_2_CLEAR_BIT, VK_ACCESS_2_TRANSFER_WRITE_BIT,
            VK_PIPELINE_STAGE_2_BLIT_BIT, VK_ACCESS_2_TRANSFER_WRITE_BIT);

    float w = float(extent.width), h = w / aspect;
    if (h > float(extent.height)) {
        h = float(extent.height);
        w = h * aspect;
    }
    const int32_t x0 = int32_t((float(extent.width) - w) / 2), y0 = int32_t((float(extent.height) - h) / 2);
    VkImageBlit blit{};
    blit.srcSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
    blit.srcOffsets[1] = {int32_t(source.width), int32_t(source.height), 1};
    blit.dstSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
    blit.dstOffsets[0] = {x0, y0, 0};
    blit.dstOffsets[1] = {std::max(x0 + 1, x0 + int32_t(w)), std::max(y0 + 1, y0 + int32_t(h)), 1};
    vkCmdBlitImage(cmd, source.image, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, &blit, VK_FILTER_LINEAR);
    barrier(cmd, image, VK_IMAGE_ASPECT_COLOR_BIT, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL, VK_PIPELINE_STAGE_2_BLIT_BIT, VK_ACCESS_2_TRANSFER_WRITE_BIT,
            VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, VK_ACCESS_2_COLOR_ATTACHMENT_READ_BIT | VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT);
}

}  // namespace render
