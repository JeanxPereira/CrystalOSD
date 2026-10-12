#include "Core/HeadlessContext.hpp"
#include <cstdio>
#include <stdexcept>

namespace {
VKAPI_ATTR VkBool32 VKAPI_CALL onMessage(VkDebugUtilsMessageSeverityFlagBitsEXT severity, VkDebugUtilsMessageTypeFlagsEXT type,
                                         const VkDebugUtilsMessengerCallbackDataEXT* data, void* user) {
    if ((severity & VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT) && (type & VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT)) {
        static_cast<std::atomic<uint32_t>*>(user)->fetch_add(1);
        std::fprintf(stderr, "validation: %s\n", data->pMessage);
    }
    return VK_FALSE;
}
}  // namespace

HeadlessContext::HeadlessContext(bool validation) {
    vkb::InstanceBuilder instanceBuilder;
    instanceBuilder.set_app_name("CrystalOSDParity").require_api_version(1, 4, 0).set_headless(true);
    if (validation) instanceBuilder.request_validation_layers(true).set_debug_callback(onMessage).set_debug_callback_user_data_pointer(&m_errors);
    auto instance = instanceBuilder.build();
    if (!instance) throw std::runtime_error("instance: " + instance.error().message());
    m_instance = instance.value();

    VkPhysicalDeviceFeatures features{};
    features.fragmentStoresAndAtomics = VK_TRUE;
    VkPhysicalDeviceVulkan13Features features13{};
    features13.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES;
    features13.dynamicRendering = VK_TRUE;
    features13.synchronization2 = VK_TRUE;
    VkPhysicalDeviceFragmentShaderInterlockFeaturesEXT interlock{};
    interlock.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FRAGMENT_SHADER_INTERLOCK_FEATURES_EXT;
    interlock.fragmentShaderPixelInterlock = VK_TRUE;

    vkb::PhysicalDeviceSelector selector{m_instance};
    auto physical = selector.set_minimum_version(1, 4)
        .set_required_features(features)
        .set_required_features_13(features13)
        .add_required_extension(VK_EXT_FRAGMENT_SHADER_INTERLOCK_EXTENSION_NAME)
        .add_required_extension_features(interlock)
        .select();
    if (!physical) throw std::runtime_error("physical device: " + physical.error().message());

    auto device = vkb::DeviceBuilder{physical.value()}.build();
    if (!device) throw std::runtime_error("device: " + device.error().message());
    m_device = device.value();

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
    if (vmaCreateAllocator(&allocator, &m_allocator) != VK_SUCCESS) throw std::runtime_error("allocator");
}

HeadlessContext::~HeadlessContext() {
    if (m_allocator) vmaDestroyAllocator(m_allocator);
    vkb::destroy_device(m_device);
    vkb::destroy_instance(m_instance);
}
