#pragma once
#include "Core/GpuDevice.hpp"
#include "Parity/GsFrame.hpp"
#include <filesystem>
#include <functional>
#include <map>
#include <span>
#include <string>
#include <vector>

// Draws native passes under the GS's rules: targets are storage images, and the fragment shader
// tests depth, blends in integers and writes inside an ordered pixel interlock.
class GsParityRenderer {
public:
    GsParityRenderer(const GpuDevice& gpu, const std::filesystem::path& shaderDirectory);
    ~GsParityRenderer();
    GsParityRenderer(const GsParityRenderer&) = delete;
    GsParityRenderer& operator=(const GsParityRenderer&) = delete;

    void setTarget(const std::string& id, uint32_t width, uint32_t height, std::span<const uint8_t> rgba);
    void setDepth(uint32_t width, uint32_t height, std::span<const uint32_t> depth);
    void setTexture(const std::string& id, uint32_t width, uint32_t height, std::span<const uint8_t> rgba);
    void draw(const parity::GsPass& pass);
    std::vector<uint8_t> readTarget(const std::string& id);
    std::vector<uint32_t> readDepth();

private:
    struct Image { VkImage image{VK_NULL_HANDLE}; VkImageView view{VK_NULL_HANDLE}; VmaAllocation allocation{VK_NULL_HANDLE}; uint32_t width{0}, height{0}; VkFormat format{VK_FORMAT_UNDEFINED}; };
    struct Buffer { VkBuffer buffer{VK_NULL_HANDLE}; VmaAllocation allocation{VK_NULL_HANDLE}; void* mapped{nullptr}; };

    Image& place(std::map<std::string, Image>& where, const std::string& id, uint32_t width, uint32_t height, VkFormat format);
    Image createImage(uint32_t width, uint32_t height, VkFormat format);
    void destroyImage(Image& image);
    Buffer createBuffer(VkDeviceSize size, VkBufferUsageFlags usage);
    void upload(const Image& image, const void* data, size_t bytes);
    std::vector<uint8_t> download(const Image& image, size_t bytes);
    void submit(const std::function<void(VkCommandBuffer)>& record);
    VkPipeline createPipeline(VkPrimitiveTopology topology, VkShaderModule vertex, VkShaderModule fragment);

    GpuDevice m_gpu;
    VkCommandPool m_pool{VK_NULL_HANDLE};
    VkCommandBuffer m_commands{VK_NULL_HANDLE};
    VkSampler m_sampler{VK_NULL_HANDLE};
    VkDescriptorSetLayout m_setLayout{VK_NULL_HANDLE};
    VkPipelineLayout m_layout{VK_NULL_HANDLE};
    VkDescriptorPool m_descriptors{VK_NULL_HANDLE};
    VkDescriptorSet m_set{VK_NULL_HANDLE};
    VkPipeline m_triangles{VK_NULL_HANDLE}, m_lines{VK_NULL_HANDLE};
    std::map<std::string, Image> m_targets, m_textures;
    Image m_depth, m_blank;
};
