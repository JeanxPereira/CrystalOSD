#include "Parity/GsParityRenderer.hpp"
#include <algorithm>
#include <bit>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <stdexcept>

namespace {

// The oracle's PCSX2 is an SSE4.1 build (_M_SSE 0x401): its scanline steps pixels in blocks of four. The fragment shader
// receives this as specialization constant 0.
constexpr int32_t GsBlockWidth = 4;

struct DrawState { int32_t scissor[4], blend[4], misc[4], tex[4], texSize[4], addressU[4], addressV[4], flags[4]; };
static_assert(sizeof(DrawState) == 128);

// edge: 0 for a filled pixel, or 1 + the alpha of an antialiased edge pixel (coverage >> 9), which writes no depth.
// stepped: a sprite's texture coordinate at its first pixel, its step per pixel (GS units, 1/65536 texel), and that pixel.
// scan/step: a triangle row's values at its first pixel (left) and the triangle's step per pixel, as the GS rasterizer
// computes them; depth start and its step per block of four pixels are doubles, carried as their bits.
struct GpuVertex {
    float x, y, depthHigh, depthLow, r, g, b, a, s, t, q, edge;
    float steppedU, steppedV, stepU, stepV, left, top, pad2[2];
    float scanTexture[4], scanColour[4], stepTexture[4], stepColour[4];
    uint32_t depthStart[2], depthBlock[2];
};
static_assert(sizeof(GpuVertex) == 160);

void check(VkResult result, const char* what) {
    if (result != VK_SUCCESS) throw std::runtime_error(std::string(what) + " failed");
}

VkShaderModule loadShader(VkDevice device, const std::filesystem::path& path) {
    std::ifstream in(path, std::ios::binary | std::ios::ate);
    if (!in) throw std::runtime_error("no shader at " + path.string());
    std::vector<uint32_t> words(size_t(in.tellg()) / 4);
    in.seekg(0);
    in.read(reinterpret_cast<char*>(words.data()), std::streamsize(words.size() * 4));
    VkShaderModuleCreateInfo info{VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO};
    info.codeSize = words.size() * 4;
    info.pCode = words.data();
    VkShaderModule module;
    check(vkCreateShaderModule(device, &info, nullptr, &module), "shader module");
    return module;
}

GpuVertex convert(const parity::GsVertex& v) {
    GpuVertex g{};
    g.x = v.x; g.y = v.y; g.depthHigh = float(v.depth >> 12); g.depthLow = float(v.depth & 0xfff);
    g.r = v.r; g.g = v.g; g.b = v.b; g.a = v.a; g.s = v.s; g.t = v.t; g.q = v.q;
    return g;
}

// A sprite is two corners; colour, depth and Q are the second vertex's. Its texture coordinate follows the GS
// rasterizer: corners sorted per axis, step = (t1 - t0) / (p1 - p0) in floats, start = t0 + step * (first pixel - p0);
// coordinates are 1/65536 texel (UV << 12, or S/Q times 65536 << TW), less half a texel when filtering bilinearly.
void expandSprite(const parity::GsVertex& a, const parity::GsVertex& b, const parity::GsPass& pass, std::vector<GpuVertex>& out) {
    const parity::GsTexture* texture = pass.texture ? &*pass.texture : nullptr;
    float ta[2] = {0, 0}, tb[2] = {0, 0};
    if (texture) {
        if (texture->coordinates == parity::GsCoordinates::Projective) {
            ta[0] = a.s / b.q * float(texture->width << 16); ta[1] = a.t / b.q * float(texture->height << 16);
            tb[0] = b.s / b.q * float(texture->width << 16); tb[1] = b.t / b.q * float(texture->height << 16);
        } else {
            ta[0] = a.s * 65536.0f; ta[1] = a.t * 65536.0f;
            tb[0] = b.s * 65536.0f; tb[1] = b.t * 65536.0f;
        }
        if (texture->filter == parity::GsFilter::Bilinear) for (int i = 0; i < 2; i++) { ta[i] -= 32768.0f; tb[i] -= 32768.0f; }
    }
    const float pa[2] = {a.x, a.y}, pb[2] = {b.x, b.y};
    const int32_t scissorLow[2] = {pass.scissor.x0, pass.scissor.y0};
    float start[2], step[2];
    int32_t first[2];
    for (int i = 0; i < 2; i++) {
        const bool aFirst = pa[i] < pb[i];
        const float p0 = aFirst ? pa[i] : pb[i], p1 = aFirst ? pb[i] : pa[i];
        const float t0 = aFirst ? ta[i] : tb[i], t1 = aFirst ? tb[i] : ta[i];
        first[i] = std::max(int32_t(std::ceil(p0)), scissorLow[i]);
        step[i] = (t1 - t0) / (p1 - p0);
        const float prestep = float(first[i]) - p0;
        const float moved = step[i] * prestep;
        start[i] = t0 + moved;
    }
    auto corner = [&](float x, float y) {
        parity::GsVertex v = b;
        v.x = x; v.y = y;
        GpuVertex g = convert(v);
        g.steppedU = start[0]; g.steppedV = start[1]; g.stepU = step[0]; g.stepV = step[1];
        g.left = float(first[0]); g.top = float(first[1]);
        return g;
    };
    const GpuVertex topLeft = corner(a.x, a.y), topRight = corner(b.x, a.y), bottomLeft = corner(a.x, b.y), bottomRight = corner(b.x, b.y);
    out.insert(out.end(), {topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft});
}


// A vertex as the GS rasterizer holds it: position, depth as a double, texture (S T Q or UV << 12) and colour << 7.
struct SwVertex { float x, y; double z; float t[3]; float c[4]; };

SwVertex operator-(const SwVertex& a, const SwVertex& b) {
    SwVertex v;
    v.x = a.x - b.x; v.y = a.y - b.y; v.z = a.z - b.z;
    for (int i = 0; i < 3; i++) v.t[i] = a.t[i] - b.t[i];
    for (int i = 0; i < 4; i++) v.c[i] = a.c[i] - b.c[i];
    return v;
}

SwVertex operator+(const SwVertex& a, const SwVertex& b) {
    SwVertex v;
    v.x = a.x + b.x; v.y = a.y + b.y; v.z = a.z + b.z;
    for (int i = 0; i < 3; i++) v.t[i] = a.t[i] + b.t[i];
    for (int i = 0; i < 4; i++) v.c[i] = a.c[i] + b.c[i];
    return v;
}

SwVertex operator/(const SwVertex& a, float k) {
    SwVertex v;
    v.x = a.x / k; v.y = a.y / k; v.z = a.z / double(k);
    for (int i = 0; i < 3; i++) v.t[i] = a.t[i] / k;
    for (int i = 0; i < 4; i++) v.c[i] = a.c[i] / k;
    return v;
}

SwVertex operator*(const SwVertex& a, float k) {
    SwVertex v;
    v.x = a.x * k; v.y = a.y * k; v.z = a.z * double(k);
    for (int i = 0; i < 3; i++) v.t[i] = a.t[i] * k;
    for (int i = 0; i < 4; i++) v.c[i] = a.c[i] * k;
    return v;
}

struct Span { int32_t left, top, pixels; SwVertex scan; };

// How a pass's texture coordinates are stepped: integers (FST, or every Q equal), or S T Q floats divided per pixel.
struct TextureSteps { bool integer; bool halfShift; };

TextureSteps textureSteps(const parity::GsPass& pass) {
    if (!pass.texture) return {true, false};
    bool equalQ = true;
    for (const parity::GsVertex& v : pass.vertices) equalQ = equalQ && v.q == pass.vertices.front().q;
    const bool integer = pass.texture->coordinates == parity::GsCoordinates::Texel || (equalQ && pass.texture->level == 0);
    return {integer, integer && pass.texture->level == 0 && pass.texture->filter == parity::GsFilter::Bilinear};
}

SwVertex swVertex(const parity::GsVertex& v, const parity::GsPass& pass, TextureSteps steps) {
    SwVertex out{v.x, v.y, double(v.depth), {0, 0, 0}, {v.r * 128.0f, v.g * 128.0f, v.b * 128.0f, v.a * 128.0f}};
    if (!pass.texture) return out;
    const float width = float((pass.texture->width << pass.texture->level) << 16), height = float((pass.texture->height << pass.texture->level) << 16);
    if (pass.texture->coordinates == parity::GsCoordinates::Texel) {
        out.t[0] = v.s * 65536.0f; out.t[1] = v.t * 65536.0f;
    } else if (steps.integer) {
        out.t[0] = v.s / v.q * width; out.t[1] = v.t / v.q * height; out.t[2] = 1.0f;
    } else {
        out.t[0] = v.s * width; out.t[1] = v.t * height; out.t[2] = v.q;
    }
    if (steps.halfShift) { out.t[0] -= 32768.0f; out.t[1] -= 32768.0f; }
    return out;
}

// One section of a triangle: per row the edges give [ceil(left), ceil(right)) inside the scissor, and the row's values are
// edge + dedge * dy + dscan * prestep, in that order, with dy and prestep measured from p0.
void walkSection(int32_t top, int32_t bottom, const SwVertex& edge, float edgeRight, const SwVertex& dedge, float dedgeRight, const SwVertex& dscan,
                 float p0x, float p0y, const parity::GsScissor& scissor, std::vector<Span>& spans) {
    for (int32_t y = top; y < bottom; y++) {
        const float dy = float(y) - p0y;
        const float left = std::max(std::ceil(edge.x + dedge.x * dy), float(scissor.x0));
        const float right = std::min(std::ceil(edgeRight + dedgeRight * dy), float(scissor.x1 + 1));
        if (int32_t(right) - int32_t(left) <= 0) continue;
        const float prestep = left - p0x;
        Span span{int32_t(left), y, int32_t(right) - int32_t(left), {}};
        span.scan.z = edge.z + dedge.z * double(dy) + dscan.z * double(prestep);
        for (int i = 0; i < 3; i++) span.scan.t[i] = (edge.t[i] + dedge.t[i] * dy) + dscan.t[i] * prestep;
        for (int i = 0; i < 4; i++) span.scan.c[i] = (edge.c[i] + dedge.c[i] * dy) + dscan.c[i] * prestep;
        spans.push_back(span);
    }
}

// GSRasterizer::DrawTriangle (SSE4.1 build): sort by y, step per pixel (dscan) and per row (dedge) from the negated cross
// product, then one or two sections between the rows of the vertices.
bool walkTriangle(const SwVertex* vertex, const parity::GsScissor& scissor, std::vector<Span>& spans, SwVertex& dscan) {
    static const int order[8][3] = {{0, 1, 2}, {1, 0, 2}, {0, 0, 0}, {1, 2, 0}, {0, 2, 1}, {0, 0, 0}, {2, 0, 1}, {2, 1, 0}};
    int m1 = (vertex[0].y > vertex[1].y ? 1 : 0) | (vertex[0].y > vertex[2].y ? 2 : 0) | (vertex[1].y > vertex[2].y ? 4 : 0);
    const SwVertex v[3] = {vertex[order[m1][0]], vertex[order[m1][1]], vertex[order[m1][2]]};
    m1 = (v[0].y == v[1].y ? 1 : 0) | (v[0].y == v[2].y ? 2 : 0) | (v[1].y == v[2].y ? 4 : 0);
    if (m1 == 7) return false;

    const float scissorTop = float(scissor.y0), scissorBottom = float(scissor.y1 + 1);
    const int32_t tb[4] = {int32_t(std::max(std::ceil(v[0].y), scissorTop)), int32_t(std::max(std::ceil(v[1].y), scissorTop)),
                           int32_t(std::min(std::ceil(v[1].y), scissorBottom)), int32_t(std::min(std::ceil(v[2].y), scissorBottom))};

    const SwVertex dv0 = v[1] - v[0], dv1 = v[2] - v[0], dv2 = v[2] - v[1];
    const float cross = dv0.y * dv1.x - dv0.x * dv1.y;
    if (cross == 0.0f) return false;
    const int m2 = std::signbit(cross) ? 1 : 0;

    const float d0 = dv0.x / dv0.y, d1 = dv1.x / dv1.y, d2 = dv2.x / dv2.y;
    const float ddx[3][3] = {{d0, d1, d2}, {d1, d0, d2}, {d0, d2, d1}};
    const float k0 = dv0.x / cross, k1 = dv0.y / cross, k2 = dv1.x / cross, k3 = dv1.y / cross;
    dscan = dv1 * k1 - dv0 * k3;
    SwVertex dedge = dv0 * k2 - dv1 * k0;

    if (m1 & 1) {
        if (tb[1] < tb[3]) {
            const float* slope = ddx[m2 ? 0 : 2];
            dedge.x = slope[1];
            walkSection(tb[0], tb[3], v[1 - m2], v[m2].x, dedge, slope[2], dscan, v[1 - m2].x, v[1 - m2].y, scissor, spans);
        }
    } else {
        if (tb[0] < tb[2]) {
            dedge.x = ddx[m2][0];
            walkSection(tb[0], tb[2], v[0], v[0].x, dedge, ddx[m2][1], dscan, v[0].x, v[0].y, scissor, spans);
        }
        if (tb[1] < tb[3]) {
            SwVertex edge = v[1];
            edge.x = v[0].x + ddx[m2][0] * dv0.y;
            const float edgeRight = v[0].x + ddx[m2][1] * dv0.y;
            const float* slope = ddx[m2 ? 0 : 2];
            dedge.x = slope[1];
            walkSection(tb[1], tb[3], edge, edgeRight, dedge, slope[2], dscan, v[1].x, v[1].y, scissor, spans);
        }
    }
    return true;
}

// One antialiased pixel: where, the edge's values at its major coordinate (clamped as ClampVertex does), and the 16-bit coverage.
struct EdgePixel { int32_t x, y; SwVertex scan; int32_t coverage; };

SwVertex clampedEdge(SwVertex v, double zMax) {
    for (float& c : v.c) c = std::min(std::max(c, 0.0f), 255.0f * 128.0f);
    v.z = std::clamp(v.z, 0.0, zMax);
    return v;
}

// Integer edge function of a triangle, from 12.4 positions: f(X, Y) = x * X + y * Y + c, positive inside.
struct EdgeFunction {
    int64_t x, y, c;
    int64_t at(int32_t px, int32_t py) const { return x * px + y * py + c; }
};

// The minor-axis DDA shared by triangle edges and lines (GSRasterizer.cpp DrawEdgeTriangle, DrawEdgeLine): D is the minor
// coordinate's distance to the pixel centre times scaleD = 512 * |major delta|, kept in [-scaleD / 2, scaleD / 2).
struct EdgeWalk {
    bool stepX, posX, posY;
    int32_t dxi, dyi;
    int32_t scaleD, dD, D, xi, yi;
    SwVertex edge, dedge;

    void start(const SwVertex& a, const SwVertex& dv, float rx0, float ry0) {
        const float major = stepX ? dv.x : dv.y, minor = stepX ? dv.y : dv.x;
        dedge = dv / std::abs(major);
        edge = a;
        scaleD = int32_t(2 * 16 * 16 * std::abs(major));
        dD = int32_t(2 * 16 * 16 * minor);
        D = int32_t(float(scaleD) * (stepX ? (a.y - ry0) : (a.x - rx0)));
        xi = int32_t(rx0);
        yi = int32_t(ry0);
        const float prestep = stepX ? float(dxi) * (rx0 - a.x) : float(dyi) * (ry0 - a.y);
        edge = edge + dedge * prestep;
        D += int32_t(float(dD) * prestep);
        while (D >= scaleD / 2) stepMinor(1);
        while (D < -scaleD / 2) stepMinor(-1);
    }
    void stepMinor(int32_t sign) {
        D -= scaleD * sign;
        (stepX ? yi : xi) += sign;
    }
    void stepMajor() {
        edge = edge + dedge;
        D += dD;
        (stepX ? xi : yi) += stepX ? dxi : dyi;
        if (stepX ? posY : posX) {
            if (D >= scaleD / 2) stepMinor(1);
        } else if (D < -scaleD / 2) {
            stepMinor(-1);
        }
    }
};

EdgeWalk edgeWalk(const SwVertex& dv) {
    EdgeWalk walk{};
    walk.stepX = std::abs(dv.x) >= std::abs(dv.y);
    walk.posX = dv.x >= 0.0f;
    walk.posY = dv.y >= 0.0f;
    walk.dxi = walk.posX ? 1 : -1;
    walk.dyi = walk.posY ? 1 : -1;
    return walk;
}

// GSRasterizer.cpp DrawEdgeTriangle: one pixel per major step from one pixel before a to one past b, the first pixel outside the
// edge on the minor axis, kept if inside the two other edges, the scissor and the edge's box (x not widened, y widened by 1).
// Coverage is 0xffff times 1 - (that pixel's distance to the edge), in doubles.
void walkTriangleEdge(const SwVertex& a, const SwVertex& b, const EdgeFunction& f1, const EdgeFunction& f2, bool tl, const parity::GsScissor& scissor, double zMax, std::vector<EdgePixel>& out) {
    const SwVertex dv = b - a;
    if (dv.x == 0.0f && dv.y == 0.0f) return;
    EdgeWalk walk = edgeWalk(dv);
    const bool side = tl ^ (walk.stepX && dv.y != 0.0f && walk.posX == walk.posY);
    const float rx0 = walk.posX ? std::ceil(a.x - 1.0f) : std::floor(a.x + 1.0f);
    const float ry0 = walk.posY ? std::ceil(a.y - 1.0f) : std::floor(a.y + 1.0f);
    const int32_t rxi1 = int32_t(walk.posX ? std::floor(b.x + 1.0f) : std::ceil(b.x - 1.0f));
    const int32_t ryi1 = int32_t(walk.posY ? std::floor(b.y + 1.0f) : std::ceil(b.y - 1.0f));
    const int32_t bx0 = std::max(int32_t(std::floor(std::min(a.x, b.x))), scissor.x0);
    const int32_t by0 = std::max(int32_t(std::ceil(std::min(a.y, b.y) - 1.0f)), scissor.y0);
    const int32_t bx1 = std::min(int32_t(std::ceil(std::max(a.x, b.x))), scissor.x1);
    const int32_t by1 = std::min(int32_t(std::floor(std::max(a.y, b.y) + 1.0f)), scissor.y1);
    walk.start(a, dv, rx0, ry0);
    const float scaleD = float(walk.scaleD);
    while (true) {
        const float d = float(walk.D) / scaleD;
        int32_t coverage, offset;
        if (d > 0.0f) {
            coverage = int32_t(0xffff * (side ? 1.0 - d : double(d)));
            offset = side ? 0 : 1;
        } else if (d < 0.0f) {
            coverage = int32_t(0xffff * (side ? double(-d) : 1.0 + d));
            offset = side ? -1 : 0;
        } else {
            coverage = tl ? 0 : 0xffff;
            offset = tl ? (side ? -1 : 1) : 0;
        }
        const int32_t x = walk.xi + (walk.stepX ? 0 : offset), y = walk.yi + (walk.stepX ? offset : 0);
        if (f1.at(x, y) > 0 && f2.at(x, y) > 0 && bx0 <= x && x <= bx1 && by0 <= y && y <= by1)
            out.push_back({x, y, clampedEdge(walk.edge, zMax), std::clamp(coverage, 0, 0xffff)});
        if (walk.stepX ? walk.xi == rxi1 : walk.yi == ryi1) break;
        walk.stepMajor();
    }
}

// GSRasterizer.cpp DrawTriangle (edges): the y-sorted vertices' integer edge functions, negated when clockwise, +1 on top-left
// edges, then the edges v0v1, v0v2, v1v2 in that order.
void walkTriangleEdges(const SwVertex* vertex, const parity::GsScissor& scissor, double zMax, std::vector<EdgePixel>& out) {
    static const int order[8][3] = {{0, 1, 2}, {1, 0, 2}, {0, 0, 0}, {1, 2, 0}, {0, 2, 1}, {0, 0, 0}, {2, 0, 1}, {2, 1, 0}};
    const int m1 = (vertex[0].y > vertex[1].y ? 1 : 0) | (vertex[0].y > vertex[2].y ? 2 : 0) | (vertex[1].y > vertex[2].y ? 4 : 0);
    const SwVertex v[3] = {vertex[order[m1][0]], vertex[order[m1][1]], vertex[order[m1][2]]};
    if (v[0].y == v[1].y && v[1].y == v[2].y) return;
    const SwVertex dv0 = v[1] - v[0], dv1 = v[2] - v[0];
    const float cross = dv0.y * dv1.x - dv0.x * dv1.y;
    if (cross == 0.0f) return;
    const bool clockwise = cross < 0.0f;
    const bool tl0 = v[0].y == v[1].y || !clockwise, tl1 = clockwise, tl2 = v[1].y != v[2].y && !clockwise;
    int64_t xy[3][2];
    for (int i = 0; i < 3; i++) { xy[i][0] = int32_t(v[i].x * 16.0f); xy[i][1] = int32_t(v[i].y * 16.0f); }
    auto function = [&](int from, int to, bool bias) {
        EdgeFunction f{(xy[to][1] - xy[from][1]) * 16, -(xy[to][0] - xy[from][0]) * 16, xy[to][0] * xy[from][1] - xy[from][0] * xy[to][1]};
        if (clockwise) f = {-f.x, -f.y, -f.c};
        f.c += bias ? 1 : 0;
        return f;
    };
    const EdgeFunction f0 = function(0, 1, tl0), f1 = function(2, 0, tl1), f2 = function(1, 2, tl2);
    walkTriangleEdge(v[0], v[1], f1, f2, tl0, scissor, zMax, out);
    walkTriangleEdge(v[0], v[2], f2, f0, tl1, scissor, zMax, out);
    walkTriangleEdge(v[1], v[2], f0, f1, tl2, scissor, zMax, out);
}

// GSRasterizer.cpp DrawEdgeLine with AA1: endpoints round to the nearest pixel and the diamond rule decides the first and last;
// per major step the pixel on the line takes 0xffff - cov and its minor neighbour toward the line cov, cov = 0xffff * |D / scaleD|
// in floats.
void walkLine(const SwVertex& a, const SwVertex& b, const parity::GsScissor& scissor, double zMax, std::vector<EdgePixel>& out) {
    const SwVertex dv = b - a;
    EdgeWalk walk = edgeWalk(dv);
    float rx0 = std::floor(a.x + 0.5f), ry0 = std::floor(a.y + 0.5f), rx1 = std::floor(b.x + 0.5f), ry1 = std::floor(b.y + 0.5f);
    auto exits = [&](float ex, float ey) {
        const float distance = std::abs(ex) + std::abs(ey);
        if (distance < 0.5f) return false;
        if (walk.stepX) return (walk.posX ? ex > 0.0f : ex < 0.0f) && (distance > 0.5f || ey >= 0.0f);
        return (walk.posY ? ey > 0.0f : ey < 0.0f) && (distance > 0.5f || ex >= 0.0f);
    };
    const bool first = !exits(a.x - rx0, a.y - ry0), last = exits(b.x - rx1, b.y - ry1);
    if (!first) { rx0 += walk.stepX ? float(walk.dxi) : 0.0f; ry0 += walk.stepX ? 0.0f : float(walk.dyi); }
    if (!last) { rx1 -= walk.stepX ? float(walk.dxi) : 0.0f; ry1 -= walk.stepX ? 0.0f : float(walk.dyi); }
    if ((walk.stepX ? float(walk.dxi) * (rx1 - rx0) : float(walk.dyi) * (ry1 - ry0)) < 0.0f) return;
    const int32_t rxi1 = int32_t(rx1), ryi1 = int32_t(ry1);
    walk.start(a, dv, rx0, ry0);
    const float scaleD = float(walk.scaleD);
    auto add = [&](int32_t x, int32_t y, int32_t coverage) {
        if (scissor.x0 <= x && x <= scissor.x1 && scissor.y0 <= y && y <= scissor.y1) out.push_back({x, y, clampedEdge(walk.edge, zMax), coverage});
    };
    while (true) {
        const float cov = 0xffff * std::abs(float(walk.D) / scaleD);
        const int32_t covi = std::clamp(int32_t(cov), 0, 0xffff);
        const int32_t offset = walk.D >= 0 ? 1 : -1;
        add(walk.xi, walk.yi, 0xffff - covi);
        add(walk.xi + (walk.stepX ? 0 : offset), walk.yi + (walk.stepX ? offset : 0), covi);
        if (walk.stepX ? walk.xi == rxi1 : walk.yi == ryi1) break;
        walk.stepMajor();
    }
}

// GSState::FlushPrim rounds an STQ draw's coordinates down when it is a sprite or every vertex has the same Z: Q loses its
// low 8 bits, S and T their low 9 + (exp(max(S or T, Q)) - exp(S or T)) bits (at most 23).
float roundedDown(float value, int bits) {
    uint32_t u = std::bit_cast<uint32_t>(value);
    u &= ~((1u << std::min(bits, 23)) - 1u);
    return std::bit_cast<float>(u);
}

bool roundsCoordinates(const parity::GsPass& pass) {
    if (!pass.texture || pass.texture->coordinates != parity::GsCoordinates::Projective || pass.vertices.empty()) return false;
    if (pass.primitive == parity::GsPrimitive::Sprites) return true;
    for (const parity::GsVertex& v : pass.vertices) if (v.depth != pass.vertices.front().depth) return false;
    return true;
}

parity::GsPass withRoundedCoordinates(const parity::GsPass& pass) {
    parity::GsPass rounded = pass;
    auto exponent = [](float value) { return int((std::bit_cast<uint32_t>(value) >> 23) & 0xff); };
    for (parity::GsVertex& v : rounded.vertices) {
        const int s = exponent(v.s), t = exponent(v.t), q = exponent(v.q);
        v.s = roundedDown(v.s, 9 + std::max(s, q) - s);
        v.t = roundedDown(v.t, 9 + std::max(t, q) - t);
        v.q = roundedDown(v.q, 8);
    }
    return rounded;
}

uint64_t bitsOf(double value) {
    uint64_t bits;
    std::memcpy(&bits, &value, 8);
    return bits;
}

void pushRow(const GpuVertex& g, int32_t left, int32_t top, int32_t pixels, std::vector<GpuVertex>& out) {
    auto corner = [&](float x, float y) { GpuVertex c = g; c.x = x; c.y = y; return c; };
    const float x0 = float(left) - 0.5f, x1 = float(left + pixels) - 0.5f, y0 = float(top) - 0.5f, y1 = float(top) + 0.5f;
    const GpuVertex topLeft = corner(x0, y0), topRight = corner(x1, y0), bottomLeft = corner(x0, y1), bottomRight = corner(x1, y1);
    out.insert(out.end(), {topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft});
}

// An edge pixel is a row of one pixel whose steps are zero: the scanline takes the edge's values as they are.
std::FILE* edgeTrace() {
    static std::FILE* file = [] { const char* path = std::getenv("CLOCK_EDGE_TRACE"); return path ? std::fopen(path, "w") : nullptr; }();
    return file;
}
const char* g_passName = "";

void pushEdges(const std::vector<EdgePixel>& pixels, std::vector<GpuVertex>& out) {
    for (const EdgePixel& pixel : pixels) {
        if (std::FILE* trace = edgeTrace()) std::fprintf(trace, "%s %d %d %.1f %.1f %d\n", g_passName, pixel.x, pixel.y, pixel.scan.t[0], pixel.scan.t[1], pixel.coverage);
        GpuVertex g{};
        g.left = float(pixel.x);
        g.top = float(pixel.y);
        for (int i = 0; i < 3; i++) g.scanTexture[i] = pixel.scan.t[i];
        for (int i = 0; i < 4; i++) g.scanColour[i] = pixel.scan.c[i];
        const uint64_t depthStart = bitsOf(pixel.scan.z);
        g.depthStart[0] = uint32_t(depthStart); g.depthStart[1] = uint32_t(depthStart >> 32);
        g.edge = float(1 + (pixel.coverage >> 9));
        pushRow(g, pixel.x, pixel.y, 1, out);
    }
}

// Each row becomes a rectangle over exactly its pixels, carrying the row's start and the triangle's steps. With AA1 the
// triangle's edge pixels follow its rows, before the next triangle.
void expandTriangle(const parity::GsVertex* corners, const parity::GsPass& pass, TextureSteps steps, std::vector<GpuVertex>& out) {
    const SwVertex vertex[3] = {swVertex(corners[0], pass, steps), swVertex(corners[1], pass, steps), swVertex(corners[2], pass, steps)};
    std::vector<Span> spans;
    SwVertex dscan;
    if (!walkTriangle(vertex, pass.scissor, spans, dscan)) return;
    const uint64_t depthBlock = bitsOf(dscan.z * double(GsBlockWidth));
    for (const Span& span : spans) {
        GpuVertex g{};
        g.left = float(span.left);
        g.top = float(span.top);
        for (int i = 0; i < 3; i++) { g.scanTexture[i] = span.scan.t[i]; g.stepTexture[i] = dscan.t[i]; }
        g.stepTexture[3] = float(dscan.z);
        for (int i = 0; i < 4; i++) { g.scanColour[i] = span.scan.c[i]; g.stepColour[i] = dscan.c[i]; }
        const uint64_t depthStart = bitsOf(span.scan.z);
        g.depthStart[0] = uint32_t(depthStart); g.depthStart[1] = uint32_t(depthStart >> 32);
        g.depthBlock[0] = uint32_t(depthBlock); g.depthBlock[1] = uint32_t(depthBlock >> 32);
        pushRow(g, span.left, span.top, span.pixels, out);
    }
    if (!pass.antialias) return;
    std::vector<EdgePixel> edges;
    walkTriangleEdges(vertex, pass.scissor, pass.depth.z24 ? 16777215.0 : 4294967295.0, edges);
    pushEdges(edges, out);
}

// An AA1 line is all edge pixels, segment by segment.
void expandLine(const parity::GsVertex& a, const parity::GsVertex& b, const parity::GsPass& pass, TextureSteps steps, std::vector<GpuVertex>& out) {
    std::vector<EdgePixel> pixels;
    walkLine(swVertex(a, pass, steps), swVertex(b, pass, steps), pass.scissor, pass.depth.z24 ? 16777215.0 : 4294967295.0, pixels);
    pushEdges(pixels, out);
}

}  // namespace

GsParityRenderer::GsParityRenderer(const GpuDevice& gpu, const std::filesystem::path& shaderDirectory) : m_gpu(gpu) {
    VkCommandPoolCreateInfo pool{VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO};
    pool.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
    pool.queueFamilyIndex = gpu.queueFamily;
    check(vkCreateCommandPool(gpu.device, &pool, nullptr, &m_pool), "command pool");
    VkCommandBufferAllocateInfo commands{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO};
    commands.commandPool = m_pool;
    commands.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    commands.commandBufferCount = 1;
    check(vkAllocateCommandBuffers(gpu.device, &commands, &m_commands), "command buffer");

    VkSamplerCreateInfo sampler{VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO};
    sampler.magFilter = sampler.minFilter = VK_FILTER_NEAREST;
    sampler.addressModeU = sampler.addressModeV = sampler.addressModeW = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    check(vkCreateSampler(gpu.device, &sampler, nullptr, &m_sampler), "sampler");

    const VkDescriptorSetLayoutBinding bindings[3] = {
        {0, VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, 1, VK_SHADER_STAGE_FRAGMENT_BIT, nullptr},
        {1, VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, 1, VK_SHADER_STAGE_FRAGMENT_BIT, nullptr},
        {2, VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, 1, VK_SHADER_STAGE_FRAGMENT_BIT, nullptr},
    };
    VkDescriptorSetLayoutCreateInfo setLayout{VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO};
    setLayout.bindingCount = 3;
    setLayout.pBindings = bindings;
    check(vkCreateDescriptorSetLayout(gpu.device, &setLayout, nullptr, &m_setLayout), "set layout");

    const VkPushConstantRange range{VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT, 0, sizeof(DrawState)};
    VkPipelineLayoutCreateInfo layout{VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO};
    layout.setLayoutCount = 1;
    layout.pSetLayouts = &m_setLayout;
    layout.pushConstantRangeCount = 1;
    layout.pPushConstantRanges = &range;
    check(vkCreatePipelineLayout(gpu.device, &layout, nullptr, &m_layout), "pipeline layout");

    const VkDescriptorPoolSize sizes[2] = {{VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, 2}, {VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, 1}};
    VkDescriptorPoolCreateInfo descriptors{VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO};
    descriptors.maxSets = 1;
    descriptors.poolSizeCount = 2;
    descriptors.pPoolSizes = sizes;
    check(vkCreateDescriptorPool(gpu.device, &descriptors, nullptr, &m_descriptors), "descriptor pool");
    VkDescriptorSetAllocateInfo set{VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO};
    set.descriptorPool = m_descriptors;
    set.descriptorSetCount = 1;
    set.pSetLayouts = &m_setLayout;
    check(vkAllocateDescriptorSets(gpu.device, &set, &m_set), "descriptor set");

    const VkShaderModule vertex = loadShader(gpu.device, shaderDirectory / "GsParity.vert.spv");
    const VkShaderModule fragment = loadShader(gpu.device, shaderDirectory / "GsParity.frag.spv");
    m_triangles = createPipeline(VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST, vertex, fragment);
    m_lines = createPipeline(VK_PRIMITIVE_TOPOLOGY_LINE_LIST, vertex, fragment);
    vkDestroyShaderModule(gpu.device, vertex, nullptr);
    vkDestroyShaderModule(gpu.device, fragment, nullptr);

    m_blank = createImage(1, 1, VK_FORMAT_R8G8B8A8_UINT);
    const uint8_t zero[4] = {0, 0, 0, 0};
    upload(m_blank, zero, 4);
}

GsParityRenderer::~GsParityRenderer() {
    vkDeviceWaitIdle(m_gpu.device);
    for (auto& [id, image] : m_targets) destroyImage(image);
    for (auto& [id, image] : m_textures) destroyImage(image);
    destroyImage(m_depth);
    destroyImage(m_blank);
    vkDestroyPipeline(m_gpu.device, m_triangles, nullptr);
    vkDestroyPipeline(m_gpu.device, m_lines, nullptr);
    vkDestroyDescriptorPool(m_gpu.device, m_descriptors, nullptr);
    vkDestroyPipelineLayout(m_gpu.device, m_layout, nullptr);
    vkDestroyDescriptorSetLayout(m_gpu.device, m_setLayout, nullptr);
    vkDestroySampler(m_gpu.device, m_sampler, nullptr);
    vkDestroyCommandPool(m_gpu.device, m_pool, nullptr);
}

VkPipeline GsParityRenderer::createPipeline(VkPrimitiveTopology topology, VkShaderModule vertex, VkShaderModule fragment) {
    const VkSpecializationMapEntry blockWidthEntry{0, 0, sizeof(GsBlockWidth)};
    const VkSpecializationInfo blockWidth{1, &blockWidthEntry, sizeof(GsBlockWidth), &GsBlockWidth};
    const VkPipelineShaderStageCreateInfo stages[2] = {
        {VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO, nullptr, 0, VK_SHADER_STAGE_VERTEX_BIT, vertex, "main", nullptr},
        {VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO, nullptr, 0, VK_SHADER_STAGE_FRAGMENT_BIT, fragment, "main", &blockWidth},
    };
    const VkVertexInputBindingDescription binding{0, sizeof(GpuVertex), VK_VERTEX_INPUT_RATE_VERTEX};
    const VkVertexInputAttributeDescription attributes[12] = {
        {0, 0, VK_FORMAT_R32G32_SFLOAT, offsetof(GpuVertex, x)},
        {1, 0, VK_FORMAT_R32G32_SFLOAT, offsetof(GpuVertex, depthHigh)},
        {2, 0, VK_FORMAT_R32G32B32A32_SFLOAT, offsetof(GpuVertex, r)},
        {3, 0, VK_FORMAT_R32G32B32_SFLOAT, offsetof(GpuVertex, s)},
        {4, 0, VK_FORMAT_R32G32B32A32_SFLOAT, offsetof(GpuVertex, steppedU)},
        {5, 0, VK_FORMAT_R32G32_SFLOAT, offsetof(GpuVertex, left)},
        {6, 0, VK_FORMAT_R32G32B32A32_SFLOAT, offsetof(GpuVertex, scanTexture)},
        {7, 0, VK_FORMAT_R32G32B32A32_SFLOAT, offsetof(GpuVertex, scanColour)},
        {8, 0, VK_FORMAT_R32G32B32A32_SFLOAT, offsetof(GpuVertex, stepTexture)},
        {9, 0, VK_FORMAT_R32G32B32A32_SFLOAT, offsetof(GpuVertex, stepColour)},
        {10, 0, VK_FORMAT_R32G32B32A32_UINT, offsetof(GpuVertex, depthStart)},
        {11, 0, VK_FORMAT_R32_SFLOAT, offsetof(GpuVertex, edge)},
    };
    VkPipelineVertexInputStateCreateInfo input{VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO};
    input.vertexBindingDescriptionCount = 1;
    input.pVertexBindingDescriptions = &binding;
    input.vertexAttributeDescriptionCount = 12;
    input.pVertexAttributeDescriptions = attributes;
    VkPipelineInputAssemblyStateCreateInfo assembly{VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO};
    assembly.topology = topology;
    VkPipelineViewportStateCreateInfo viewport{VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO};
    viewport.viewportCount = 1;
    viewport.scissorCount = 1;
    VkPipelineRasterizationStateCreateInfo raster{VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO};
    raster.polygonMode = VK_POLYGON_MODE_FILL;
    raster.cullMode = VK_CULL_MODE_NONE;
    raster.lineWidth = 1.0f;
    VkPipelineMultisampleStateCreateInfo multisample{VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO};
    multisample.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;
    VkPipelineColorBlendStateCreateInfo blend{VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO};
    const VkDynamicState dynamics[2] = {VK_DYNAMIC_STATE_VIEWPORT, VK_DYNAMIC_STATE_SCISSOR};
    VkPipelineDynamicStateCreateInfo dynamic{VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO};
    dynamic.dynamicStateCount = 2;
    dynamic.pDynamicStates = dynamics;
    VkPipelineRenderingCreateInfo rendering{VK_STRUCTURE_TYPE_PIPELINE_RENDERING_CREATE_INFO};

    VkGraphicsPipelineCreateInfo info{VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO};
    info.pNext = &rendering;
    info.stageCount = 2;
    info.pStages = stages;
    info.pVertexInputState = &input;
    info.pInputAssemblyState = &assembly;
    info.pViewportState = &viewport;
    info.pRasterizationState = &raster;
    info.pMultisampleState = &multisample;
    info.pColorBlendState = &blend;
    info.pDynamicState = &dynamic;
    info.layout = m_layout;
    VkPipeline pipeline;
    check(vkCreateGraphicsPipelines(m_gpu.device, VK_NULL_HANDLE, 1, &info, nullptr, &pipeline), "pipeline");
    return pipeline;
}

void GsParityRenderer::submit(const std::function<void(VkCommandBuffer)>& record) {
    check(vkResetCommandBuffer(m_commands, 0), "reset");
    VkCommandBufferBeginInfo begin{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO};
    begin.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    check(vkBeginCommandBuffer(m_commands, &begin), "begin");
    VkMemoryBarrier2 order{VK_STRUCTURE_TYPE_MEMORY_BARRIER_2};
    order.srcStageMask = VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT;
    order.srcAccessMask = VK_ACCESS_2_MEMORY_WRITE_BIT;
    order.dstStageMask = VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT;
    order.dstAccessMask = VK_ACCESS_2_MEMORY_READ_BIT | VK_ACCESS_2_MEMORY_WRITE_BIT;
    VkDependencyInfo orderDependency{VK_STRUCTURE_TYPE_DEPENDENCY_INFO};
    orderDependency.memoryBarrierCount = 1;
    orderDependency.pMemoryBarriers = &order;
    vkCmdPipelineBarrier2(m_commands, &orderDependency);
    record(m_commands);
    check(vkEndCommandBuffer(m_commands), "end");
    VkSubmitInfo info{VK_STRUCTURE_TYPE_SUBMIT_INFO};
    info.commandBufferCount = 1;
    info.pCommandBuffers = &m_commands;
    check(vkQueueSubmit(m_gpu.queue, 1, &info, VK_NULL_HANDLE), "submit");
    check(vkQueueWaitIdle(m_gpu.queue), "wait");
}

GsParityRenderer::Image GsParityRenderer::createImage(uint32_t width, uint32_t height, VkFormat format) {
    Image image;
    image.width = width;
    image.height = height;
    image.format = format;
    VkImageCreateInfo info{VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO};
    info.imageType = VK_IMAGE_TYPE_2D;
    info.format = format;
    info.extent = {width, height, 1};
    info.mipLevels = 1;
    info.arrayLayers = 1;
    info.samples = VK_SAMPLE_COUNT_1_BIT;
    info.usage = VK_IMAGE_USAGE_STORAGE_BIT | VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT;
    VmaAllocationCreateInfo allocation{};
    allocation.usage = VMA_MEMORY_USAGE_AUTO;
    check(vmaCreateImage(m_gpu.allocator, &info, &allocation, &image.image, &image.allocation, nullptr), "image");
    VkImageViewCreateInfo view{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO};
    view.image = image.image;
    view.viewType = VK_IMAGE_VIEW_TYPE_2D;
    view.format = format;
    view.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
    check(vkCreateImageView(m_gpu.device, &view, nullptr, &image.view), "image view");

    // Every image stays in the general layout: it is stored to, fetched from and copied.
    submit([&](VkCommandBuffer cmd) {
        VkImageMemoryBarrier2 barrier{VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2};
        barrier.dstStageMask = VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT;
        barrier.dstAccessMask = VK_ACCESS_2_MEMORY_READ_BIT | VK_ACCESS_2_MEMORY_WRITE_BIT;
        barrier.oldLayout = VK_IMAGE_LAYOUT_UNDEFINED;
        barrier.newLayout = VK_IMAGE_LAYOUT_GENERAL;
        barrier.image = image.image;
        barrier.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
        VkDependencyInfo dependency{VK_STRUCTURE_TYPE_DEPENDENCY_INFO};
        dependency.imageMemoryBarrierCount = 1;
        dependency.pImageMemoryBarriers = &barrier;
        vkCmdPipelineBarrier2(cmd, &dependency);
    });
    return image;
}

void GsParityRenderer::destroyImage(Image& image) {
    if (image.view) vkDestroyImageView(m_gpu.device, image.view, nullptr);
    if (image.image) vmaDestroyImage(m_gpu.allocator, image.image, image.allocation);
    image = {};
}

GsParityRenderer::Buffer GsParityRenderer::createBuffer(VkDeviceSize size, VkBufferUsageFlags usage) {
    Buffer buffer;
    VkBufferCreateInfo info{VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO};
    info.size = size;
    info.usage = usage;
    VmaAllocationCreateInfo allocation{};
    allocation.usage = VMA_MEMORY_USAGE_AUTO;
    allocation.flags = VMA_ALLOCATION_CREATE_HOST_ACCESS_RANDOM_BIT | VMA_ALLOCATION_CREATE_MAPPED_BIT;
    VmaAllocationInfo made{};
    check(vmaCreateBuffer(m_gpu.allocator, &info, &allocation, &buffer.buffer, &buffer.allocation, &made), "buffer");
    buffer.mapped = made.pMappedData;
    return buffer;
}

void GsParityRenderer::upload(const Image& image, const void* data, size_t bytes) {
    Buffer staging = createBuffer(bytes, VK_BUFFER_USAGE_TRANSFER_SRC_BIT);
    std::memcpy(staging.mapped, data, bytes);
    vmaFlushAllocation(m_gpu.allocator, staging.allocation, 0, VK_WHOLE_SIZE);
    submit([&](VkCommandBuffer cmd) {
        VkBufferImageCopy region{};
        region.imageSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
        region.imageExtent = {image.width, image.height, 1};
        vkCmdCopyBufferToImage(cmd, staging.buffer, image.image, VK_IMAGE_LAYOUT_GENERAL, 1, &region);
    });
    vmaDestroyBuffer(m_gpu.allocator, staging.buffer, staging.allocation);
}

std::vector<uint8_t> GsParityRenderer::download(const Image& image, size_t bytes) {
    Buffer staging = createBuffer(bytes, VK_BUFFER_USAGE_TRANSFER_DST_BIT);
    submit([&](VkCommandBuffer cmd) {
        VkBufferImageCopy region{};
        region.imageSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
        region.imageExtent = {image.width, image.height, 1};
        vkCmdCopyImageToBuffer(cmd, image.image, VK_IMAGE_LAYOUT_GENERAL, staging.buffer, 1, &region);
        VkMemoryBarrier2 toHost{VK_STRUCTURE_TYPE_MEMORY_BARRIER_2};
        toHost.srcStageMask = VK_PIPELINE_STAGE_2_TRANSFER_BIT;
        toHost.srcAccessMask = VK_ACCESS_2_TRANSFER_WRITE_BIT;
        toHost.dstStageMask = VK_PIPELINE_STAGE_2_HOST_BIT;
        toHost.dstAccessMask = VK_ACCESS_2_HOST_READ_BIT;
        VkDependencyInfo dependency{VK_STRUCTURE_TYPE_DEPENDENCY_INFO};
        dependency.memoryBarrierCount = 1;
        dependency.pMemoryBarriers = &toHost;
        vkCmdPipelineBarrier2(cmd, &dependency);
    });
    vmaInvalidateAllocation(m_gpu.allocator, staging.allocation, 0, VK_WHOLE_SIZE);
    std::vector<uint8_t> out(bytes);
    std::memcpy(out.data(), staging.mapped, bytes);
    vmaDestroyBuffer(m_gpu.allocator, staging.buffer, staging.allocation);
    return out;
}

GsParityRenderer::Image& GsParityRenderer::place(std::map<std::string, Image>& where, const std::string& id, uint32_t width, uint32_t height, VkFormat format) {
    Image& image = where[id];
    if (image.width != width || image.height != height) {
        destroyImage(image);
        image = createImage(width, height, format);
    }
    return image;
}

void GsParityRenderer::setTarget(const std::string& id, uint32_t width, uint32_t height, std::span<const uint8_t> rgba) {
    if (rgba.size() != size_t(width) * height * 4) throw std::runtime_error("target " + id + ": wrong number of bytes");
    upload(place(m_targets, id, width, height, VK_FORMAT_R8G8B8A8_UINT), rgba.data(), rgba.size());
}

void GsParityRenderer::setTexture(const std::string& id, uint32_t width, uint32_t height, std::span<const uint8_t> rgba) {
    if (rgba.size() != size_t(width) * height * 4) throw std::runtime_error("texture " + id + ": wrong number of bytes");
    upload(place(m_textures, id, width, height, VK_FORMAT_R8G8B8A8_UINT), rgba.data(), rgba.size());
}

void GsParityRenderer::setDepth(uint32_t width, uint32_t height, std::span<const uint32_t> depth) {
    if (depth.size() != size_t(width) * height) throw std::runtime_error("depth: wrong number of values");
    if (m_depth.width != width || m_depth.height != height) {
        destroyImage(m_depth);
        m_depth = createImage(width, height, VK_FORMAT_R32_UINT);
    }
    upload(m_depth, depth.data(), depth.size() * 4);
}

std::vector<uint8_t> GsParityRenderer::readTarget(const std::string& id) {
    const Image& image = m_targets.at(id);
    return download(image, size_t(image.width) * image.height * 4);
}

std::vector<uint32_t> GsParityRenderer::readDepth() {
    const std::vector<uint8_t> bytes = download(m_depth, size_t(m_depth.width) * m_depth.height * 4);
    std::vector<uint32_t> out(bytes.size() / 4);
    std::memcpy(out.data(), bytes.data(), bytes.size());
    return out;
}

void GsParityRenderer::draw(const parity::GsPass& given) {
    g_passName = given.name.c_str();
    const parity::GsPass rounded = roundsCoordinates(given) ? withRoundedCoordinates(given) : parity::GsPass{};
    const parity::GsPass& pass = roundsCoordinates(given) ? rounded : given;
    if (!pass.skip.empty()) throw std::logic_error(pass.name + " cannot be drawn: " + pass.skip);
    const auto target = m_targets.find(pass.target);
    if (target == m_targets.end()) throw std::runtime_error(pass.name + ": no target " + pass.target);
    if (!m_depth.image) throw std::runtime_error(pass.name + ": no depth buffer set");
    if (target->second.width > m_depth.width || target->second.height > m_depth.height) throw std::runtime_error(pass.name + ": the target is larger than the depth buffer");

    const Image* texture = &m_blank;
    if (pass.texture) {
        if (pass.texture->sourceIsTarget && pass.texture->source == pass.target) throw std::runtime_error(pass.name + " reads the target it draws into");
        const auto& where = pass.texture->sourceIsTarget ? m_targets : m_textures;
        const auto found = where.find(pass.texture->source);
        if (found == where.end()) throw std::runtime_error(pass.name + ": no texture " + pass.texture->source);
        texture = &found->second;
    }

    const bool sprites = pass.primitive == parity::GsPrimitive::Sprites;
    const bool triangles = pass.primitive == parity::GsPrimitive::Triangles;
    const bool antialiasedLines = pass.primitive == parity::GsPrimitive::Lines && pass.antialias;
    const bool projective = pass.texture && pass.texture->coordinates == parity::GsCoordinates::Projective;
    const TextureSteps steps = textureSteps(pass);
    std::vector<GpuVertex> vertices;
    if (sprites) {
        if (pass.vertices.size() % 2) throw std::runtime_error(pass.name + ": odd number of sprite corners");
        for (size_t i = 0; i < pass.vertices.size(); i += 2) expandSprite(pass.vertices[i], pass.vertices[i + 1], pass, vertices);
    } else if (triangles) {
        if (pass.vertices.size() % 3) throw std::runtime_error(pass.name + ": vertices are not whole triangles");
        for (size_t i = 0; i < pass.vertices.size(); i += 3) expandTriangle(&pass.vertices[i], pass, steps, vertices);
    } else if (antialiasedLines) {
        if (pass.vertices.size() % 2) throw std::runtime_error(pass.name + ": odd number of line ends");
        for (size_t i = 0; i < pass.vertices.size(); i += 2) expandLine(pass.vertices[i], pass.vertices[i + 1], pass, steps, vertices);
    } else {
        for (const parity::GsVertex& v : pass.vertices) vertices.push_back(convert(v));
    }
    if (vertices.empty()) return;

    DrawState state{};
    state.scissor[0] = pass.scissor.x0; state.scissor[1] = pass.scissor.y0; state.scissor[2] = pass.scissor.x1; state.scissor[3] = pass.scissor.y1;
    if (pass.blend) {
        state.blend[0] = int(pass.blend->a); state.blend[1] = int(pass.blend->b); state.blend[2] = int(pass.blend->c); state.blend[3] = int(pass.blend->d);
        state.misc[0] = 1;
        state.misc[1] = pass.blend->fixed;
    }
    state.misc[2] = int(pass.depth.test);
    state.misc[3] = pass.depth.write ? 1 : 0;
    // The oracle's Z24 rule (PCSX2 software renderer; hardware behaviour unmeasured): sprites always clamp, other primitives when the draw's largest Z exceeds 24 bits.
    bool zClamp = pass.depth.z24 && sprites;
    if (pass.depth.z24 && !sprites) for (const parity::GsVertex& v : pass.vertices) zClamp = zClamp || v.depth > 0xffffffu;
    state.addressU[3] = (pass.depth.z24 ? 1 : 0) | (pass.perPixelAlpha ? 2 : 0) | (pass.alphaCorrection ? 4 : 0) | (zClamp ? 8 : 0);
    if (pass.texture) {
        const parity::GsTexture& t = *pass.texture;
        state.tex[0] = 1 | (int(t.level) << 8);
        if (t.level && !(triangles || antialiasedLines)) throw std::logic_error(pass.name + ": a mip level is drawn on triangles and antialiased lines only");
        state.tex[1] = sprites ? 2 : (triangles || antialiasedLines) ? (steps.integer ? 0 : 1) : projective ? 1 : 0;
        state.tex[2] = int(t.filter);
        state.tex[3] = t.alpha.sixteen ? 2 : t.alpha.constant ? 1 : 0;
        state.texSize[0] = int(t.width); state.texSize[1] = int(t.height); state.texSize[2] = t.alpha.value; state.texSize[3] = t.alpha.zeroWhenBlack ? 1 : 0;
        state.addressU[0] = int(t.addressU.mode); state.addressU[1] = t.addressU.min; state.addressU[2] = t.addressU.max;
        state.addressV[0] = int(t.addressV.mode); state.addressV[1] = t.addressV.min; state.addressV[2] = t.addressV.max; state.addressV[3] = t.alpha.valueHigh;
    }
    state.flags[0] = pass.antialias && !sprites ? 1 : 0;
    state.flags[1] = int(target->second.width);
    state.flags[2] = int(target->second.height);
    state.flags[3] = triangles || antialiasedLines ? 1 : 0;

    const VkDescriptorImageInfo images[3] = {
        {VK_NULL_HANDLE, target->second.view, VK_IMAGE_LAYOUT_GENERAL},
        {VK_NULL_HANDLE, m_depth.view, VK_IMAGE_LAYOUT_GENERAL},
        {m_sampler, texture->view, VK_IMAGE_LAYOUT_GENERAL},
    };
    VkWriteDescriptorSet writes[3]{};
    for (uint32_t i = 0; i < 3; i++) {
        writes[i].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        writes[i].dstSet = m_set;
        writes[i].dstBinding = i;
        writes[i].descriptorCount = 1;
        writes[i].descriptorType = i < 2 ? VK_DESCRIPTOR_TYPE_STORAGE_IMAGE : VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        writes[i].pImageInfo = &images[i];
    }
    vkUpdateDescriptorSets(m_gpu.device, 3, writes, 0, nullptr);

    Buffer buffer = createBuffer(vertices.size() * sizeof(GpuVertex), VK_BUFFER_USAGE_VERTEX_BUFFER_BIT);
    std::memcpy(buffer.mapped, vertices.data(), vertices.size() * sizeof(GpuVertex));
    vmaFlushAllocation(m_gpu.allocator, buffer.allocation, 0, VK_WHOLE_SIZE);

    const VkExtent2D extent{target->second.width, target->second.height};
    submit([&](VkCommandBuffer cmd) {
        VkRenderingInfo rendering{VK_STRUCTURE_TYPE_RENDERING_INFO};
        rendering.renderArea = {{0, 0}, extent};
        rendering.layerCount = 1;
        vkCmdBeginRendering(cmd, &rendering);
        vkCmdBindPipeline(cmd, VK_PIPELINE_BIND_POINT_GRAPHICS, pass.primitive == parity::GsPrimitive::Lines && !antialiasedLines ? m_lines : m_triangles);
        const VkViewport viewport{0, 0, float(extent.width), float(extent.height), 0, 1};
        const VkRect2D scissor{{0, 0}, extent};
        vkCmdSetViewport(cmd, 0, 1, &viewport);
        vkCmdSetScissor(cmd, 0, 1, &scissor);
        vkCmdPushConstants(cmd, m_layout, VK_SHADER_STAGE_VERTEX_BIT | VK_SHADER_STAGE_FRAGMENT_BIT, 0, sizeof(DrawState), &state);
        vkCmdBindDescriptorSets(cmd, VK_PIPELINE_BIND_POINT_GRAPHICS, m_layout, 0, 1, &m_set, 0, nullptr);
        const VkDeviceSize offset = 0;
        vkCmdBindVertexBuffers(cmd, 0, 1, &buffer.buffer, &offset);
        vkCmdDraw(cmd, uint32_t(vertices.size()), 1, 0, 0);
        vkCmdEndRendering(cmd);
    });
    vmaDestroyBuffer(m_gpu.allocator, buffer.buffer, buffer.allocation);
}
