// Deterministic sample inputs for the cold start verifiers.
export function sampler(seed = 12345) {
  let state = seed >>> 0;
  return (n) => { state = (Math.imul(state, 0x41c64e6d) + 12345) >>> 0; return (state & 0x7fffffff) % n; };
}
