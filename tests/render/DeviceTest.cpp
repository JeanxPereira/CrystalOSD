#include "../Check.hpp"
#include "Render/Device.hpp"

int main() {
    render::Device device(nullptr, {true});
    CHECK(device.device() != VK_NULL_HANDLE);
    CHECK(device.allocator() != VK_NULL_HANDLE);
    CHECK(device.queue() != VK_NULL_HANDLE);
    CHECK(!device.beginFrame().has_value());
    CHECK(device.validationErrors() == 0);
    return 0;
}
