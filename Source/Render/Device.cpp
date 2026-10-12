#include "Render/Device.hpp"
#include <SDL3/SDL_vulkan.h>
#include <cstdio>
#include <format>
#include <stdexcept>
#include <string>

namespace render {
namespace {
VKAPI_ATTR VkBool32 VKAPI_CALL onMessage(VkDebugUtilsMessageSeverityFlagBitsEXT severity, VkDebugUtilsMessageTypeFlagsEXT type,
                                         const VkDebugUtilsMessengerCallbackDataEXT* data, void* user) {
    if ((severity & VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT) && (type & VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT)) {
        static_cast<std::atomic<uint32_t>*>(user)->fetch_add(1);
        std::fprintf(stderr, "validation: %s\n", data->pMessage);
    }
    return VK_FALSE;
}

void check(VkResult result, const char* what) {
    if (result != VK_SUCCESS) throw std::runtime_error(std::string(what) + ": " + std::to_string(result));
}
}  // namespace

void Device::verify(VkResult result, const char* what) const {
    if (result == VK_ERROR_DEVICE_LOST) throw DeviceLost(std::string(what) + ": device lost" + faultReport());
    check(result, what);
}

void Device::beginLabel(VkCommandBuffer cmd, const std::string& name) const {
    if (!m_beginLabel) return;
    VkDebugUtilsLabelEXT label{VK_STRUCTURE_TYPE_DEBUG_UTILS_LABEL_EXT};
    label.pLabelName = name.c_str();
    m_beginLabel(cmd, &label);
}

void Device::endLabel(VkCommandBuffer cmd) const {
    if (m_endLabel) m_endLabel(cmd);
}

std::string Device::faultReport() const {
    if (!m_faultInfo) return {};
    VkDeviceFaultCountsEXT counts{VK_STRUCTURE_TYPE_DEVICE_FAULT_COUNTS_EXT};
    if (m_faultInfo(device(), &counts, nullptr) != VK_SUCCESS) return {};
    std::vector<VkDeviceFaultAddressInfoEXT> addresses(counts.addressInfoCount);
    std::vector<VkDeviceFaultVendorInfoEXT> vendors(counts.vendorInfoCount);
    VkDeviceFaultInfoEXT info{VK_STRUCTURE_TYPE_DEVICE_FAULT_INFO_EXT};
    info.pAddressInfos = addresses.data();
    info.pVendorInfos = vendors.data();
    if (m_faultInfo(device(), &counts, &info) < 0) return {};
    std::string report = std::string("\ndevice fault: ") + info.description;
    for (const VkDeviceFaultAddressInfoEXT& a : addresses)
        report += std::format("\n  address type {} at 0x{:x}, precision {}", static_cast<int>(a.addressType), a.reportedAddress, a.addressPrecision);
    for (const VkDeviceFaultVendorInfoEXT& v : vendors)
        report += std::format("\n  vendor {} code 0x{:x} data 0x{:x}", v.description, v.vendorFaultCode, v.vendorFaultData);
    return report;
}

Device::Device(SDL_Window* window, const DeviceOptions& options) : m_window(window) {
    vkb::InstanceBuilder instanceBuilder;
    instanceBuilder.set_app_name("CrystalOSD").require_api_version(1, 4, 0);
    if (window) {
        Uint32 count = 0;
        const char* const* extensions = SDL_Vulkan_GetInstanceExtensions(&count);
        for (Uint32 i = 0; i < count; ++i) instanceBuilder.enable_extension(extensions[i]);
    } else {
        instanceBuilder.set_headless(true);
    }
    const VkBool32 syncOn = VK_TRUE;
    if (options.validation && options.syncValidation)
        instanceBuilder.add_layer_setting({"VK_LAYER_KHRONOS_validation", "validate_sync", VK_LAYER_SETTING_TYPE_BOOL32_EXT, 1, &syncOn});
    if (options.validation) instanceBuilder.request_validation_layers(true).set_debug_callback(onMessage).set_debug_callback_user_data_pointer(&m_errors);
    auto instance = instanceBuilder.build();
    if (!instance) throw std::runtime_error("instance: " + instance.error().message());
    m_instance = instance.value();
    if (m_instance.debug_messenger) {
        m_beginLabel = reinterpret_cast<PFN_vkCmdBeginDebugUtilsLabelEXT>(vkGetInstanceProcAddr(m_instance.instance, "vkCmdBeginDebugUtilsLabelEXT"));
        m_endLabel = reinterpret_cast<PFN_vkCmdEndDebugUtilsLabelEXT>(vkGetInstanceProcAddr(m_instance.instance, "vkCmdEndDebugUtilsLabelEXT"));
        if (!m_beginLabel || !m_endLabel) {
            m_beginLabel = nullptr;
            m_endLabel = nullptr;
        }
    }

    if (window && !SDL_Vulkan_CreateSurface(window, m_instance.instance, nullptr, &m_surface))
        throw std::runtime_error(std::string("surface: ") + SDL_GetError());

    VkPhysicalDeviceVulkan13Features features13{};
    features13.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES;
    features13.dynamicRendering = VK_TRUE;
    features13.synchronization2 = VK_TRUE;
    VkPhysicalDeviceVulkan14Features features14{};
    features14.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_4_FEATURES;
    features14.pushDescriptor = VK_TRUE;

    vkb::PhysicalDeviceSelector selector{m_instance};
    if (window) selector.set_surface(m_surface);
    auto physical = selector.set_minimum_version(1, 4).set_required_features_13(features13).set_required_features_14(features14).select();
    if (!physical) throw std::runtime_error("physical device: " + physical.error().message());

    vkb::PhysicalDevice chosen = physical.value();
    const VkPhysicalDeviceLimits& limits = chosen.properties.limits;
    m_sampleCounts = limits.framebufferColorSampleCounts & limits.framebufferDepthSampleCounts;

    VkPhysicalDeviceFaultFeaturesEXT faultFeatures{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FAULT_FEATURES_EXT};
    faultFeatures.deviceFault = VK_TRUE;
    const bool fault = chosen.is_extension_present(VK_EXT_DEVICE_FAULT_EXTENSION_NAME) && chosen.are_extension_features_present(faultFeatures) &&
                       chosen.enable_extension_if_present(VK_EXT_DEVICE_FAULT_EXTENSION_NAME) && chosen.enable_extension_features_if_present(faultFeatures);

    auto device = vkb::DeviceBuilder{chosen}.build();
    if (!device) throw std::runtime_error("device: " + device.error().message());
    m_device = device.value();
    if (fault) m_faultInfo = reinterpret_cast<PFN_vkGetDeviceFaultInfoEXT>(vkGetDeviceProcAddr(m_device.device, "vkGetDeviceFaultInfoEXT"));

    auto queue = m_device.get_queue(vkb::QueueType::graphics);
    auto family = m_device.get_queue_index(vkb::QueueType::graphics);
    if (!queue || !family) throw std::runtime_error("no graphics queue");
    m_queue = queue.value();
    m_queueFamily = family.value();

    VmaAllocatorCreateInfo allocator{};
    allocator.physicalDevice = m_device.physical_device.physical_device;
    allocator.device = m_device.device;
    allocator.instance = m_instance.instance;
    allocator.vulkanApiVersion = VK_API_VERSION_1_4;
    check(vmaCreateAllocator(&allocator, &m_allocator), "allocator");

    if (!window) return;

    for (Frame& frame : m_frames) {
        VkCommandPoolCreateInfo pool{VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO};
        pool.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
        pool.queueFamilyIndex = m_queueFamily;
        check(vkCreateCommandPool(this->device(), &pool, nullptr, &frame.pool), "command pool");
        VkCommandBufferAllocateInfo alloc{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO};
        alloc.commandPool = frame.pool;
        alloc.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
        alloc.commandBufferCount = 1;
        check(vkAllocateCommandBuffers(this->device(), &alloc, &frame.cmd), "command buffer");
        VkSemaphoreCreateInfo semaphore{VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO};
        check(vkCreateSemaphore(this->device(), &semaphore, nullptr, &frame.acquired), "semaphore");
        VkFenceCreateInfo fence{VK_STRUCTURE_TYPE_FENCE_CREATE_INFO};
        fence.flags = VK_FENCE_CREATE_SIGNALED_BIT;
        check(vkCreateFence(this->device(), &fence, nullptr, &frame.fence), "fence");
    }
    m_hasSwapchain = createSwapchain();
}

Device::~Device() {
    if (m_device.device) vkDeviceWaitIdle(m_device.device);
    if (m_window) {
        destroySwapchainViews();
        vkb::destroy_swapchain(m_swapchain);
        for (Frame& frame : m_frames) {
            vkDestroyFence(device(), frame.fence, nullptr);
            vkDestroySemaphore(device(), frame.acquired, nullptr);
            vkDestroyCommandPool(device(), frame.pool, nullptr);
        }
    }
    if (m_allocator) vmaDestroyAllocator(m_allocator);
    vkb::destroy_device(m_device);
    if (m_surface) vkb::destroy_surface(m_instance, m_surface);
    vkb::destroy_instance(m_instance);
}

void Device::destroySwapchainViews() {
    for (VkImageView view : m_views) vkDestroyImageView(device(), view, nullptr);
    for (VkSemaphore semaphore : m_renderDone) vkDestroySemaphore(device(), semaphore, nullptr);
    m_views.clear();
    m_renderDone.clear();
    m_images.clear();
}

bool Device::createSwapchain() {
    int width = 0;
    int height = 0;
    SDL_GetWindowSizeInPixels(m_window, &width, &height);
    if (width <= 0 || height <= 0) return false;

    vkDeviceWaitIdle(device());
    destroySwapchainViews();
    vkb::SwapchainBuilder builder{m_device};
    auto swapchain = builder.set_old_swapchain(m_swapchain)
        .set_desired_format({VK_FORMAT_B8G8R8A8_UNORM, VK_COLOR_SPACE_SRGB_NONLINEAR_KHR})
        .set_desired_present_mode(VK_PRESENT_MODE_FIFO_KHR)
        .set_desired_extent(static_cast<uint32_t>(width), static_cast<uint32_t>(height))
        .add_image_usage_flags(VK_IMAGE_USAGE_TRANSFER_DST_BIT)
        .build();
    if (!swapchain) throw std::runtime_error("swapchain: " + swapchain.error().message());
    vkb::destroy_swapchain(m_swapchain);
    m_swapchain = swapchain.value();

    m_images = m_swapchain.get_images().value();
    m_views = m_swapchain.get_image_views().value();
    VkSemaphoreCreateInfo semaphore{VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO};
    m_renderDone.resize(m_images.size());
    for (VkSemaphore& done : m_renderDone) check(vkCreateSemaphore(device(), &semaphore, nullptr, &done), "semaphore");
    return true;
}

void Device::transition(VkCommandBuffer cmd, VkImage image, VkImageLayout from, VkImageLayout to, VkPipelineStageFlags2 srcStage, VkAccessFlags2 srcAccess, VkPipelineStageFlags2 dstStage, VkAccessFlags2 dstAccess) {
    VkImageMemoryBarrier2 barrier{VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2};
    barrier.srcStageMask = srcStage;
    barrier.srcAccessMask = srcAccess;
    barrier.dstStageMask = dstStage;
    barrier.dstAccessMask = dstAccess;
    barrier.oldLayout = from;
    barrier.newLayout = to;
    barrier.srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
    barrier.dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
    barrier.image = image;
    barrier.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
    VkDependencyInfo dependency{VK_STRUCTURE_TYPE_DEPENDENCY_INFO};
    dependency.imageMemoryBarrierCount = 1;
    dependency.pImageMemoryBarriers = &barrier;
    vkCmdPipelineBarrier2(cmd, &dependency);
}

std::optional<Device::FrameContext> Device::beginFrame() {
    if (!m_window) return std::nullopt;

    int width = 0;
    int height = 0;
    SDL_GetWindowSizeInPixels(m_window, &width, &height);
    if (width <= 0 || height <= 0 || (SDL_GetWindowFlags(m_window) & SDL_WINDOW_MINIMIZED)) return std::nullopt;
    if (!m_hasSwapchain || m_swapchain.extent.width != static_cast<uint32_t>(width) || m_swapchain.extent.height != static_cast<uint32_t>(height))
        m_hasSwapchain = createSwapchain();
    if (!m_hasSwapchain) return std::nullopt;

    Frame& frame = m_frames[m_frameSlot];
    verify(vkWaitForFences(device(), 1, &frame.fence, VK_TRUE, UINT64_MAX), "wait fence");

    uint32_t index = 0;
    VkResult acquired = vkAcquireNextImageKHR(device(), m_swapchain.swapchain, UINT64_MAX, frame.acquired, VK_NULL_HANDLE, &index);
    if (acquired == VK_ERROR_OUT_OF_DATE_KHR) {
        m_hasSwapchain = createSwapchain();
        return std::nullopt;
    }
    if (acquired != VK_SUCCESS && acquired != VK_SUBOPTIMAL_KHR) verify(acquired, "acquire");
    verify(vkResetFences(device(), 1, &frame.fence), "reset fence");

    verify(vkResetCommandBuffer(frame.cmd, 0), "reset command buffer");
    VkCommandBufferBeginInfo begin{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO};
    begin.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    verify(vkBeginCommandBuffer(frame.cmd, &begin), "begin command buffer");
    transition(frame.cmd, m_images[index], VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
               VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, 0,
               VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT);
    return FrameContext{frame.cmd, m_images[index], m_views[index], index};
}

void Device::endFrame(const FrameContext& context) {
    Frame& frame = m_frames[m_frameSlot];
    transition(frame.cmd, context.image, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL, VK_IMAGE_LAYOUT_PRESENT_SRC_KHR,
               VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT,
               VK_PIPELINE_STAGE_2_NONE, 0);
    verify(vkEndCommandBuffer(frame.cmd), "end command buffer");

    VkSemaphoreSubmitInfo wait{VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO};
    wait.semaphore = frame.acquired;
    wait.stageMask = VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT;
    VkSemaphoreSubmitInfo signal{VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO};
    signal.semaphore = m_renderDone[context.index];
    signal.stageMask = VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT;
    VkCommandBufferSubmitInfo cmd{VK_STRUCTURE_TYPE_COMMAND_BUFFER_SUBMIT_INFO};
    cmd.commandBuffer = frame.cmd;
    VkSubmitInfo2 submit{VK_STRUCTURE_TYPE_SUBMIT_INFO_2};
    submit.waitSemaphoreInfoCount = 1;
    submit.pWaitSemaphoreInfos = &wait;
    submit.commandBufferInfoCount = 1;
    submit.pCommandBufferInfos = &cmd;
    submit.signalSemaphoreInfoCount = 1;
    submit.pSignalSemaphoreInfos = &signal;
    verify(vkQueueSubmit2(m_queue, 1, &submit, frame.fence), "submit");

    VkPresentInfoKHR present{VK_STRUCTURE_TYPE_PRESENT_INFO_KHR};
    present.waitSemaphoreCount = 1;
    present.pWaitSemaphores = &m_renderDone[context.index];
    present.swapchainCount = 1;
    present.pSwapchains = &m_swapchain.swapchain;
    present.pImageIndices = &context.index;
    VkResult result = vkQueuePresentKHR(m_queue, &present);
    if (result == VK_ERROR_OUT_OF_DATE_KHR || result == VK_SUBOPTIMAL_KHR) m_hasSwapchain = createSwapchain();
    else verify(result, "present");
    m_frameSlot = (m_frameSlot + 1) % kFramesInFlight;
}

}  // namespace render
