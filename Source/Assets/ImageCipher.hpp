#pragma once
#include <array>

#include "Assets/Bytes.hpp"
#include "Assets/ElfImage.hpp"

namespace assets {

// The HDD OSD container decrypt of do_load_resources (HDD OSD 1.10U 0x0020AB98, the loop at 0x0020B030), ported from
// References/model/sound_data.mjs. The tables and the key words are the program's: read from the user's hddosd.elf.
struct CipherTables {
    Bytes expansion, permutation, sboxes, pc1, pc2;
    uint64_t key = 0;
    static CipherTables fromProgram(const ElfImage& program);
};

std::array<uint64_t, 16> keySchedule(const CipherTables& tables);
uint64_t decryptBlock(const CipherTables& tables, const std::array<uint64_t, 16>& keys, uint64_t block);
Bytes decryptImage(View file, const CipherTables& tables);

}
