export const meta = {
  name: 'measure-campaign',
  description: 'For each function or question: re-scout → verifier-writer (captures, mutation, run_all) → two re-refuters → returns question → verifier → verdicts → refutations. Facts pages are written afterwards by the session.',
  whenToUse: 'A list of PS2 OSD functions or questions to turn into verified facts; Jean opted in to multi-agent work. args: {items: ["func_002365D0 refracted emitter: ...", ...], limit: 3}.',
  phases: [
    { title: 'Scout', detail: 'one re-scout per item (read-only)' },
    { title: 'Verify', detail: 'verifier-writer: verifier, captures, mutation, manifest' },
    { title: 'Refute', detail: 'two re-refuters with different lenses' },
  ],
}

const items = (args && Array.isArray(args.items)) ? args.items : []
if (!items.length) return { error: 'args must be {items: ["<function or question>", ...]}' }
const LIMIT = (args && args.limit) || 3
let active = 0
const waiting = []
async function slot(fn) {
  if (active >= LIMIT) await new Promise(r => waiting.push(r))
  else active++
  try { return await fn() } finally { const next = waiting.shift(); if (next) next(); else active-- }
}

const SCOUT = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    hdd: { type: 'string', description: 'HDD OSD 1.10U address(es)' },
    rom: { type: 'string', description: 'ROM 2.30 address(es), or why none' },
    computes: { type: 'string', description: 'operation order as read, with instruction addresses' },
    probes: { type: 'string', description: 'pc and ranges per build a verifier needs' },
    positiveControl: { type: 'string' },
    open: { type: 'array', items: { type: 'string' } },
  },
  required: ['question', 'hdd', 'rom', 'computes', 'probes', 'positiveControl', 'open'],
}
const VERIFIER = {
  type: 'object',
  properties: {
    verifier: { type: 'string', description: 'path of the verifier' },
    rule: { type: 'string' },
    verdicts: { type: 'array', items: { type: 'string' }, description: 'capture, build, verbatim verdict line' },
    mutation: { type: 'string', description: 'score and every survivor with its explanation' },
    manifest: { type: 'array', items: { type: 'string' } },
    passed: { type: 'boolean', description: 'every verdict FOUND on both builds and no unexplained survivor' },
    open: { type: 'array', items: { type: 'string' } },
  },
  required: ['verifier', 'rule', 'verdicts', 'mutation', 'manifest', 'passed', 'open'],
}
const VERDICT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'irreproducible'] },
    reason: { type: 'string' },
    output: { type: 'string', description: 'commands run and their output, trimmed' },
  },
  required: ['verdict', 'reason', 'output'],
}
const LENSES = [
  'the arithmetic: read the instructions yourself and check operation order, constants, comparison polarity and branch selection against the verifier',
  'the evidence: re-run the verifier on every capture it names, on both builds, and run mutate.mjs on it; a comparison it does not make or a branch no capture reaches refutes "verified"',
]

const results = await pipeline(items,
  (item, _o, i) => slot(() => agent(
    `Scout this question for the CrystalOSD measurement method: ${item}`,
    { label: `scout ${i + 1}`, phase: 'Scout', agentType: 're-scout', schema: SCOUT })),
  (scout, item, i) => scout && slot(() => agent(
    `Write the verifier for this item. Item: ${item}\nScout report (verify what you use; a premise is a claim, not a fact):\n${JSON.stringify(scout, null, 2)}`,
    { label: `verifier ${i + 1}`, phase: 'Verify', agentType: 'verifier-writer', schema: VERIFIER }))
    .then(v => ({ scout, verifier: v })),
  (done, item, i) => done && done.verifier && parallel(LENSES.map((lens, k) => () => agent(
    `Claim mode. Claim: "${done.verifier.rule}" is verified by ${done.verifier.verifier} with these verdicts: ${done.verifier.verdicts.join(' | ')}. Lens: ${lens}. Default when in doubt: irreproducible.`,
    { label: `refute ${i + 1}.${k + 1}`, phase: 'Refute', agentType: 're-refuter', schema: VERDICT })))
    .then(votes => ({ item, ...done, refutations: votes.filter(Boolean) })),
)

const out = results.filter(Boolean).map(r => ({
  item: r.item,
  verifier: r.verifier && r.verifier.verifier,
  passed: !!(r.verifier && r.verifier.passed),
  confirmed: (r.refutations || []).filter(v => v.verdict === 'confirmed').length,
  refutations: r.refutations,
  rule: r.verifier && r.verifier.rule,
  open: [...((r.scout && r.scout.open) || []), ...((r.verifier && r.verifier.open) || [])],
}))
const dropped = items.length - out.length
if (dropped) log(`${dropped} items ended without a result (agent skipped or failed)`)
return { results: out, dropped }
