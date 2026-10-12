#pragma once
#include "Core/GpuDevice.hpp"
#include <VkBootstrap.h>
#include <atomic>

class HeadlessContext {
public:
    explicit HeadlessContext(bool validation);
    ~HeadlessContext();
    HeadlessContext(const HeadlessContext&) = delete;
    HeadlessContext& operator=(const HeadlessContext&) = delete;

    GpuDevice gpu() const { return {m_device.device, m_device.physical_device.physical_device, m_allocator, m_queue, m_queueFamily}; }
    uint32_t validationErrors() const { return m_errors.load(); }

private:
    vkb::Instance m_instance;
    vkb::Device m_device;
    VmaAllocator m_allocator{VK_NULL_HANDLE};
    VkQueue m_queue{VK_NULL_HANDLE};
    uint32_t m_queueFamily{0};
    std::atomic<uint32_t> m_errors{0};
};
