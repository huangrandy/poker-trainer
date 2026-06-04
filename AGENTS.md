# Project Agent Instructions

## Project status
This project is currently focused on reusable UI components, visual design, CSS, and Framer Motion interactions. It may later expand into a full application.

Prioritize:
1. Correct component behavior
2. Visual polish
3. Simple component APIs
4. Reusability without premature abstraction

## Stack
- React / Next.js
- TypeScript
- Tailwind or CSS modules
- Framer Motion / Motion
- Package manager: [npm/pnpm/bun]
- Test/build commands:
  - [fill in commands]

## Architecture
Use this structure:

src/
  components/
    ui/              # reusable generic UI primitives
    motion/          # reusable motion components
  features/
    [feature-name]/  # app-specific feature slices later
  lib/
    utils/

Current reusable UI components should go in `src/components/`.
Future app-specific flows should go in `src/features/<feature-name>/`.

Do not put feature-specific business logic inside generic UI components.

## UI component rules
For component work:
- Start with static markup and styling before adding animation.
- Keep props minimal.
- Avoid over-generalized APIs.
- Support basic responsive behavior.
- Include hover/focus/active/disabled states when relevant.
- Respect accessibility basics: labels, keyboard behavior, focus states.
- Do not rewrite the design system unless asked.

## Framer Motion rules
Do not one-shot complex interactions.

For animation work, phase implementation:
1. Static layout
2. State model
3. Basic interaction
4. Motion animation
5. Polish and edge cases

For 3D/2.5D card effects:
- Use `perspective` on the parent.
- Use a dedicated tilt layer.
- Use a separate flip layer.
- Use `transform-style: preserve-3d`.
- Use `backface-visibility: hidden` on front/back faces.
- Respect `prefers-reduced-motion`.
- Avoid combining tilt and flip transforms on the same element if it causes transform conflicts.

## Visual verification
For UI/motion tasks, do not claim completion from typecheck alone.

Provide:
1. The route/component to inspect
2. The visual states to test
3. Expected behavior
4. Known limitations

If browser/screenshot tooling is available, use it.

## Planning gate
For multiple components, visual-heavy work, animation, layout systems, or app architecture:
- Explore existing components first.
- Create a phased plan.
- Wait for approval before coding unless I explicitly say “implement now.”
- Implement one phase at a time.

## Future app expansion
When this becomes a full app:
- Put app-specific flows in `src/features/<feature>`.
- Keep shared UI generic.
- Keep business logic out of presentational components.
- Add tests for stateful logic.
- Add architecture notes before major app-level changes.