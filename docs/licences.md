# Licences and provenance

Everything in the app that someone else made or that a model generated, with where it came from.

## Before the first music run (owner, once)

- [ ] Read the current **Gemini API Additional Terms** (ai.google.dev/gemini-api/terms) and note here the date read and the sentence on who owns generated content. Google's general wording (checked for images in the design doc §5.11) is that it won't claim ownership; confirm it still applies and covers audio.
- [ ] Check the **price per track** on Google's pricing page. Reported in November 2026 (third-party summaries of that page, not confirmed here): Lyria 3.5 $0.08 a song, Lyria 3 Clip $0.04 a clip. The full plan (13 tracks × 3 takes) is about $3.
- [ ] If anything in the terms is unclear about using the output in a free app and its trailers, stop and tell Claude: the tool can be pointed at Vertex AI instead, whose enterprise terms state commercial use.

Date terms read: ____  ·  Price checked: ____

## Fonts

Big Shoulders Display and Stencil, Courier Prime, IBM Plex Mono, Patrick Hand: SIL Open Font License 1.1 (`www/fonts/licenses/`).

## Images and voices

Generated with Gemini (Nano Banana 2.1; Gemini text-to-speech) on the owner's paid project; see the design doc §5.11 and §9.4. Every image prompt is in `prompts/`; every voice line in `prompts/voice-state.json`.

## Sounds

All cues, foley and room sounds are synthesized in code (`www/engine/audio.js`): no recordings, nothing to license.
