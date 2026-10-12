#version 450

// source: size in source texels (scene units), image size in pixels. region: min u, max u, min v, max v.
// mode: source (0 none, 1 texture, 2 target), projective, clamp to region, colour only.
// shade: edge smoothing (alpha 0x80), premultiplied (Cs * As leaves the shader), texel alpha scale (255 texture, 128 target),
// extent: the size of a target read as a texture, in texels (projective coordinates scale to its picture).
layout(push_constant) uniform PassState {
    vec4 scene;
    vec4 source;
    vec4 region;
    ivec4 mode;
    ivec4 shade;
    vec4 extent;
} state;

layout(set = 0, binding = 0) uniform sampler2D image;

layout(location = 0) noperspective in vec3 inTexture;
layout(location = 1) noperspective in vec4 inColour;

layout(location = 0) out vec4 outColour;

void main() {
    // The output pixel centre is the scene point (centre - 0.5) / scale; the GS sample point that matches the
    // pixel is centre / scale - 0.5: half a pixel times (1 - scale) further along the (linear) coordinates.
    vec2 scale = state.scene.zw / state.scene.xy;
    vec3 coordinates = inTexture + 0.5 * (1.0 - scale.x) * dFdx(inTexture) + 0.5 * (1.0 - scale.y) * dFdy(inTexture);
    vec3 colour = inColour.rgb;
    float alpha = inColour.a;
    if (state.mode.x != 0) {
        vec2 uv = state.mode.y == 1 ? coordinates.xy / coordinates.z : coordinates.xy / state.source.xy;
        if (state.mode.x == 2 && state.mode.y == 1 && state.extent.x > 0.0) uv *= state.extent.xy / state.source.xy;
        if (state.mode.z == 1) {
            vec2 low = state.region.xz / state.source.xy + 0.5 / state.source.zw;
            vec2 high = (state.region.yw + 1.0) / state.source.xy - 0.5 / state.source.zw;
            uv = clamp(uv, low, high);
        }
        vec4 texel = texture(image, uv);
        vec3 texelColour = texel.rgb * 255.0;
        float texelAlpha = texel.a * float(state.shade.z);
        if (state.mode.w == 1) texelAlpha = any(greaterThan(texelColour, vec3(0.5))) ? 127.0 : 0.0;
        // GS modulate: texel * vertex / 128 for colour and alpha.
        colour = min(texelColour * colour / 128.0, vec3(255.0));
        alpha = texelAlpha * alpha / 128.0;
    }
    if (state.shade.x == 1) alpha = 128.0;
    float a = alpha / 128.0;
    vec3 c = colour / 255.0;
    outColour = vec4(state.shade.y == 1 ? c * a : c, a);
}
