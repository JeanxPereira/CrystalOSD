#version 460
#extension GL_ARB_fragment_shader_interlock : require

layout(pixel_interlock_ordered) in;

// coherent: later fragments of a pixel must see earlier stores inside the interlock.
layout(set = 0, binding = 0, rgba8ui) coherent uniform uimage2D targetImage;
layout(set = 0, binding = 1, r32ui) coherent uniform uimage2D depthImage;
layout(set = 0, binding = 2) uniform usampler2D textureImage;

// scissor: x0 y0 x1 y1 (inclusive)        blend: a b c d (terms 0 source 1 destination 2 zero; c 0 source alpha 1 destination alpha 2 fixed)
// misc: blend on, fixed, depth test (0 never 1 always 2 >= 3 >), depth write
// tex: on (bit 0) and the mip level (from bit 8), coordinates (0 texel 1 projective 2 sprite steps), filter (0 nearest 1 bilinear), alpha (0 texel 1 constant 2 sixteen-bit)
// texSize: width, height, constant alpha (TA0), zero when black (AEM)      address: mode (0 repeat 1 clamp 2 region clamp 3 region repeat), min, max
// addressU.w: pass flags (bit 0 Z24, bit 1 PABE, bit 2 FBA, bit 3 clamp the source depth to 24 bits)      addressV.w: TA1, the alpha of a sixteen-bit texel with bit 15 set
// flags: antialias (lines and triangles), target width, target height, rows walked by the GS rasterizer (triangles, AA1 lines)
layout(push_constant) uniform DrawState {
    ivec4 scissor; ivec4 blend; ivec4 misc; ivec4 tex; ivec4 texSize; ivec4 addressU; ivec4 addressV; ivec4 flags;
} state;

// The oracle's scanline steps pixels in blocks of this width (SSE4.1 build: 4); set by the renderer.
layout(constant_id = 0) const int BlockWidth = 4;

layout(location = 0) flat in vec2 inDepth;
layout(location = 1) noperspective in vec4 inColour;
layout(location = 2) noperspective in vec3 inTexture;
layout(location = 3) flat in vec4 inStepped;
layout(location = 4) flat in ivec2 inFirst;
layout(location = 5) flat in vec4 inScanTexture;
layout(location = 6) flat in vec4 inScanColour;
layout(location = 7) flat in vec4 inStepTexture;
layout(location = 8) flat in vec4 inStepColour;
layout(location = 9) flat in uvec4 inDepthSteps;
// 0 on a filled pixel; on an antialiased edge pixel, 1 + its coverage alpha (cov16 >> 9).
layout(location = 10) flat in int inEdge;

int address(int value, ivec4 mode, int size) {
    if (mode.x == 0) return value & (size - 1);
    if (mode.x == 1) return clamp(value, 0, size - 1);
    if (mode.x == 2) return clamp(value, mode.y, mode.z);
    return (value & mode.y) | mode.z;
}

ivec4 texel(ivec2 at) {
    ivec2 p = ivec2(address(at.x, state.addressU, state.texSize.x), address(at.y, state.addressV, state.texSize.y));
    ivec4 c = ivec4(texelFetch(textureImage, clamp(p, ivec2(0), textureSize(textureImage, 0) - 1), 0));
    if (state.tex.w == 1) c.a = (state.texSize.w == 1 && c.rgb == ivec3(0)) ? 0 : state.texSize.z;
    else if (state.tex.w == 2) c.a = (state.texSize.w == 1 && c.rgb == ivec3(0)) ? 0 : (c.a != 0 ? state.addressV.w : state.texSize.z);
    return c;
}

// Bilinear weights are four bits: a + ((b - a) * f >> 4).
ivec4 mix4(ivec4 a, ivec4 b, int f) { return a + (((b - a) * f) >> 4); }

ivec4 sampleTexture(ivec2 uv) {
    if (state.tex.z == 0) return texel(uv >> 16);
    ivec2 f = (uv >> 12) & 0xf;
    ivec2 i = uv >> 16;
    ivec4 top = mix4(texel(i), texel(i + ivec2(1, 0)), f.x);
    ivec4 bottom = mix4(texel(i + ivec2(0, 1)), texel(i + ivec2(1, 1)), f.x);
    return mix4(top, bottom, f.y);
}

// A sprite's coordinate as the GS rasterizer steps it in blocks: V adds its step once per row in
// floats; U is the row's start, truncated, plus the truncated step times the lane offset inside a block, plus whole blocks.
ivec2 steppedCoordinate(ivec2 pixel) {
    precise float v = inStepped.y;
    for (int row = inFirst.y; row < pixel.y; row++) v += inStepped.w;
    int skip = inFirst.x & (BlockWidth - 1);
    int offset = pixel.x - (inFirst.x - skip);
    precise float lane = inStepped.z * float((offset & (BlockWidth - 1)) - skip);
    precise float block = inStepped.z * float(BlockWidth);
    return ivec2(int(inStepped.x) + int(lane) + (offset / BlockWidth) * int(block), int(v));
}

// Unsigned 64-bit integers as (low, high) and IEEE doubles as their bits: the GS steps depth in doubles.
uvec2 add64(uvec2 a, uvec2 b) { uint carry; uint low = uaddCarry(a.x, b.x, carry); return uvec2(low, a.y + b.y + carry); }
uvec2 sub64(uvec2 a, uvec2 b) { uint borrow; uint low = usubBorrow(a.x, b.x, borrow); return uvec2(low, a.y - b.y - borrow); }
bool below64(uvec2 a, uvec2 b) { return a.y < b.y || (a.y == b.y && a.x < b.x); }
uvec2 shiftLeft64(uvec2 a, int n) {
    if (n == 0) return a;
    if (n >= 64) return uvec2(0u);
    if (n >= 32) return uvec2(0u, a.x << (n - 32));
    return uvec2(a.x << n, (a.y << n) | (a.x >> (32 - n)));
}
uvec2 shiftRight64(uvec2 a, int n) {
    if (n == 0) return a;
    if (n >= 64) return uvec2(0u);
    if (n >= 32) return uvec2(a.y >> (n - 32), 0u);
    return uvec2((a.x >> n) | (a.y << (32 - n)), a.y >> n);
}
uvec2 shiftRightSticky64(uvec2 a, int n) {
    uvec2 r = shiftRight64(a, n);
    bool lost = n >= 64 ? a != uvec2(0u) : shiftLeft64(r, n) != a;
    return uvec2(r.x | (lost ? 1u : 0u), r.y);
}

uvec2 doubleOf(float value) {
    uint u = floatBitsToUint(value);
    if ((u & 0x7fffffffu) == 0u) return uvec2(0u, u & 0x80000000u);
    uint exponent = ((u >> 23) & 0xffu) + 896u;
    uint mantissa = u & 0x7fffffu;
    return uvec2(mantissa << 29, (u & 0x80000000u) | (exponent << 20) | (mantissa >> 3));
}

// Double addition rounded to nearest even: mantissas carry three extra bits (guard, round, sticky).
uvec2 addDouble(uvec2 a, uvec2 b) {
    if (((a.y & 0x7fffffffu) | a.x) == 0u) return b;
    if (((b.y & 0x7fffffffu) | b.x) == 0u) return a;
    uint signA = a.y >> 31, signB = b.y >> 31;
    int exponentA = int((a.y >> 20) & 0x7ffu), exponentB = int((b.y >> 20) & 0x7ffu);
    uvec2 mantissaA = shiftLeft64(uvec2(a.x, (a.y & 0xfffffu) | (exponentA != 0 ? 0x100000u : 0u)), 3);
    uvec2 mantissaB = shiftLeft64(uvec2(b.x, (b.y & 0xfffffu) | (exponentB != 0 ? 0x100000u : 0u)), 3);
    exponentA = max(exponentA, 1);
    exponentB = max(exponentB, 1);
    if (exponentB > exponentA || (exponentB == exponentA && below64(mantissaA, mantissaB))) {
        uvec2 m = mantissaA; mantissaA = mantissaB; mantissaB = m;
        int e = exponentA; exponentA = exponentB; exponentB = e;
        uint s = signA; signA = signB; signB = s;
    }
    mantissaB = shiftRightSticky64(mantissaB, exponentA - exponentB);
    int exponent = exponentA;
    uvec2 m;
    if (signA == signB) {
        m = add64(mantissaA, mantissaB);
        if (m.y >= (1u << 24)) { m = shiftRightSticky64(m, 1); exponent++; }
    } else {
        m = sub64(mantissaA, mantissaB);
        if (m == uvec2(0u)) return uvec2(0u);
        while (m.y < (1u << 23) && exponent > 1) { m = shiftLeft64(m, 1); exponent--; }
    }
    uint extra = m.x & 7u;
    m = shiftRight64(m, 3);
    if (extra > 4u || (extra == 4u && (m.x & 1u) == 1u)) {
        m = add64(m, uvec2(1u, 0u));
        if (m.y >= (1u << 21)) { m = shiftRight64(m, 1); exponent++; }
    }
    if (m.y < (1u << 20)) exponent = 0;
    return uvec2(m.x, (signA << 31) | (uint(exponent) << 20) | (m.y & 0xfffffu));
}

// Truncation toward zero to a 32-bit integer (cvttpd2dq).
uint truncateDouble(uvec2 d) {
    int exponent = int((d.y >> 20) & 0x7ffu);
    if (exponent < 1023) return 0u;
    uvec2 mantissa = uvec2(d.x, (d.y & 0xfffffu) | 0x100000u);
    int shift = exponent - 1075;
    uint whole = shift >= 0 ? shiftLeft64(mantissa, shift).x : shiftRight64(mantissa, -shift).x;
    return (d.y >> 31) == 1u ? uint(-int(whole)) : whole;
}

// Single-precision division rounded to nearest even (divps), by long division of the mantissas.
float divideFloat(float a, float b) {
    uint ua = floatBitsToUint(a), ub = floatBitsToUint(b);
    if ((ua & 0x7fffffffu) == 0u) return a;
    uint sign = (ua ^ ub) & 0x80000000u;
    int exponent = int((ua >> 23) & 0xffu) - int((ub >> 23) & 0xffu) + 127;
    uint dividend = (ua & 0x7fffffu) | 0x800000u, divisor = (ub & 0x7fffffu) | 0x800000u;
    if (dividend < divisor) { dividend <<= 1; exponent--; }
    uint quotient = 0u;
    for (int i = 0; i < 25; i++) {
        quotient <<= 1;
        if (dividend >= divisor) { dividend -= divisor; quotient |= 1u; }
        dividend <<= 1;
    }
    uint roundBit = quotient & 1u;
    quotient >>= 1;
    if (roundBit == 1u && (dividend != 0u || (quotient & 1u) == 1u)) quotient++;
    if (quotient == 0x1000000u) { quotient >>= 1; exponent++; }
    return uintBitsToFloat(sign | (uint(exponent) << 23) | (quotient & 0x7fffffu));
}

ivec4 signed16(ivec4 v) { return v - (ivec4(greaterThanEqual(v, ivec4(0x8000))) << 16); }

ivec4 term(int which, ivec4 source, ivec4 destination) { return which == 0 ? source : which == 1 ? destination : ivec4(0); }

void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    if (pixel.x < state.scissor.x || pixel.y < state.scissor.y || pixel.x > state.scissor.z || pixel.y > state.scissor.w) discard;

    // The GS carries vertex colour with seven fraction bits in 16 bits and modulates (texel << 2) * colour >> 16.
    ivec4 shade;
    uint depth;
    ivec2 uv = ivec2(0);
    if (state.flags.w == 1) {
        // A triangle row, as CDrawScanline steps it from the row's first pixel in blocks: a value is the row start
        // plus the step times the lane offset, plus one block step per block; integers truncate each of those terms.
        int skip = inFirst.x & (BlockWidth - 1);
        int offset = pixel.x - (inFirst.x - skip);
        int blocks = offset / BlockWidth;
        float lane = float((offset & (BlockWidth - 1)) - skip);

        precise float laneDepth = inStepTexture.w * lane;
        uvec2 z = addDouble(inDepthSteps.xy, doubleOf(laneDepth));
        for (int i = 0; i < blocks; i++) z = addDouble(z, inDepthSteps.zw);
        depth = truncateDouble(z);

        precise vec4 laneColour = inStepColour * lane;
        precise vec4 blockColour = inStepColour * float(BlockWidth);
        ivec4 colour16 = ((ivec4(inScanColour) & 0xffff) + (ivec4(laneColour) & 0xffff)) & 0xffff;
        ivec4 colourBlock = ivec4(blockColour) & 0xffff;
        for (int i = 0; i < blocks; i++) {
            colour16 = (colour16 + colourBlock) & 0xffff;
            colour16 = mix(colour16, ivec4(0), greaterThanEqual(colour16, ivec4(0x8000)));
        }
        shade = signed16(colour16);

        if ((state.tex.x & 1) == 1) {
            const int level = state.tex.x >> 8;
            if (state.tex.y == 0) {
                precise vec2 laneTexture = inStepTexture.xy * lane;
                precise vec2 blockTexture = inStepTexture.xy * float(BlockWidth);
                uv = ivec2(inScanTexture.xy) + ivec2(laneTexture) + blocks * ivec2(blockTexture);
                if (level > 0) {
                    uv >>= level;
                    if (state.tex.z == 1) uv -= 0x8000;
                }
            } else {
                precise vec3 laneTexture = inStepTexture.xyz * lane;
                precise vec3 blockTexture = inStepTexture.xyz * float(BlockWidth);
                precise vec3 stq = inScanTexture.xyz + laneTexture;
                for (int i = 0; i < blocks; i++) stq += blockTexture;
                uv = ivec2(int(divideFloat(stq.x, stq.z)), int(divideFloat(stq.y, stq.z)));
                uv >>= level;
                if (state.tex.z == 1) uv -= 0x8000;
            }
        }
    } else {
        shade = ivec4(inColour * 128.0);
        depth = uint(inDepth.x) * 4096u + uint(inDepth.y);
        if ((state.tex.x & 1) == 1) {
            if (state.tex.y == 2) {
                uv = steppedCoordinate(pixel);
            } else {
                vec2 texels = state.tex.y == 0 ? inTexture.xy : inTexture.xy / inTexture.z * vec2(state.texSize.xy);
                uv = ivec2(floor(texels * 65536.0));
                if (state.tex.z == 1) uv -= 0x8000;
            }
        }
    }

    ivec4 colour = min((shade & 0xffff) >> 7, ivec4(255));
    if ((state.tex.x & 1) == 1) colour = clamp((sampleTexture(uv) * 4 * shade) >> 16, ivec4(0), ivec4(255));
    // AA1 replaces the source alpha: 0x80 inside, the coverage on an edge pixel; the blend then uses it and it is what is written.
    if (state.flags.x == 1) colour.a = inEdge > 0 ? inEdge - 1 : 0x80;

    const bool z24 = (state.addressU.w & 1) != 0, pabe = (state.addressU.w & 2) != 0, fba = (state.addressU.w & 4) != 0, zclamp = (state.addressU.w & 8) != 0;
    // Z24, the oracle's rule (PCSX2's software renderer, not measured on hardware; its zoverflow case is not modelled): the source depth is clamped (not wrapped) to 24 bits when the draw asks for it, the buffer's depth is its low 24 bits, and a write keeps the upper byte.
    if (zclamp) depth = min(depth, 0xffffffu);

    beginInvocationInterlockARB();
    uint stored = imageLoad(depthImage, pixel).r;
    uint compared = z24 ? stored & 0xffffffu : stored;
    bool visible = state.misc.z == 1 || (state.misc.z == 2 && depth >= compared) || (state.misc.z == 3 && depth > compared);
    if (visible) {
        ivec4 result = colour;
        if (state.misc.x == 1 && !(pabe && (colour.a & 0x80) == 0)) {
            ivec4 destination = ivec4(imageLoad(targetImage, pixel));
            int factor = state.blend.z == 0 ? colour.a : state.blend.z == 1 ? destination.a : state.misc.y;
            ivec4 a = term(state.blend.x, colour, destination);
            ivec4 b = term(state.blend.y, colour, destination);
            ivec4 d = term(state.blend.w, colour, destination);
            ivec4 blended = clamp((((a - b) * factor) >> 7) + d, ivec4(0), ivec4(255));
            result.rgb = blended.rgb;
            // PABE: a pixel that blends takes the blended alpha too; without it the source alpha is kept.
            if (pabe) result.a = blended.a;
        }
        if (fba) result.a |= 0x80;
        imageStore(targetImage, pixel, uvec4(result));
        if (state.misc.w == 1 && inEdge == 0) imageStore(depthImage, pixel, uvec4(z24 ? (stored & 0xff000000u) | (depth & 0xffffffu) : depth, 0u, 0u, 0u));
    }
    endInvocationInterlockARB();
}
