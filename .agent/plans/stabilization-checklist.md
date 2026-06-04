# Stabilization Checklist

## 1. Specs completed

- [x] Finalize current MVP acceptance criteria in `SPEC_CURRENT_MVP.md`
  - Why it matters: gives one source of truth before any code changes.
  - Files likely affected: `SPEC_CURRENT_MVP.md`, `TASKS.md`, `ARCHITECTURE.md`
  - Verification command: `sed -n '1,260p' SPEC_CURRENT_MVP.md`
  - Blocks future features: yes
- [x] Align docs with current stabilization phase
  - Why it matters: prevents future sessions from following stale startup-era guidance.
  - Files likely affected: `.agent/plans/activeContext.md`, `.agent/plans/progress.md`, `.agent/plans/systemPatterns.md`
  - Verification command: `sed -n '1,200p' .agent/plans/activeContext.md && sed -n '1,200p' .agent/plans/progress.md && sed -n '1,200p' .agent/plans/systemPatterns.md`
  - Blocks future features: yes

## 2. Regression tests to add

- [x] Add engine tests for hand lifecycle edge cases
  - Why it matters: protects dealer/button rotation, reset behavior, and `hand_complete` logic.
  - Files likely affected: `src/features/game-engine/engine.test.ts` or a new lifecycle test file
  - Verification command: `npm test -- src/features/game-engine/engine.test.ts`
  - Blocks future features: yes
- [x] Add bot tests for auto-advance stop conditions
  - Why it matters: prevents bots from skipping the hero or looping forever.
  - Files likely affected: `src/features/bots/simpleBot.test.ts`
  - Verification command: `npm test -- src/features/bots/simpleBot.test.ts`
  - Blocks future features: yes
- [x] Add integration tests for state progression across hands
  - Why it matters: catches lifecycle bugs that unit tests miss.
  - Files likely affected: new engine lifecycle/integration test file
  - Verification command: `npm test`
  - Blocks future features: yes

## 3. Engine/state lifecycle fixes

- [x] Fix any failing tests around `startHand`, `startNextHand`, and `applyAction`
  - Why it matters: these are the highest-risk state transitions.
  - Files likely affected: `src/features/game-engine/engine.ts`
  - Verification command: `npm test && npm run typecheck`
  - Blocks future features: yes
- [x] Verify the engine rejects invalid actions instead of silently accepting them
  - Why it matters: legality must stay centralized in the engine.
  - Files likely affected: `src/features/game-engine/engine.ts`, `src/features/game-engine/engine.test.ts`
  - Verification command: `npm test`
  - Blocks future features: yes

## 4. Bot loop fixes

- [x] Confirm bots stop when the hero is current actor
  - Why it matters: preserves human control.
  - Files likely affected: `src/features/bots/simpleBot.ts`, `src/features/bots/simpleBot.test.ts`
  - Verification command: `npm test -- src/features/bots/simpleBot.test.ts`
  - Blocks future features: yes
- [x] Confirm bots stop on `hand_complete`
  - Why it matters: prevents stale auto-advance behavior after a hand ends.
  - Files likely affected: `src/features/bots/simpleBot.ts`, `src/features/bots/simpleBot.test.ts`
  - Verification command: `npm test -- src/features/bots/simpleBot.test.ts`
  - Blocks future features: yes

## 5. UI display/layout fixes

- [x] Add manual visual acceptance criteria for the table layout
  - Why it matters: seat overlap and readability issues are not fully covered by unit tests.
  - Files likely affected: `SPEC_CURRENT_MVP.md`, `src/styles.css`, `src/App.tsx`
  - Verification command: manual browser inspection
  - Blocks future features: yes
- [x] Confirm action history labels remain readable and clearly attributed
  - Why it matters: the table view is a trainer, so feedback must be understandable.
  - Files likely affected: `src/App.tsx`, `src/styles.css`
  - Verification command: manual browser inspection
  - Blocks future features: no

## 6. Architecture boundary cleanup

- [ ] Delay any `App.tsx` refactor until behavior is covered by regression tests
  - Why it matters: `App.tsx` currently mixes rendering and orchestration.
  - Files likely affected: `src/App.tsx`
  - Verification command: `npm test && npm run typecheck`
  - Blocks future features: yes
- [ ] Revisit whether UI-only helpers should move out of `App.tsx`
  - Why it matters: reduces coupling once stabilization tests exist.
  - Files likely affected: `src/App.tsx`, future `src/components/*`
  - Verification command: `npm test && npm run typecheck`
  - Blocks future features: no

## 7. Deferred/non-blocking items

- [x] Update roadmap/task docs after stabilization work lands
  - Why it matters: keeps project planning aligned with actual progress.
  - Files likely affected: `TASKS.md`, `ROADMAP.md`, `ARCHITECTURE.md`
  - Verification command: doc review only
  - Blocks future features: no
- [ ] Improve UI polish after layout stability is locked down
  - Why it matters: polish is easier once behavior is stable.
  - Files likely affected: `src/styles.css`
  - Verification command: manual browser inspection
  - Blocks future features: no
