#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace parity {
enum class GsPrimitive { Triangles, Sprites, Lines };
enum class GsBlendTerm { Source, Destination, Zero };
enum class GsBlendFactor { SourceAlpha, DestinationAlpha, Fixed };
enum class GsDepthTest { Never, Always, GreaterEqual, Greater };
enum class GsAddressMode { Repeat, Clamp, RegionClamp, RegionRepeat };
enum class GsFilter { Nearest, Bilinear };
enum class GsCoordinates { Texel, Projective };
struct GsBlend { GsBlendTerm a, b; GsBlendFactor c; GsBlendTerm d; uint8_t fixed; };
struct GsDepth { GsDepthTest test; bool write; bool z24 = false; };
struct GsAddress { GsAddressMode mode; int32_t min, max; };
struct GsTextureAlpha { bool constant; uint8_t value; bool zeroWhenBlack; bool sixteen = false; uint8_t valueHigh = 0; };
struct GsTexture { std::string source; bool sourceIsTarget; uint32_t width, height; GsCoordinates coordinates; GsAddress addressU, addressV; GsFilter filter; GsTextureAlpha alpha; uint8_t level = 0; };
struct GsScissor { int32_t x0, y0, x1, y1; };
struct GsVertex { float x, y; uint32_t depth; float r, g, b, a; float s, t, q; };
struct GsPass { uint32_t index; std::string name, target; GsPrimitive primitive; GsScissor scissor; std::optional<GsBlend> blend; bool antialias; GsDepth depth; std::optional<GsTexture> texture; std::string skip; std::vector<GsVertex> vertices; bool perPixelAlpha = false; bool alphaCorrection = false; };
struct GsTarget { std::string id; uint32_t width, height; };
struct GsFrame { uint32_t field; std::vector<GsTarget> targets; std::vector<GsPass> passes; uint32_t depthFormat = 0; };
inline void applyDepthFormat(GsFrame& frame) { for (GsPass& pass : frame.passes) pass.depth.z24 = frame.depthFormat == 1; }
}
