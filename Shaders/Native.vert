#version 450

// scene: scene size (640 x 224), output size. The GS samples a pixel at its integer point; the scene point p
// lands at p * scale + 0.5 output pixels, so at scale 1 a pixel is covered exactly when the GS covers it, and
// at any scale a sprite over the whole target covers every output pixel. Native.frag moves the texture
// coordinates to the GS sample point that matches each output pixel.
layout(push_constant) uniform PassState {
    vec4 scene;
    vec4 source;
    vec4 region;
    ivec4 mode;
    ivec4 shade;
    vec4 extent;
} state;

layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inTexture;
layout(location = 2) in uvec4 inColour;

invariant gl_Position;

layout(location = 0) noperspective out vec3 outTexture;
layout(location = 1) noperspective out vec4 outColour;

void main() {
    vec2 scale = state.scene.zw / state.scene.xy;
    gl_Position = vec4((inPosition.xy * scale + 0.5) / state.scene.zw * 2.0 - 1.0, inPosition.z, 1.0);
    outTexture = inTexture;
    outColour = vec4(inColour);
}
