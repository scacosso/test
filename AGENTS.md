# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

NexoCam must support registered and guest access. Email verification is optional and disabled for the current alpha. Keep product capabilities behind named feature flags so a future superuser control panel can enable or disable registration, guest access, email verification, reporting, moderation, and monitoring. The reporting and monitoring panels are planned product surfaces; avoid coupling those capabilities directly to the current static UI.

The superuser connected-users surface is independent from active random-chat rooms. A user who has granted camera access publishes a low-bandwidth presence preview while connected; the superuser sees those users individually and can create a new dedicated room with an available user. Do not implement this workflow by joining or inspecting the user's existing random-chat room, and do not interrupt a user who is already in a call.

The superuser live-monitoring surface is user-centric: show one entry per participant in an active room, provide an actual on-demand preview of the selected participant, and provide a separate two-way Connect action that joins the superuser to that participant's active room. Keep both operations superuser-only, short-lived, justified, and audited, and retain the existing user-facing disclosure that authorized safety review may occur.

The selected super-admin visual direction is `design/reference-superadmin-option-3.png`. Treat its governance-first feature ledger, dark navigation, sparse borders, teal/coral status language, pending-change workflow, and audit visibility as the source of truth for every admin route.

After completing and verifying any project change, create an intentional commit and push it to the current GitHub branch. Report the pushed commit to the user.
