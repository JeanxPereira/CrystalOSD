// The parity report's raw images as PNG files: ours, the oracle's and their difference, side by side.
//   node tools/parity/side_by_side.mjs <report dir>
import fs from 'node:fs';
import path from 'node:path';
import { png } from '../../References/scripts/extract_buffers.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/parity/side_by_side.mjs <report dir>'); process.exit(2); }
const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
for (const image of report.images) {
  const { width, height } = image;
  const panels = [image.ours, image.oracle, image.difference].map((file) => fs.readFileSync(path.join(dir, file)));
  const out = Buffer.alloc(width * 3 * height * 4);
  for (let y = 0; y < height; y++) for (let p = 0; p < 3; p++) {
    panels[p].copy(out, (y * width * 3 + p * width) * 4, y * width * 4, (y + 1) * width * 4);
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  fs.writeFileSync(path.join(dir, `${image.name}.png`), png(width * 3, height, out));
  console.log(`${image.name}.png`);
}
