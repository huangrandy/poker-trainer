# TDD and SDD Rules

## SDD rules

- Any new feature or behavior change starts by updating a spec.
- If behavior is ambiguous, stop and update the spec before coding.
- For visual or UI work, define manual acceptance criteria before implementation.
- Do not use implementation code as the source of truth for behavior.

## TDD rules

- For engine, bot, and state lifecycle changes, write or update failing tests first.
- Run the relevant tests and confirm they fail for the expected reason before implementation.
- Then implement the smallest change to pass.
- Then run typecheck, tests, and build as needed.
- Do not delete or weaken tests to make them pass.

## UI verification rules

- Unit tests are not enough for layout bugs.
- For UI changes, provide the route or component to inspect, viewport sizes to check, and expected visual behavior.
- Do not claim a UI layout bug is fixed without a manual verification checklist.

## Implementation discipline

- Implement one checklist cluster at a time.
- Do not combine engine, bot, and UI fixes in one patch unless necessary.
- Do not refactor `App.tsx` until regression tests exist for the behavior it orchestrates.
- Commit after each passing stabilization cluster.
