#include <algorithm>
#include <stdexcept>
#include <string>

#include "Audio/spu2/Spu2.hpp"

namespace audio::spu2 {

namespace {

using nlohmann::json;

uint32_t number(const json& j) {
    if (j.is_string()) return uint32_t(std::stoul(j.get<std::string>(), nullptr, 16));
    if (j.is_boolean()) return j.get<bool>() ? 1 : 0;
    if (j.is_number_integer()) return uint32_t(j.get<int64_t>());
    throw std::runtime_error("spustate: not a number");
}

int32_t signedNumber(const json& j) { return int32_t(number(j)); }

void sweep(VolumeSweep& s, const json& j) {
    s.reg = uint16_t(number(j.at("reg")));
    s.level = signedNumber(j.at("value"));
    s.counter = number(j.at("counter"));
}

void gates(CoreGates& g, const json& j) {
    g.inpL = signedNumber(j.at("inpL"));
    g.inpR = signedNumber(j.at("inpR"));
    g.sndL = signedNumber(j.at("sndL"));
    g.sndR = signedNumber(j.at("sndR"));
    g.extL = signedNumber(j.at("extL"));
    g.extR = signedNumber(j.at("extR"));
}

void restoreVoice(Voice& v, const json& j) {
    sweep(v.left, j.at("volume").at("left"));
    sweep(v.right, j.at("volume").at("right"));
    const json& a = j.at("adsr");
    v.envelope.reg1 = uint16_t(number(a.at("reg1")));
    v.envelope.reg2 = uint16_t(number(a.at("reg2")));
    v.envelope.level = signedNumber(a.at("value"));
    v.envelope.phase = Phase(number(a.at("phase")));
    v.envelope.counter = number(a.at("counter"));
    v.pitch = uint16_t(number(j.at("pitch")));
    v.startAddress = number(j.at("startA"));
    v.loopAddress = number(j.at("loopStartA"));
    v.nextAddress = number(j.at("nextA"));
    v.prev1 = signedNumber(j.at("prev1"));
    v.prev2 = signedNumber(j.at("prev2"));
    v.modulated = number(j.at("modulated")) != 0;
    v.noise = number(j.at("noise")) != 0;
    v.loopMode = int8_t(signedNumber(j.at("loopMode")));
    v.loopFlags = int8_t(signedNumber(j.at("loopFlags")));
    v.phase = signedNumber(j.at("sp"));
    v.outX = signedNumber(j.at("outX"));
    v.fifoRead = number(j.at("decPosRead"));
    v.fifoWrite = number(j.at("decPosWrite"));
    const json& g = j.at("gates");
    v.dryL = signedNumber(g.at("dryL"));
    v.dryR = signedNumber(g.at("dryR"));
    v.wetL = signedNumber(g.at("wetL"));
    v.wetR = signedNumber(g.at("wetR"));
    v.fifo.fill(0);
    v.block.fill(0);
}

void restoreReverb(ReverbRegs& r, const json& j) {
    r.inCoefL = int16_t(signedNumber(j.at("inCoefL")));
    r.inCoefR = int16_t(signedNumber(j.at("inCoefR")));
    r.apf1Size = number(j.at("apf1Size"));
    r.apf2Size = number(j.at("apf2Size"));
    r.apf1Vol = int16_t(signedNumber(j.at("apf1Vol")));
    r.apf2Vol = int16_t(signedNumber(j.at("apf2Vol")));
    r.iirVol = int16_t(signedNumber(j.at("iirVol")));
    r.wallVol = int16_t(signedNumber(j.at("wallVol")));
    r.comb1Vol = int16_t(signedNumber(j.at("comb1Vol")));
    r.comb2Vol = int16_t(signedNumber(j.at("comb2Vol")));
    r.comb3Vol = int16_t(signedNumber(j.at("comb3Vol")));
    r.comb4Vol = int16_t(signedNumber(j.at("comb4Vol")));
    r.sameLSrc = number(j.at("sameLSrc"));
    r.sameRSrc = number(j.at("sameRSrc"));
    r.diffLSrc = number(j.at("diffLSrc"));
    r.diffRSrc = number(j.at("diffRSrc"));
    r.sameLDst = number(j.at("sameLDst"));
    r.sameRDst = number(j.at("sameRDst"));
    r.diffLDst = number(j.at("diffLDst"));
    r.diffRDst = number(j.at("diffRDst"));
    r.comb1LSrc = number(j.at("comb1LSrc"));
    r.comb1RSrc = number(j.at("comb1RSrc"));
    r.comb2LSrc = number(j.at("comb2LSrc"));
    r.comb2RSrc = number(j.at("comb2RSrc"));
    r.comb3LSrc = number(j.at("comb3LSrc"));
    r.comb3RSrc = number(j.at("comb3RSrc"));
    r.comb4LSrc = number(j.at("comb4LSrc"));
    r.comb4RSrc = number(j.at("comb4RSrc"));
    r.apf1LDst = number(j.at("apf1LDst"));
    r.apf1RDst = number(j.at("apf1RDst"));
    r.apf2LDst = number(j.at("apf2LDst"));
    r.apf2RDst = number(j.at("apf2RDst"));
}

void restoreCore(Core& k, const json& j) {
    k.transferAddress = number(j.at("tsa"));
    k.activeTransferAddress = number(j.at("activeTsa"));
    k.irqAddress = number(j.at("irqa"));
    k.irqEnable = number(j.at("irqEnable")) != 0;
    k.fxEnable = number(j.at("fxEnable")) != 0;
    k.mute = number(j.at("mute")) != 0;
    k.autoDmaControl = uint16_t(number(j.at("autoDmaCtrl")));
    k.autoDmaActive = number(j.at("admaInProgress")) != 0;
    k.dmaBits = int8_t(signedNumber(j.at("dmaBits")));
    k.noiseClock = uint8_t(number(j.at("noiseClk")));
    k.noiseCounter = number(j.at("noiseCnt"));
    k.noiseOut = number(j.at("noiseOut"));
    k.keyOn = number(j.at("keyOn"));
    k.keyOff = number(j.at("keyOff"));
    const json& r = j.at("regs");
    k.pmon = number(r.at("pmon"));
    k.non = number(r.at("non"));
    k.vmixl = number(r.at("vmixl"));
    k.vmixr = number(r.at("vmixr"));
    k.vmixel = number(r.at("vmixel"));
    k.vmixer = number(r.at("vmixer"));
    k.endx = number(r.at("endx"));
    k.mmix = uint16_t(number(r.at("mmix")));
    k.statx = uint16_t(number(r.at("statx")));
    k.attr = uint16_t(number(r.at("attr")));
    k.attrBit0 = k.attr & 1;
    k.dmaMode = (k.attr >> 4) & 3;
    sweep(k.masterLeft, j.at("masterVol").at("left"));
    sweep(k.masterRight, j.at("masterVol").at("right"));
    k.extVol = {signedNumber(j.at("extVol")[0]), signedNumber(j.at("extVol")[1])};
    k.inpVol = {signedNumber(j.at("inpVol")[0]), signedNumber(j.at("inpVol")[1])};
    k.fxVol = {signedNumber(j.at("fxVol")[0]), signedNumber(j.at("fxVol")[1])};
    gates(k.dryGate, j.at("dryGate"));
    gates(k.wetGate, j.at("wetGate"));
    k.effectsStart = number(j.at("effectsStartA"));
    k.effectsEnd = number(j.at("effectsEndA"));
    k.reverbPosition = number(j.at("revbSampleBufPos"));
    restoreReverb(k.reverb, j.at("revb"));
    const json& voices = j.at("voices");
    if (voices.size() != 24) throw std::runtime_error("spustate: not 24 voices");
    for (size_t v = 0; v < 24; ++v) restoreVoice(k.voices[v], voices[v]);
    k.down = {};
    k.up = {};
}

}

void Spu2::restore(const Snapshot& snapshot) {
    if (snapshot.ram.size() != kRamBytes || snapshot.regs.size() != kRegBytes) throw std::runtime_error("snapshot: wrong sizes");
    m_ram = snapshot.ram;
    std::copy(snapshot.regs.begin(), snapshot.regs.end(), m_raw.begin());
    const nlohmann::json& s = snapshot.state;
    m_ticks = number(s.at("ticks"));
    m_outPos = uint16_t(number(s.at("outPos")));
    m_playMode = signedNumber(s.at("playMode"));
    const json& sp = s.at("spdif");
    m_spdif = {};
    m_spdif[0] = uint16_t(number(sp.at("out")));
    m_spdif[1] = uint16_t(number(sp.at("info")));
    m_spdif[3] = uint16_t(number(sp.at("mode")));
    m_spdif[4] = uint16_t(number(sp.at("media")));
    m_spdif[6] = uint16_t(number(sp.at("protection")));
    if (s.at("cores").size() != 2) throw std::runtime_error("spustate: not 2 cores");
    for (size_t c = 0; c < 2; ++c) {
        m_core[c] = Core{};
        m_core[c].index = uint32_t(c);
        restoreCore(m_core[c], s.at("cores")[c]);
    }
}

void Spu2::restoreHistory(const assets::Bytes& history) {
    if (history.size() != 2 * 4096) throw std::runtime_error("history: not 8192 bytes");
    size_t at = 0;
    for (Core& core : m_core) {
        for (Voice& v : core.voices) {
            for (int32_t& sample : v.fifo) {
                sample = int32_t(assets::le32(history, at));
                at += 4;
            }
        }
        for (auto* buffers : {&core.down, &core.up}) {
            for (auto& channel : *buffers) {
                for (int16_t& sample : channel) {
                    sample = int16_t(assets::le16(history, at));
                    at += 2;
                }
            }
        }
    }
}

}
