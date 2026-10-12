#include "Check.hpp"
#include "Core/HeadlessContext.hpp"

int main() {
    HeadlessContext context(true);
    const GpuDevice gpu = context.gpu();
    CHECK(gpu.device != VK_NULL_HANDLE && gpu.allocator != VK_NULL_HANDLE && gpu.queue != VK_NULL_HANDLE);

    VkPhysicalDeviceFragmentShaderInterlockFeaturesEXT interlock{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FRAGMENT_SHADER_INTERLOCK_FEATURES_EXT};
    VkPhysicalDeviceFeatures2 features{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2, &interlock};
    vkGetPhysicalDeviceFeatures2(gpu.physicalDevice, &features);
    CHECK(interlock.fragmentShaderPixelInterlock == VK_TRUE);
    CHECK(features.features.fragmentStoresAndAtomics == VK_TRUE);

    VkFormatProperties format{};
    vkGetPhysicalDeviceFormatProperties(gpu.physicalDevice, VK_FORMAT_R8G8B8A8_UINT, &format);
    CHECK(format.optimalTilingFeatures & VK_FORMAT_FEATURE_STORAGE_IMAGE_BIT);
    vkGetPhysicalDeviceFormatProperties(gpu.physicalDevice, VK_FORMAT_R32_UINT, &format);
    CHECK(format.optimalTilingFeatures & VK_FORMAT_FEATURE_STORAGE_IMAGE_BIT);
    CHECK(context.validationErrors() == 0);
    return 0;
}
