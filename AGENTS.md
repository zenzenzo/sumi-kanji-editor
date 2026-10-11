# Sumi contributor notes

## Project

This repository is a React/TypeScript kanji calligraphy editor, not an empty app scaffold. Read README.md for setup, editing behavior, pressure envelopes, and deployment limitations.

- Preserve user path edits and browser storage. Do not reset the definitive 永 template or saved edits during unrelated work.
- Curves, playback, and GIF export must use the same path geometry.
- Keep pressure changes continuous across type transitions; add regression tests for geometry or simulation fixes in scripts/editor.test.mjs.
- Keep README.md, README.ja.md, and README.zh-CN.md consistent when documenting user-facing changes.
- The application uses MIT licensing; stroke data and derived 永 coordinates retain the Arphic Public License in licenses/ARPHICPL.txt.

## Validation

Run npm test, npm run typecheck, npm run lint, and npm run build for source changes. Exercise relevant behavior in the browser. Keep QA captures in screenshots/; only curated examples belong in Git. Never commit generated .vercel/output files or secrets.

## Existing hosting contract

The current hosted version uses Grok platform integrations. Cleanup of authoring guides does not remove runtime requirements:

- Keep the development server on 0.0.0.0:8080 and preserve strictPort.
- Keep startup.sh as the hosted restart entry point; its /workspace path is specific to that host. Keep it idempotent and non-blocking, with no secrets.
- Preserve grokPwaPlugin(), server/middleware/grok-pwa.ts, public/__grok/, and the injected extensions.js script.
- Preserve PreviewHostBridge and its mount in the root document.
- Keep twitter:card metadata and the current favicon/share artwork.
- Preserve the build-gated Nitro Vercel configuration and auth/PGLite helpers used by the running application.
- Branding/remix visibility is controlled by the host's project settings, not CSS that hides the injected controls.

A port to another hosting platform needs corresponding build and authentication changes. Do not treat deletion of the hosting helpers as a complete port.
