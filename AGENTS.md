# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## OneShowLearn Product Baseline

- OneShowLearn is an AI-native, practice-first learning product under OneShowLab, not a traditional course marketplace.
- Organize the experience around learning paths, real projects, AI tutor guidance, resources, progress, and shipped outcomes.
- Preserve the current warm off-white, minimal, professional SaaS direction with strong typography, violet accents, editorial learning photography, rounded cards, and bilingual brand language.
- The primary web domain is `oneshowlearn.com`.
- The commercial content model is: 60% practical documents, 20% prompts/code/templates, 10% tasks/checklists, and 10% short video demonstrations.
- Treat the six existing learning-path categories as sellable product lines. Each path contains configurable project packs, project steps, content blocks, resources, access rules, price, publication state, and learner entitlements.
- Course and project content must be managed through an admin CMS rather than hard-coded into the learner frontend.
- Keep payment integrations provider-neutral until a specific payment channel is selected; model products, prices, orders, payments, refunds, and entitlements separately.
