#pragma once
#include <vulkan/vulkan.h>
#include <vk_mem_alloc.h>

struct GpuDevice {
    VkDevice device{VK_NULL_HANDLE};
    VkPhysicalDevice physicalDevice{VK_NULL_HANDLE};
    VmaAllocator allocator{VK_NULL_HANDLE};
    VkQueue queue{VK_NULL_HANDLE};
    uint32_t queueFamily{0};
};
