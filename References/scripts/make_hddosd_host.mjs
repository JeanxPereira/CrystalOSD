// Make the folder HDD OSD 1.10U boots from in the emulator: a copy of its ELF that looks for its
// resource files on host: instead of rom0:, with the six files from an installed HDD OSD beside
// it. Two changes to data, none to code:
//   - the device prefix string "rom0:" at 0x003486B8 becomes "host:";
//   - the five container entries of the resource table (0x002AD240) get the reader that
//     decrypts, type 5 instead of 2, which is what the program itself does when it runs from
//     the hard disk (the installed containers are encrypted, the ROM's are not).
// node References/scripts/make_hddosd_host.mjs <hddosd.elf> <folder with FNTOSD, JISUCS, ...> <out folder>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [elfFile, install, out] = process.argv.slice(2);
const elf = Buffer.from(fs.readFileSync(elfFile));
const sha1 = crypto.createHash('sha1').update(elf).digest('hex');
if (sha1 !== 'e932f3508313e2807467a0f354acc56869ea77f6') throw new Error(`${elfFile} is not HDD OSD 1.10U (SHA-1 ${sha1})`);
const at = (address) => address - 0x00200000 + 0x1000;
if (elf.toString('latin1', at(0x003486b8), at(0x003486b8) + 6) !== 'rom0:\0') throw new Error('the device prefix is not where it is expected');
elf.write('host:', at(0x003486b8), 'latin1');
let containers = 0;
for (let i = 0; i < 0x73; i++) {
  const type = at(0x002ad240 + i * 16 + 12);
  if ((elf.readUInt32LE(type) & 7) === 2) { elf.writeUInt32LE(((elf.readUInt32LE(type) & ~7) | 5) >>> 0, type); containers += 1; }
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'hddosd.elf'), elf);
for (const name of ['FNTOSD', 'JISUCS', 'SNDIMAGE', 'TEXIMAGE', 'ICOIMAGE', 'SKBIMAGE']) fs.copyFileSync(path.join(install, name), path.join(out, name));
console.log(`${out}: ELF with host: prefix and ${containers} containers on the decrypting reader, six resource files copied`);
