#pragma once
#include "Assets/ElfImage.hpp"

namespace assets {

// Whether the ELF is HDD OSD 1.10U's program (the original or the host copy of make_hddosd_host.mjs), whose
// addresses the decode and the text read.
bool isHddOsd110U(const ElfImage& program);
// FNV-1a 64 over the entry point, the loadable segments' addresses and sizes, and their bytes but for the two ranges the
// host copy changes (the resource table 0x002AD240..0x002AD970 and the device prefix 0x003486B8..0x003486BE).
uint64_t programDigest(const ElfImage& program);

}
