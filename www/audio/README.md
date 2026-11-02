# Audio

- `music/manifest.json` maps `cabinet` and region numbers (`"1"` … `"10"`) to files in `music/`. A region without a file plays a procedural room tone. Brief for composers: `docs/music-brief.md`.
- `voice/manifest.json` maps line keys (`www/engine/voicekey.js`) to files in `voice/<speaker>/`. Written by `tools/generate-voices.mjs`; do not edit by hand.
- Sound effects and cues are synthesized in `www/engine/audio.js`; there are no effect files.
