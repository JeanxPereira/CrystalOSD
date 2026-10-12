// What verify_sound_menu_senders.mjs saw besides the comparison: counts per site, the a3 and ra values observed, the
// frames on which the sound drain ran. Reported, never compared.
const hex = (v) => `0x${v.toString(16)}`;
const add = (map, key, value) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(value); };

export class Stats {
  constructor() {
    this.sites = new Map();
    this.a3 = new Map();
    this.ra = new Map();
    this.drains = new Map();
    this.frames = new Set();
    this.other = new Map();
    this.predicted = 0;
    this.observed = 0;
  }
  frame(file, number) { this.frames.add(`${file}#${number}`); }
  drain(number) { this.drains.set(number, (this.drains.get(number) ?? 0) + 1); }
  otherCommand(a0) { this.other.set(hex(a0), (this.other.get(hex(a0)) ?? 0) + 1); }
  sent(site, a2, a3Kind, got) {
    this.sites.set(`${site} a2=${a2}`, (this.sites.get(`${site} a2=${a2}`) ?? 0) + 1);
    add(this.a3, `${site}:${a2}:${a3Kind}`, got.a3);
    add(this.ra, `${site}:${a2}`, got.ra);
  }
  report(log) {
    log(`frames ${this.frames.size}; 0x6300 commands predicted ${this.predicted}, observed ${this.observed}; other commands ignored: ${[...this.other].map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}`);
    for (const [site, count] of [...this.sites].sort()) log(`  ${site}: ${count}`);
    for (const [key, set] of [...this.a3].sort()) log(`  a3 ${key}: ${[...set].map(hex).join(' ')}`);
    for (const [key, set] of [...this.ra].sort()) log(`  ra ${key}: ${[...set].map(hex).join(' ')}`);
    const frames = [...this.drains.keys()].sort((a, b) => a - b);
    const gaps = new Map();
    frames.slice(1).forEach((f, i) => gaps.set(f - frames[i], (gaps.get(f - frames[i]) ?? 0) + 1));
    log(`  drain: ${frames.length} frames with a drain of ${this.frames.size}; gaps ${[...gaps].map(([g, n]) => `${g}:${n}`).join(' ') || 'none'}; calls per frame ${[...new Set(this.drains.values())].join(',')}`);
  }
}
