#include "Audio/driver/IopClock.hpp"

#include <algorithm>
#include <stdexcept>
#include <string>

#include "Audio/driver/Memory.hpp"

namespace audio::driver {

namespace {

constexpr uint32_t kRamSize = 0x200000;
constexpr uint32_t kReturnAddress = 0xfffffff0u;
constexpr uint32_t kStack = 0x1f0000;
constexpr uint32_t kTickEntry = uint32_t(kOsdsndBase) + 0x2470;
constexpr uint32_t kCommandEntry = 0x90868;
constexpr uint32_t kCommandBuffer = 0x993d0;
constexpr uint32_t kMemset = uint32_t(kOsdsndBase) + 0x8624;
constexpr uint32_t kMemcpy = uint32_t(kOsdsndBase) + 0x861c;
constexpr uint32_t kDmaCodeFirst = 0x8d200;
constexpr uint32_t kDmaCodeEnd = 0x8d600;
constexpr uint32_t kWaitEventFlag = 0xe090;
constexpr uint32_t kKernelStub = 0x1000;
constexpr uint32_t kImportMagic = 0x41e00000;
constexpr uint32_t kJumpReturn = 0x03e00008;
constexpr uint32_t kEventLibraryWait = 10;
constexpr uint32_t kDmaResumeCycles = 793;
constexpr uint32_t kMultiplyExtra = 7;
constexpr uint32_t kMemsetTickLength = 0x3c;
constexpr uint32_t kMemsetTickCycles = 67;
constexpr uint32_t kInitCommand = 0x6010;
constexpr uint64_t kStepLimit = 50'000'000;

struct InitWindow {
    uint32_t ordinal;
    uint32_t cycles;
};
constexpr InitWindow kInitWindows[] = {{5, 2159}, {10, 540}, {16, 371}, {22, 409}};

bool isIo(uint32_t a) { return (a & 0x1fffffffu) >= 0x1f800000u; }
uint32_t phys(uint32_t a) { return a & 0x1fffffffu; }
bool isControl(uint32_t word) {
    const uint32_t op = word >> 26;
    if (op >= 1 && op <= 7) return true;
    return op == 0 && ((word & 63) == 8 || (word & 63) == 9);
}

}

void addVblankPreemption(std::span<SpuWrite> writes, uint64_t entryCycle, std::span<const uint64_t> vblankCycles) {
    size_t next = size_t(std::lower_bound(vblankCycles.begin(), vblankCycles.end(), entryCycle) - vblankCycles.begin());
    uint64_t shift = 0;
    uint32_t segment = 0;
    for (SpuWrite& w : writes) {
        if (w.resume != segment) {
            segment = w.resume;
            shift = 0;
            while (next < vblankCycles.size() && vblankCycles[next] - entryCycle <= segment) ++next;
        }
        uint64_t t = w.cycle + shift;
        while (next < vblankCycles.size() && vblankCycles[next] - entryCycle <= t) {
            shift += kVblankHandlerCycles;
            t += kVblankHandlerCycles;
            ++next;
        }
        w.cycle = uint32_t(t);
    }
}

IopClock::IopClock(assets::View libsd, assets::View osdsnd, assets::View iop) : m_ram(kRamSize, 0) {
    const auto place = [&](uint32_t at, assets::View data) {
        if (at + data.size() > m_ram.size()) throw std::runtime_error("IOP clock image runs past RAM");
        std::copy(data.begin(), data.end(), m_ram.begin() + at);
    };
    place(uint32_t(kLibsdBase), libsd);
    place(uint32_t(kOsdsndBase), osdsnd);
    place(uint32_t(kSoundIopBase), iop);
    const auto scan = [&](uint32_t from, size_t length) {
        for (uint32_t a = from; a + 4 <= from + length; a += 4) {
            const uint32_t w = uint32_t(m_ram[a]) | uint32_t(m_ram[a + 1]) << 8 | uint32_t(m_ram[a + 2]) << 16 | uint32_t(m_ram[a + 3]) << 24;
            const uint32_t op = w >> 26;
            if (op == 1 || (op >= 4 && op <= 7)) {
                const uint32_t target = a + 4 + uint32_t(int32_t(int16_t(w & 0xffff)) * 4);
                if (target <= a) m_loopHeads.insert(target);
            }
        }
    };
    const auto word = [&](uint32_t a) { return uint32_t(m_ram[a]) | uint32_t(m_ram[a + 1]) << 8 | uint32_t(m_ram[a + 2]) << 16 | uint32_t(m_ram[a + 3]) << 24; };
    const auto link = [&](uint32_t from, size_t length) {
        for (uint32_t a = from; a + 20 <= from + length; a += 4) {
            if (word(a) != kImportMagic) continue;
            const bool events = std::string(reinterpret_cast<const char*>(&m_ram[a + 12]), 7) == "thevent";
            for (uint32_t p = a + 20; p + 8 <= from + length && word(p) == kJumpReturn; p += 8) {
                const uint32_t target = events && (word(p + 4) & 0xffff) == kEventLibraryWait ? kWaitEventFlag : kKernelStub;
                const uint32_t jump = 0x08000000u | (target >> 2);
                for (size_t b = 0; b < 4; ++b) m_ram[p + b] = uint8_t(jump >> (8 * b));
            }
        }
    };
    const auto seedHandle = [&](uint32_t a, uint32_t value) {
        if (word(a) != 0) return;
        for (size_t b = 0; b < 4; ++b) m_ram[a + b] = uint8_t(value >> (8 * b));
    };
    // libsd's module start creates its event flags and keeps the kernel's handles here; a start image built from the file has none, and any nonzero handle serves.
    seedHandle(0x90050, 0x01361521);
    seedHandle(0x90054, 0x01360f23);
    seedHandle(0x90058, 1);
    link(uint32_t(kLibsdBase), libsd.size());
    link(uint32_t(kOsdsndBase), osdsnd.size());
    scan(uint32_t(kLibsdBase), libsd.size());
    scan(uint32_t(kOsdsndBase), osdsnd.size());
    for (const auto& [address, value] : {std::pair<uint32_t, uint16_t>{0x1f9007c0, 0xc032}, {0x1f9007c6, 0x900}, {0x1f9007c8, 0x200}, {0x1f9007ca, 0x8}}) m_values[address] = value;
}

void IopClock::seed(uint32_t address, uint16_t value) { m_values[address] = value; }

HandlerTiming IopClock::tick(std::span<const EnvxRead> envx) { return run(kTickEntry, {}, 0, false, envx); }

HandlerTiming IopClock::command(uint32_t id, const std::array<uint32_t, 5>& words, std::span<const EnvxRead> envx) {
    for (size_t at = 0; at < 4; ++at) m_ram[kCommandBuffer + at] = 0;
    for (size_t k = 0; k < words.size(); ++k)
        for (size_t b = 0; b < 4; ++b) m_ram[kCommandBuffer + 4 + 4 * k + b] = uint8_t(words[k] >> (8 * b));
    const uint32_t args[] = {id, kCommandBuffer, 0x40};
    return run(kCommandEntry, args, id, true, envx);
}

HandlerTiming IopClock::run(uint32_t entry, std::span<const uint32_t> args, uint32_t handlerId, bool isCommand, std::span<const EnvxRead> envx) {
    HandlerTiming out;
    m_out = &out;
    m_envx.clear();
    m_envxLast.clear();
    for (const EnvxRead& e : envx) m_envx[e.core << 8 | e.voice].push_back(e.value);
    for (auto& entry : m_envx) std::reverse(entry.second.begin(), entry.second.end());
    m_count = {};
    m_seen = {};
    m_stubCycles = 0;
    m_ordinal = 0;
    m_dmaOrdinal = 0;
    m_resume = 0;
    m_handlerIsInit = isCommand && handlerId == kInitCommand ? 1 : 0;
    m_boundary = true;
    m_r.fill(0);
    m_r[29] = int32_t(kStack);
    m_r[31] = int32_t(kReturnAddress);
    for (size_t i = 0; i < args.size(); ++i) m_r[4 + i] = int32_t(args[i]);
    m_pc = entry;
    uint64_t steps = 0;
    try {
        while (m_pc != kReturnAddress) {
            step();
            if (++steps > kStepLimit) throw std::runtime_error("IOP clock step limit at pc " + std::to_string(m_pc));
        }
    } catch (...) {
        m_out = nullptr;
        throw;
    }
    out.instructions = m_count.instructions;
    m_out = nullptr;
    return out;
}

void IopClock::enterBlock(uint32_t at) {
    auto it = m_blocks.find(at);
    if (it == m_blocks.end()) it = m_blocks.emplace(at, compile(at)).first;
    m_blockEnd = it->second;
    m_seen = m_count;
}

uint32_t IopClock::compile(uint32_t start) const {
    uint32_t a = start;
    for (;;) {
        if (a != start && (m_blocks.contains(a) || m_loopHeads.contains(a))) return a;
        const uint32_t i = ramIndex(a, 4);
        const uint32_t w = uint32_t(m_ram[i]) | uint32_t(m_ram[i + 1]) << 8 | uint32_t(m_ram[i + 2]) << 16 | uint32_t(m_ram[i + 3]) << 24;
        if (isControl(w)) return a + 8;
        a += 4;
    }
}

uint32_t IopClock::ramIndex(uint32_t address, uint32_t size) const {
    const uint32_t i = address & (kRamSize - 1);
    if (i + size > kRamSize) throw std::runtime_error("IOP clock RAM access out of range");
    return i;
}

void IopClock::step() {
    if (m_pc < uint32_t(kLibsdBase)) {
        stub(m_pc);
        return;
    }
    if (m_boundary || m_pc == m_blockEnd) {
        m_boundary = false;
        enterBlock(m_pc);
    }
    if (m_pc == kMemset || m_pc == kMemcpy) {
        hostFill(m_pc);
        return;
    }
    const uint32_t at = m_pc;
    execute(load(at, 4, false), at);
    m_r[0] = 0;
}

void IopClock::stub(uint32_t at) {
    if (at == kWaitEventFlag && m_dma) {
        const uint32_t now = m_count.instructions + kMultiplyExtra * m_count.multiplies + m_stubCycles;
        if (const auto done = m_dma(m_dmaOrdinal++, now)) {
            const uint32_t resume = *done + kDmaResumeCycles;
            if (resume > now) m_stubCycles += resume - now;
            m_resume = std::max(resume, now);
        }
        ++m_ordinal;
        m_r[2] = 0;
        m_pc = uint32_t(m_r[31]);
        return;
    }
    const uint32_t cost = stubCost({at, uint32_t(m_r[6])}, m_ordinal);
    if (cost == 0) ++m_out->unmodelledStubs;
    m_stubCycles += cost;
    ++m_ordinal;
    m_r[2] = 0;
    m_pc = uint32_t(m_r[31]);
}

void IopClock::hostFill(uint32_t at) {
    const uint32_t cost = stubCost({at, uint32_t(m_r[6])}, m_ordinal);
    if (cost == 0) ++m_out->unmodelledStubs;
    m_stubCycles += cost;
    ++m_ordinal;
    const uint32_t dst = uint32_t(m_r[4]);
    if (at == kMemset) {
        for (int32_t k = 0; k < m_r[6]; ++k) store(dst + uint32_t(k), 1, uint32_t(m_r[5]));
    } else {
        const uint32_t src = uint32_t(m_r[5]);
        for (int32_t k = 0; k < m_r[6]; ++k) store(dst + uint32_t(k), 1, load(src + uint32_t(k), 1, false));
    }
    m_r[2] = m_r[4];
    m_pc = uint32_t(m_r[31]);
}

uint32_t IopClock::stubCost(const Call& call, uint32_t ordinal) const {
    if (call.target == kMemset && call.length == kMemsetTickLength) return kMemsetTickCycles;
    if (m_handlerIsInit)
        for (const InitWindow& w : kInitWindows)
            if (w.ordinal == ordinal) return w.cycles;
    return 0;
}

void IopClock::tally(uint32_t word) {
    ++m_count.instructions;
    if (isControl(word)) m_boundary = true;
    if ((word >> 26) == 0 && ((word & 63) == 0x18 || (word & 63) == 0x19)) ++m_count.multiplies;
}

uint32_t IopClock::mmioRead(uint32_t address) {
    const uint32_t off = address & 0x7ff;
    const uint32_t inCore = off & 0x3ff;
    if ((address >> 16) == 0x1f90 && off < 0x800 && inCore < 0x180 && (inCore & 0xf) == 0xa) {
        const uint32_t core = (off >> 10) & 1;
        const uint32_t voice = inCore >> 4;
        const uint32_t key = core << 8 | voice;
        const auto it = m_envx.find(key);
        if (it != m_envx.end() && !it->second.empty()) {
            const uint16_t value = it->second.back();
            it->second.pop_back();
            m_envxLast[key] = value;
            return value;
        }
        const auto last = m_envxLast.find(key);
        return last == m_envxLast.end() ? 0u : last->second;
    }
    const auto it = m_values.find(address);
    return it == m_values.end() ? 0u : it->second;
}

void IopClock::mmioWrite(uint32_t address, uint32_t value) {
    if (m_pc >= kDmaCodeFirst && m_pc < kDmaCodeEnd) return;
    m_values[address] = uint16_t(value);
    if (m_count.divides != 0) ++m_out->unmeasuredOps;
    if ((address >> 16) == 0x1f90)
        m_out->writes.push_back({address, uint16_t(value), m_seen.instructions + kMultiplyExtra * m_seen.multiplies + m_stubCycles, m_resume});
}

uint32_t IopClock::load(uint32_t address, int size, bool sign) {
    uint32_t v = 0;
    if (isIo(address)) {
        v = mmioRead(phys(address));
        if (size == 1) v &= 0xff;
        else if (size == 2) v &= 0xffff;
    } else {
        const uint32_t i = ramIndex(address, uint32_t(size));
        for (int b = 0; b < size; ++b) v |= uint32_t(m_ram[i + uint32_t(b)]) << (8 * b);
    }
    if (sign && size == 1) return uint32_t(int32_t(int8_t(v)));
    if (sign && size == 2) return uint32_t(int32_t(int16_t(v)));
    return v;
}

void IopClock::store(uint32_t address, int size, uint32_t value) {
    if (isIo(address)) {
        mmioWrite(phys(address), size == 1 ? value & 0xff : size == 2 ? value & 0xffff : value);
        return;
    }
    const uint32_t i = ramIndex(address, uint32_t(size));
    for (int b = 0; b < size; ++b) m_ram[i + uint32_t(b)] = uint8_t(value >> (8 * b));
}

void IopClock::delaySlot(uint32_t at) {
    const uint32_t slot = at + 4;
    const uint32_t word = load(slot, 4, false);
    const uint32_t savedPc = m_pc;
    execute(word, slot);
    m_pc = savedPc;
}

void IopClock::execute(uint32_t word, uint32_t at) {
    tally(word);
    auto& r = m_r;
    const uint32_t op = word >> 26;
    const uint32_t rs = (word >> 21) & 31;
    const uint32_t rt = (word >> 16) & 31;
    const uint32_t rd = (word >> 11) & 31;
    const uint32_t sh = (word >> 6) & 31;
    const uint32_t imm = word & 0xffff;
    const int32_t simm = int32_t(int16_t(imm));
    const uint32_t next = at + 4;
    const auto u = [&](uint32_t reg) { return uint32_t(r[reg]); };
    const auto branch = [&](bool taken, uint32_t to) {
        delaySlot(at);
        m_pc = taken ? to : next + 4;
    };
    const uint32_t branchTarget = next + uint32_t(simm) * 4u;
    switch (op) {
    case 0: {
        const uint32_t fn = word & 63;
        switch (fn) {
        case 0x00: r[rd] = int32_t(u(rt) << sh); break;
        case 0x02: r[rd] = int32_t(u(rt) >> sh); break;
        case 0x03: r[rd] = r[rt] >> sh; break;
        case 0x04: r[rd] = int32_t(u(rt) << (u(rs) & 31)); break;
        case 0x06: r[rd] = int32_t(u(rt) >> (u(rs) & 31)); break;
        case 0x07: r[rd] = r[rt] >> (u(rs) & 31); break;
        case 0x08: {
            const uint32_t to = u(rs);
            delaySlot(at);
            m_pc = to;
            return;
        }
        case 0x09: {
            const uint32_t to = u(rs);
            const int32_t ra = int32_t(at + 8);
            delaySlot(at);
            r[rd] = ra;
            m_pc = to;
            return;
        }
        case 0x10: r[rd] = m_hi; break;
        case 0x11: m_hi = r[rs]; break;
        case 0x12: r[rd] = m_lo; break;
        case 0x13: m_lo = r[rs]; break;
        case 0x18: {
            const int64_t p = int64_t(r[rs]) * int64_t(r[rt]);
            m_lo = int32_t(uint32_t(uint64_t(p)));
            m_hi = int32_t(uint32_t(uint64_t(p) >> 32));
            break;
        }
        case 0x19: {
            const uint64_t p = uint64_t(u(rs)) * uint64_t(u(rt));
            m_lo = int32_t(uint32_t(p));
            m_hi = int32_t(uint32_t(p >> 32));
            break;
        }
        case 0x1a:
            ++m_count.divides;
            if (r[rt] != 0) {
                if (r[rs] == INT32_MIN && r[rt] == -1) {
                    m_lo = INT32_MIN;
                    m_hi = 0;
                } else {
                    m_lo = r[rs] / r[rt];
                    m_hi = r[rs] % r[rt];
                }
            }
            break;
        case 0x1b:
            ++m_count.divides;
            if (r[rt] != 0) {
                m_lo = int32_t(u(rs) / u(rt));
                m_hi = int32_t(u(rs) % u(rt));
            }
            break;
        case 0x20: case 0x21: r[rd] = int32_t(u(rs) + u(rt)); break;
        case 0x22: case 0x23: r[rd] = int32_t(u(rs) - u(rt)); break;
        case 0x24: r[rd] = r[rs] & r[rt]; break;
        case 0x25: r[rd] = r[rs] | r[rt]; break;
        case 0x26: r[rd] = r[rs] ^ r[rt]; break;
        case 0x27: r[rd] = ~(r[rs] | r[rt]); break;
        case 0x2a: r[rd] = r[rs] < r[rt] ? 1 : 0; break;
        case 0x2b: r[rd] = u(rs) < u(rt) ? 1 : 0; break;
        default: throw std::runtime_error("IOP clock: unsupported SPECIAL " + std::to_string(fn) + " at " + std::to_string(at));
        }
        break;
    }
    case 1: {
        const bool neg = (rt & 1) == 0;
        const bool taken = neg ? r[rs] < 0 : r[rs] >= 0;
        const bool link = (rt & 0x10) != 0;
        const int32_t ra = int32_t(at + 8);
        branch(taken, branchTarget);
        if (link) r[31] = ra;
        return;
    }
    case 2:
        delaySlot(at);
        m_pc = (next & 0xf0000000u) | ((word & 0x3ffffff) << 2);
        return;
    case 3: {
        const int32_t ra = int32_t(at + 8);
        delaySlot(at);
        r[31] = ra;
        m_pc = (next & 0xf0000000u) | ((word & 0x3ffffff) << 2);
        return;
    }
    case 4: branch(r[rs] == r[rt], branchTarget); return;
    case 5: branch(r[rs] != r[rt], branchTarget); return;
    case 6: branch(r[rs] <= 0, branchTarget); return;
    case 7: branch(r[rs] > 0, branchTarget); return;
    case 8: case 9: r[rt] = int32_t(u(rs) + uint32_t(simm)); break;
    case 10: r[rt] = r[rs] < simm ? 1 : 0; break;
    case 11: r[rt] = u(rs) < uint32_t(simm) ? 1 : 0; break;
    case 12: r[rt] = int32_t(u(rs) & imm); break;
    case 13: r[rt] = int32_t(u(rs) | imm); break;
    case 14: r[rt] = int32_t(u(rs) ^ imm); break;
    case 15: r[rt] = int32_t(imm << 16); break;
    case 32: r[rt] = int32_t(load(u(rs) + uint32_t(simm), 1, true)); break;
    case 33: r[rt] = int32_t(load(u(rs) + uint32_t(simm), 2, true)); break;
    case 35: r[rt] = int32_t(load(u(rs) + uint32_t(simm), 4, false)); break;
    case 36: r[rt] = int32_t(load(u(rs) + uint32_t(simm), 1, false)); break;
    case 37: r[rt] = int32_t(load(u(rs) + uint32_t(simm), 2, false)); break;
    case 40: store(u(rs) + uint32_t(simm), 1, u(rt)); break;
    case 41: store(u(rs) + uint32_t(simm), 2, u(rt)); break;
    case 43: store(u(rs) + uint32_t(simm), 4, u(rt)); break;
    default: throw std::runtime_error("IOP clock: unsupported opcode " + std::to_string(op) + " at " + std::to_string(at));
    }
    r[0] = 0;
    m_pc = next;
}

}
