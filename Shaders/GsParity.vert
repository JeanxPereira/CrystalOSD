#version 460

layout(location = 0) in vec2 inPosition;
layout(location = 1) in vec2 inDepth;
layout(location = 2) in vec4 inColour;
layout(location = 3) in vec3 inTexture;
layout(location = 4) in vec4 inStepped;
layout(location = 5) in vec2 inFirst;
layout(location = 6) in vec4 inScanTexture;
layout(location = 7) in vec4 inScanColour;
layout(location = 8) in vec4 inStepTexture;
layout(location = 9) in vec4 inStepColour;
layout(location = 10) in uvec4 inDepthSteps;
layout(location = 11) in float inEdge;

layout(push_constant) uniform DrawState {
    ivec4 scissor; ivec4 blend; ivec4 misc; ivec4 tex; ivec4 texSize; ivec4 addressU; ivec4 addressV; ivec4 flags;
} state;

layout(location = 0) flat out vec2 outDepth;
layout(location = 1) noperspective out vec4 outColour;
layout(location = 2) noperspective out vec3 outTexture;
layout(location = 3) flat out vec4 outStepped;
layout(location = 4) flat out ivec2 outFirst;
layout(location = 5) flat out vec4 outScanTexture;
layout(location = 6) flat out vec4 outScanColour;
layout(location = 7) flat out vec4 outStepTexture;
layout(location = 8) flat out vec4 outStepColour;
layout(location = 9) flat out uvec4 outDepthSteps;
layout(location = 10) flat out int outEdge;

void main() {
    // The GS samples a pixel at its integer coordinate; Vulkan samples at the centre.
    gl_Position = vec4((inPosition + 0.5) / vec2(state.flags.yz) * 2.0 - 1.0, 0.0, 1.0);
    outDepth = inDepth;
    outColour = inColour;
    outTexture = inTexture;
    outStepped = inStepped;
    outFirst = ivec2(inFirst);
    outScanTexture = inScanTexture;
    outScanColour = inScanColour;
    outStepTexture = inStepTexture;
    outStepColour = inStepColour;
    outDepthSteps = inDepthSteps;
    outEdge = int(inEdge);
}
