export const meta = {
  name: 'measure-lanes',
  description: 'Runs lanes of measurement tasks: lanes in parallel, tasks of a lane one after the other (they share files). Each task: a fresh lane-worker agent, then a re-refuter on what it claims. Returns per task: claim, evidence, refutation.',
  whenToUse: 'Continuing measurement work that is not one new verifier per item: captures to take, verifiers or the model to extend, branches to stimulate. args: {lanes: [{name, owns: ["paths"], context: "files to read first", tasks: ["..."]}]}.',
  phases: [
    { title: 'Work', detail: 'one worker per task, serial inside a lane' },
    { title: 'Refute', detail: 'one re-refuter per finished task' },
  ],
}

const lanes = (args && Array.isArray(args.lanes)) ? args.lanes : []
if (!lanes.length) return { error: 'args must be {lanes: [{name, owns, context, tasks}]}' }

const RESULT = {
  type: 'object',
  properties: {
    done: { type: 'boolean', description: 'the task is finished and its checks pass' },
    claims: { type: 'array', items: { type: 'string' }, description: 'each verified statement, with the verifier, capture and build that reproduce it' },
    verdicts: { type: 'array', items: { type: 'string' }, description: 'verbatim last lines of the verifier runs' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    capturesTaken: { type: 'array', items: { type: 'string' } },
    open: { type: 'array', items: { type: 'string' }, description: 'what is not closed, and why, with the reason shown from the code where a branch is unreachable' },
  },
  required: ['done', 'claims', 'verdicts', 'filesChanged', 'capturesTaken', 'open'],
}
const VERDICT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'irreproducible'] },
    reason: { type: 'string' },
    output: { type: 'string' },
  },
  required: ['verdict', 'reason', 'output'],
}

const brief = (lane, task) => `You work on one task of the CrystalOSD measurement method (this repository).
Read first: .claude/AGENT_KIT.md, .claude/skills/measure/SKILL.md, then ${lane.context}.
Lane "${lane.name}". You may edit only: ${lane.owns.join(', ')}; and create new files under References/scripts/ whose name starts with the lane's prefix, new captures, new states. Never edit facts/, other verifiers, builds.mjs, lib/, with_emulator.mjs, watson.json, Watson. No commits.
Rules that bite: arithmetic from the disassembly, never fitted; exact floats through ../lib (add/sub/mul/div), never f(a + b); every capture one command through with_emulator.mjs (capture.mjs --mode exact unless the task needs packet origins); keep every existing verdict of the files you touch passing (node References/scripts/run_all.mjs --changed); run mutate.mjs on a verifier you write or change; a branch no run reaches is open, not verified — show from the code why when it is unreachable.
Task: ${task}`

const results = await parallel(lanes.map((lane) => async () => {
  const out = []
  for (let i = 0; i < lane.tasks.length; i++) {
    const task = lane.tasks[i]
    const work = await agent(brief(lane, task), { label: `${lane.name} ${i + 1}`, phase: 'Work', agentType: 'lane-worker', schema: RESULT })
    if (!work) { out.push({ task, work: null }); log(`${lane.name} ${i + 1}: no result`); continue }
    const refute = work.claims.length ? await agent(
      `Claim mode, several claims from one task. For each claim re-run the verifier it names on the capture it names (right CLOCK_BUILD / CLOCK_VIDEO) and check the code it cites; one verdict for the whole set, refuted if any claim is.\nClaims:\n- ${work.claims.join('\n- ')}\nVerdict lines the worker reported:\n- ${work.verdicts.join('\n- ')}`,
      { label: `${lane.name} ${i + 1} refute`, phase: 'Refute', agentType: 're-refuter', schema: VERDICT }) : null
    out.push({ task, work, refute })
    log(`${lane.name} ${i + 1}: ${work.done ? 'done' : 'not done'}, refuter ${refute ? refute.verdict : 'none'}`)
  }
  return { lane: lane.name, tasks: out }
}))

return { lanes: results.filter(Boolean) }
