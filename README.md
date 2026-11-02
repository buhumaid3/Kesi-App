# Kesi: Kenya Case Files

## Play the region 1 build

```
npm run play          # serves www/ on port 5173; in a Codespace open PORTS → 5173 → globe icon
npm run place         # the same, plus the hotspot placement tool at /place (writes into www/cases/)
npm test              # autoplay: every region 1 case solved by exhaustive play, plus save/load round trips
```

Voices for Mwalimu and Halima (Gemini text-to-speech, same key as the images):

```
node tools/generate-voices.mjs design            # 3 candidate voices each; samples in review/voices/
node tools/generate-voices.mjs pick mwalimu 2    # and: pick halima N
node tools/generate-voices.mjs say mwalimu "Detective. Ngara."
node tools/generate-voices.mjs generate          # every region 1 line (89, ≈ $0.13)
node tools/generate-voices.mjs review            # then /review/voices.html with npm run play
```

Every character's voice (a company of designed voices, cast case by case):

```
node tools/generate-voices.mjs cast                     # free: who speaks with which voice
node tools/generate-voices.mjs design --cast --region 1 # the voices region 1 needs; samples in review/voices/
node tools/generate-voices.mjs generate --region 1      # every line in region 1
```

Depth maps for the 2.5D photos (once: `pip install --break-system-packages torch --index-url https://download.pytorch.org/whl/cpu` then `pip install --break-system-packages transformers pillow`):

```
python3 tools/make-depth.py --region 1
```

Add `?playtest` to the URL to open all ten region 1 cases at once, `?case=7` to jump straight into a case,
`?reset` to start from the prologue with an empty save.

```
www/index.html             the shell (Capacitor-wrapped later)
www/engine/state.js        the case run: pure logic, same unlock rules as tools/validate.mjs (runs in node too)
www/engine/app.js          screens: prologue, cabinet, case desk, places, people, exhibits, notebook, board,
                           phone (hint calls), charge sheet, verdict, Pattern File, settings
www/engine/docs.js         the code-drawn document templates and the case-photo treatment
www/engine/ui.js           sheets, voice-notes, typewriter, stamps, synthesized sounds
www/engine/store.js        the save (localStorage now; @capacitor/preferences in the iOS build)
www/styles/app.css         every game screen, built on tokens.css
tools/serve.mjs            local server for play and placement (no dependencies)
tools/place-hotspots.html  drag each hotspot pin onto the photo, save into the case file
tests/autoplay.mjs         logic test for every region 1 case
tests/ui-smoke.mjs         plays case 1 through the interface on an iPhone-sized screen, saves screenshots
tests/ui-region1.mjs       plays all ten region 1 cases through the interface, start to verdict
```

## Case data and tools

```
www/cases/_campaign.json   regions and their rules, spine threads, recurring cast, lexicon, prologue, between-case beats
www/cases/case-001.json …  one file per case (all 100: Regions 1–10)
tools/validate.mjs         solvability validator (design doc §3.5): run before every build
tools/export-script.mjs    turns the JSON into a readable script (add --player for a spoiler-free version)
tools/compile-prompts.mjs  compiles all 1,127 image prompts from the case data (design doc §5.9) into prompts/
tools/generate-images.mjs  Gemini Nano Banana 2.1 image generation, batch by region (design doc §6)
tools/contrast.mjs         WCAG contrast check of www/styles/tokens.css (docs/contrast.txt)
www/styles/tokens.css      the design tokens (palette, regions, type, shadows, case-photo treatment)
www/styles/sign.css        the sign-painted display treatment (region cards, verdict title, CASE CLOSED)
www/fonts/                 Courier Prime, Big Shoulders, IBM Plex Mono, Patrick Hand (all OFL; licences included)
docs/aesthetic-reference.html  the reference board and reference screen, drawn from the tokens
docs/                      generated scripts for review and blind playtests
```

Run:

```
node tools/validate.mjs www/cases            # every rule, every case; exit code 1 on any error
node tools/export-script.mjs www/cases docs/region-10-case-scripts.md --range 91-100
node tools/export-script.mjs www/cases docs/region-10-player-view.md --player --range 91-100
node tools/compile-prompts.mjs www/cases prompts   # exit 1 if a guardrail fails
node tools/contrast.mjs > docs/contrast.txt        # exit 1 if a required pair fails
npm install                                        # once: @google/genai and sharp
npm run images -- dry-run --region 1               # then pilot, refs, batch, status, fetch, review, redo, continuity, report
```

Image generation needs GEMINI_API_KEY as a Codespaces secret (never in the code). Full steps: design doc §6.

Validator rules implemented: 1 integrity · 2 reachability (simulated play: guarded people stay silent until shown
something in `opensWith`; warrants and records requests can only be served once a `grounds` fact is known) · 3 credibility budget ·
4 proof completeness (proof steps may cite Pattern File pins) · 5 uniqueness by elimination · 6 timeline
consistency (alibis must cover the time of death; overnight windows supported; places can sit inside
other places, and a zone that contains the scene, such as a mast area, is never an alibi) · 7 catchable liars, and every
pressable claim must be on someone's statement sheet · 8 no leak from the OB · 9 guess resistance · 10 region rules
from `_campaign.json`, including liars per case · 11 content policy, Swahili/Sheng glossary coverage, phone-screen
text limits · 12 declared vs measured difficulty, including gated actions · 13 curve check within a region (warning)
· 14 missing images · 15 spine threads, Pattern File pins and spine groups (boss cases and 91–99 only); background
spine details may not be needed to solve an ordinary case · hints present for every group.
16 clock solvability: each case's authored `clockPlan` is replayed against the action hours in `_campaign.json`
(labs return after their hours, detention samples only while detained, one detention at a time, presses on a detained
suspect only inside 24 in-game hours) · 17 the forensic rush is never needed · rule 6 also accepts "present, not the
killer" eliminations backed by a lab or autopsy fact, and skips alibis where `alibisApply: false` gives a reason.
Region 5 adds the WHEN group: a single time window must be the act window and can't overlap a wrong one; a timeline
strip needs 3–5 events, more slots than events, one act event inside the act window, a refutation for every decoy slot
and at least 12 arrangements.
Region 6 adds the WHERE group and the site map: a place word names a location or place; a scene blank's answer
must be the scene (or inside it) and no other option may be; a culprit blank (`subject: "culprit"`, `at: "HH:MM"`)
needs a true where-fact putting the culprit there at that time; a blank with `subject: "other"` needs a `note`; a
blank may take a `pool` of options so two WHERE blanks can share a group (case 60). A case with a `map` must carry a
clockPlan, every map edge must join map nodes, and every visit to a map node needs a `travel` step from the last site
on an existing route, at least as long as the route and inside `clock.travel` (0–3 h). Liars per case: exactly 2.
Region 7 adds documents and the FORGERY group (rule 18): evidence may carry `doc {genuine, forger}`; document words name
document evidence; tell words carry the facts that show them; the answer must be the only forged document among the
options, and the answer tell and every accepted alternative (cases 62, 70) must be proven in the solution; document and
handwriting examinations take 10 lab hours. Lawyered suspects (`stance: "lawyered"`) stay silent in the reachability
simulation until a `reopenedBy` fact is known; the clock plan's `reopen` step costs 0–1 h. Liars per case: 2–3.
Region 8 adds the ABSENCE group (rule 18): locations may carry an `expected[]` list, each item grounded in a
`because` fact; an item marked `present: false` names an absence fact (`absence: true`), and every absence fact must be
on some list. An absence fact becomes known once its location and its grounding fact are known. Absence words name
absence facts; conclusion words carry the facts that prove them; the answer and every accepted alternative (cases 72,
74, 75, 77, 79) must be proven. Every lab result takes 4 extra hours (`labTransportHours`: samples travel to the
county lab), and travel legs may run 0–7 h (`travelHours`). Liars per case: 2–3.
Region 9 adds three groups and joint principals. ACCOMPLICE ("helped by {accomplice}, who {role}"): one person marked
`accomplice` (never the culprit); the name blank has a pool that always offers a `nobody` word; role words carry the
facts that prove them; a person marked `unknowingHelper` is refuted with 2+ facts showing what they knew. PLANTED
("{item} was planted, as shown by {ptell}"): evidence marked `planted {by, frames}`, planted by the culprit or the
accomplice, never framing a culprit; every accepted item must be planted and no other option may be. REAL TARGET ("the
killer meant to kill {target}"): exactly one person marked `intendedTarget`, never the victim. WHO answers must name
every culprit; two culprits need two `unordered` WHO blanks. Alibi checks apply to WHO eliminations only. Liars per case: 3.
Region 10 (the final files) adds no mechanics. Every case has a SPINE group (pins are spine facts from earlier cases,
rule 15) and at least three of the groups taught since region 5; only case 100 may have more than eight groups. Every
accepted pin must be cited in a proof step. Planted evidence may omit `frames` when it frames a story, not a person.
Case 100 alone may have two accomplices, in two ACCOMPLICE groups with distinct answers. Liars per case: 3–4.
