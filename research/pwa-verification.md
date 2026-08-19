# PWA Verification Notes

## Live Development Verification — 2026-08-19

The live course page loaded with the expected `Hundred Steps to Life` title, the `/manifest.webmanifest` link, and the service worker registered as active and controlling the current page. The browser reported the service-worker scope as the full live project origin.

The active `hundred-steps-life-shell-v2` cache contained the root document and manifest during development. The development document uses Vite’s `/src/main.tsx` entry rather than production’s hashed `/assets/` bundle, so a development cache inspection did not contain an `/assets/` path. The production build was separately checked and contains the manifest and service worker; the worker’s installation logic parses and caches the production document’s `/assets/` entries.

## Remaining QA Constraint

An explicit browser network-off toggle was not available in this environment. The implementation was therefore verified through the live service-worker controller, manifest visibility, service-worker cache presence, syntax validation, production bundle checks, and test/build passes. A real-device or browser DevTools offline reopen remains recommended before public release.

## Island World Visual Verification — 2026-08-19

The live map route was checked after switching the service worker to a network-first update strategy. The completed vector island illustrations now render in the map rather than the earlier failed-generation placeholders. Firstlight Cove is clear and active; future islands use subdued visibility until their route becomes available, preserving the intended progressive-disclosure map hierarchy.

## Completed-Route Verification — 2026-08-19

A sandbox-only completed journal state was used to verify the end-of-course map. All ten island cards reported ten completed waypoints, every inter-island passage displayed as charted, and the connected-world `Final Test` quest became available after the 100th completed day. The sandbox state is confined to the verification browser’s local storage and does not affect user records.

The Final Test quest was opened from the completed-world map. It rendered ten scenario-based questions, each tied to one of the course regions, together with an explicit completion control. The wording focuses on applied judgment and returning to useful principles rather than simple recall.

A sandbox-only passing submission was also verified. The app recorded the assessment as complete, awarded the configured final practice marks once, and displayed the `Route Integrated` completion state with a return path to the connected world.

## Merged-World Asset Verification — 2026-08-19

The completed-course state was rechecked after integrating the dedicated connected-world SVG. Instead of retaining the ordinary grid of ten island cards, full completion now presents one summit-centred landscape with the island forms linked by a shared golden route. The Final Test quest appears in the visual centre of this single-world state, as specified.
