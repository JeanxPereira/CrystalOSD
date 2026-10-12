// Print the skeleton of a spimdisasm .s function: calls, with the small integer arguments set
// just before each, float constants loaded, and data symbols referenced.
// node asm_skeleton.mjs <file.s>
import fs from 'node:fs';

const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const pending = [];
for (const raw of lines) {
  const match = /\/\* [0-9A-F]+ ([0-9A-F]{8}) [0-9A-F]{8} \*\/\s+(.*)$/.exec(raw.trimEnd());
  if (!match) continue;
  const address = match[1].slice(2);
  const text = match[2].replace(/\s+/g, ' ').trim();
  let m;
  if ((m = /^addiu \$(a[0-3]), \$zero, (0x[0-9A-F]+)$/.exec(text))) pending.push(`${m[1]}=${m[2]}`);
  else if ((m = /^daddu \$(a[0-3]), \$zero, \$zero$/.exec(text))) pending.push(`${m[1]}=0`);
  else if ((m = /^lui \$at, \((0x[0-9A-F]+) >> 16\)$/.exec(text))) {
    const bits = Buffer.alloc(4); bits.writeUInt32LE(parseInt(m[1], 16));
    console.log(`${address}   float ${bits.readFloatLE(0)}`);
  } else if ((m = /%gp_rel\((D_[0-9A-F]+)\)/.exec(text))) console.log(`${address}   gp ${m[1]}  (${text.split(' ')[0]})`);
  else if ((m = /^(jal|j) (\w+)$/.exec(text))) { pending.length = Math.min(pending.length, 8); console.log(`${address} ${m[1]} ${m[2]}  [${pending.join(' ')}]`); pending.length = 0; }
}
