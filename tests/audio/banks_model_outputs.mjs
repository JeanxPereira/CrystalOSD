import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [banksFile, expandedDir, outDir] = process.argv.slice(2);
const { parseHd, parseSq } = await import(pathToFileURL(banksFile).href);
const member = (name) => fs.readFileSync(path.join(expandedDir, `${name}.expanded`));
const plain = (value) => JSON.parse(JSON.stringify(value, (key, v) => (key === 'raw' ? undefined : v)));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'hd-BOOT.json'), JSON.stringify(plain(parseHd(member('SNDBOOTH')))));
fs.writeFileSync(path.join(outDir, 'hd-OSDD.json'), JSON.stringify(plain(parseHd(member('SNDOSDDH')))));
for (const n of ['SNDBOOTS', 'SNDTNNLS', 'SNDCLOKS', 'SNDTM30S', 'SNDTM60S', 'SNDLOGOS', 'SNDWARNS', 'SNDRCLKS'])
  fs.writeFileSync(path.join(outDir, `sq-${n}.json`), JSON.stringify(plain(parseSq(member(n)))));
console.log(`banks model outputs written to ${outDir}`);
