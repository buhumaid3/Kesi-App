# Kesi: Kenya Case Files — Game Design Document

Status: build phase (planning complete 2 November 2026). Build brief: `claude/kenya-detective-game-build-prompt.md`.

| # | Deliverable | Status |
|---|---|---|
| 1 | Name + positioning | APPROVED |
| 2 | Core mechanics spec | APPROVED (+ presentation direction added, §2.13) |
| 3 | Case data schema + solvability validator | APPROVED |
| 4 | Spine story outline | APPROVED |
| 5 | 100-case master list | APPROVED (`claude/kesi-case-master-list.md`) |
| 6 | Full case files, region by region | APPROVED: all 100 cases, Regions 1–10 (`claude/kesi-repo/www/cases/`; readable scripts `claude/kesi-region-NN-case-scripts.md`) |
| 7 | Aesthetic concept + master image style prompt | APPROVED (§5; image production runbook §6) |
| 8 | Repo name | APPROVED (§7): `Kesi-App` |
| B1 | Region 1 playable vertical slice | IN REVIEW (§8) |
| B2 | Stage 1 polish: tips, case intros, music and cues, voices for Mwalimu and Halima | IN REVIEW (§9) |
| B3 | Motion, every screen size, voices for every character, 2.5D depth | IN REVIEW (§10) |

## 1. Name + positioning (APPROVED)

**Kesi: Kenya Case Files.** *Kesi* is Swahili for a police or court case.

Kesi is a deduction-first detective game set across real Kenya, from River Road to the Mara to the Northern frontier. The player solves 100 original murder cases by reasoning, not by tapping hidden objects or picking the killer from a list: reading mobile-money logs, catching a witness in a lie against a matatu fare receipt, building the case on a corkboard until the evidence forces one answer. A story running underneath links all 100 cases. Free, no ads, no pay-to-solve hints. Every crime is fiction; the streets, the slang and the way the evidence works are authentically Kenyan.

---

## 2. Core mechanics spec (APPROVED)

### 2.1 The case loop

Every case, from case 1 to case 100, runs the same six beats. Difficulty changes what is inside each beat, never the shape.

| Beat | What the player does | In-world frame |
|---|---|---|
| 1. **OB entry** | Reads the initial report: who, where, when found, by whom | The station's Occurrence Book, with an OB number stamped on the case folder |
| 2. **Scene** | Inspects the crime scene (tap hotspots), collects evidence cards | Scene sketch + photos in the folder |
| 3. **Investigate** | Visits locations, interviews people, requests records and forensics | A map of the case's locations + the detective's phone |
| 4. **Board** | Optionally arranges evidence and draws connections | Corkboard above the desk |
| 5. **Charge sheet** | Fills in the deduction blanks and submits | A charge sheet sent to the prosecutor |
| 6. **Verdict** | Sees the reconstruction of what really happened, gets the stars | The prosecutor's ruling + a short reconstruction scene |

The player can save and quit at any point inside a case and resume exactly where they were, including mid-interrogation. Lesson from the Chalkline competitor research: resume failures are the first thing reviews punish.

### 2.2 Evidence and facts (the foundation of everything)

- **Evidence cards** are the things the player collects: a body, a phone, a statement, a mobile-money statement, a receipt, an autopsy report, a title deed.
- **Card types** (each introduced at a set point in the campaign, see §2.10): Physical · Witness statement · Document · Phone & mobile money · Forensic · CCTV/photo.
- **Facts** are the atomic, checkable statements inside a card: "Sent KSh 4,500 to 0712… at 21:47", "Fare receipt: Ngara → Kencom, 20:15", "Wound angle suggests a left-handed attacker".
- Facts are **auto-logged to the notebook** the moment the player reads them. The player never has to copy anything down; the skill is in *combining* facts, not finding the right sentence to tap.
- Every fact has an ID. The deduction sheet, the interrogation system and the solvability validator all work on fact IDs (§3).

### 2.3 The deduction system (the core of the game)

Modelled on *The Case of the Golden Idol* and *Return of the Obra Dinn*, adapted for phone screens.

**The charge sheet.** A short paragraph with blanks:

> On the night of **[WHEN]**, **[WHO]** killed **[VICTIM]** at **[WHERE]** using **[HOW]**, because **[WHY]**.

- Blanks are filled by dragging **words from a word bank**. Words only appear in the bank when the player has *discovered* them (a suspect's name after meeting them, a weapon after finding it, a motive after uncovering it). This prevents the bank itself from leaking the answer, and stops brute-forcing on undiscovered options.
- **Blanks are grouped.** Early cases: one group (WHO). Mid: two or three groups (WHO + HOW / WHY). Late: several groups including WHEN, WHERE, accomplices, the real target, and a timeline strip.
- **Batch confirmation.** When the player submits, the prosecutor confirms only **whole groups that are fully correct**. A group with any wrong blank gets "doesn't hold up" with no indication of which blank is wrong. This is what makes guessing expensive and reasoning rewarding.
- **Diegetic feedback.** The prosecutor speaks in character: *"The who and the how stand up. The motive won't survive a defence lawyer."* That's the same information as Golden Idol's "2 of 3 correct" rule, delivered as story.
- **Timeline blanks (from region 5):** drag events onto a clock strip in order, with times. Used for alibi-breaking cases.

**Why not multiple choice:** a list of three suspects tells the player there are three suspects and that one is correct. A word bank built from discovery means the player first has to realise *which* names, methods and motives are even relevant.

### 2.4 Interrogation

Each suspect has a **statement**: a short list of claims ("I was at the chama meeting until ten", "I never lent him money").

- The player can **ask about topics** (people, places, items they've discovered) to get more claims.
- The player can **press a claim with evidence**: pick a claim, present a fact that contradicts it. A correct contradiction breaks the claim, and the suspect reacts (a new, truer claim, a new fact, sometimes a new suspect or location).
- A **wrong presentation** (the fact doesn't contradict the claim) costs credibility (§2.5). No penalty for asking topics.
- Suspects have a **stance** that changes the texture of the conversation: *Cooperative* (answers freely), *Guarded* (only gives claims when pressed with evidence), *Lawyered up* (from region 7; won't talk until the player presents a fact strong enough to reopen the conversation).
- **Witnesses lie** from region 2 onwards, at first one detectable liar per case, later several. A liar is always catchable by cross-referencing facts; the game never requires the player to "sense" a lie.

The interrogation screen is the most important screen to make feel tense: tight framing on the suspect, the desk lamp, the player's evidence fanned out in front of them, a short beat of silence before the suspect responds to a correct contradiction.

### 2.5 Credibility (the detective's standing)

A per-case resource, shown as **stamps on the case folder** (default 5).

**Spent by:** a wrong contradiction in interrogation (−1), a wrong charge submission (−1).

**Spent on (gated actions, real Kenyan procedure fictionalised):**
- **Records request** (phone/mobile-money statements): needs a court order, which costs 1 stamp. Introduced region 3.
- **Search warrant** (search a suspect's home): 1 stamp. Introduced region 2.
- **Forensic rush** (lab results now instead of later in the case): 1 stamp. Introduced region 4.

**No softlocks.** If credibility hits zero, the case is never lost. The detective's superior takes over the gated actions, which still happen but cost the case its stars (max 1 star). The player always finishes every case.

**Arrest clock (soft).** From region 4: once the player detains a suspect, a 24-hour clock starts, reflecting Kenya's constitutional rule that a detained person must be brought before a court within 24 hours. Every investigation action advances the clock. If it runs out, the suspect is released and the player must finish without being able to re-interrogate them. It never fails the case outright; it rewards investigating *before* detaining.

### 2.6 Corkboard

- Free-form: drag evidence cards and suspect photos onto the cork, draw red string between them, add sticky notes.
- **Never graded.** The board is a thinking tool; only the charge sheet is checked. Grading the board would turn it into busywork.
- The board persists per case and is part of save state.
- From region 5: a **timeline rail** along the bottom of the board, where cards can be pinned to times. This is the visual companion to timeline blanks.

### 2.7 Notebook

- Auto-logged facts, grouped by **person / place / time / evidence**. Searchable.
- Facts that contradict each other are **not** flagged automatically. Spotting that is the player's job.
- The **glossary** lives here: every Swahili and Sheng word used in dialogue, tap-to-define, with a toggle in settings to show inline definitions for players who want them.

### 2.8 Hints

Hints are free, unlimited and never sold. They are delivered in-world as **calls to the mentor** (the spine story's mentor character, see deliverable 4).

Three tiers per charge-sheet group, each a separate call:

1. **"Where to look"**: names the evidence card or person that matters for this group.
2. **"What to notice"**: highlights the two facts that, put together, answer the group.
3. **"The answer"**: fills one blank in the group.

Cost is in stars only: a tier-1 or tier-2 hint caps the case at 2 stars; a tier-3 hint caps it at 1 star. Players who are stuck can always finish; players who want three stars have to earn them.

### 2.9 Scoring

| Rating | Requirement |
|---|---|
| ★★★ Commended | Solved with at most 1 wrong charge submission, no hints, credibility above zero |
| ★★ Closed | Solved with tier-1/tier-2 hints, or 2–3 wrong submissions |
| ★ Closed (by the book) | Solved by any route, including tier-3 hints or zero credibility |

- **No speed scoring.** Speed rewards in deduction games push players to guess.
- Stars gate **nothing** in the main path. Solving case N unlocks case N+1, regardless of stars. Stars count towards cosmetic rewards only (desk items, folder styles), so a completionist has a goal and nobody is blocked.
- Each region's boss case unlocks that region's **collectible** (an object for the detective's desk tied to the spine story).

### 2.10 Mechanic introduction curve

New mechanics arrive one region at a time, so case 1 is approachable and case 100 uses everything.

| Region | Cases | New mechanic introduced |
|---|---|---|
| 1 Nairobi CBD | 1–10 | Scene, notebook, charge sheet with one group (WHO). Physical + witness evidence. "Physical" includes found paper (receipts, tickets, registers, logbooks, notes); official records obtained by request start in region 3. No checkable false statements: suspects tell the truth or flatly deny; specific lies start in region 2 |
| 2 Eastlands | 11–20 | Interrogation contradictions, one liar per case, search warrants, credibility |
| 3 Mombasa Old Town | 21–30 | Phone and mobile-money records, records requests, WHY group |
| 4 Rift Valley / Nakuru | 31–40 | Forensics and autopsy, forensic rush, arrest clock, HOW group |
| 5 Kisumu & Lake Victoria | 41–50 | Timeline blanks and timeline rail, WHEN group |
| 6 Maasai Mara | 51–60 | Multi-location cases, travel between sites, WHERE group |
| 7 Mt Kenya / Nyeri | 61–70 | Document fraud (title deeds, wills), several liars, "lawyered up" suspects |
| 8 Northern frontier | 71–80 | Scarce evidence, deducing from what is *missing* (a fact that should exist but doesn't) |
| 9 Westlands / Karen / Runda | 81–90 | Multiple culprits, accomplices, framed suspects, "real target" blanks |
| 10 The Final Files | 91–100 | No new mechanics. Hardest combinations, spine story resolution |

### 2.11 Session length targets

| Cases | Target time |
|---|---|
| 1–10 | 5–10 minutes |
| 11–40 | 10–20 minutes |
| 41–80 | 20–35 minutes |
| 81–100 | 30–60 minutes (boss cases may be longer) |

### 2.12 Accessibility

- No timing, motion or precision requirements anywhere. The arrest clock counts actions, not real seconds.
- All information is conveyed in text as well as visuals; nothing is colour-only.
- Adjustable text size; VoiceOver labels on every evidence card and fact.
- Drag interactions (word bank, corkboard) all have tap-to-select alternatives.
- iOS "Reduce Motion" is respected: big transitions become cross-fades, nothing essential depends on animation.

### 2.13 Presentation direction (added on approval)

Full aesthetic concept (palette tokens, typefaces, reference screen, master image style prompt) is deliverable 7: see §5. These decisions are locked now because the case schema depends on them.

**The whole game is a case file.** Every screen is a physical object on a detective's desk: manila folders with tabs and OB numbers, typed reports, carbon-copy forms, rubber stamps, paper clips, Polaroid-style evidence photos, redaction bars, coffee rings, a desk lamp's pool of light. Menus are folders, the level select is a filing cabinet drawer per region, settings is a clipboard. No floating "app UI" panels anywhere.

**Images: hybrid, not all-code.** This is a deliberate break from Live Wire's "nothing is a raster asset" rule. Faces and places are what make a detective game feel real, and code can't draw a convincing Mombasa alley or a suspect's face.

| Drawn in code (SVG/CSS/canvas) | AI-generated images (ChatGPT / Gemini) |
|---|---|
| All UI: folders, forms, stamps, paper, corkboard, string, notebook, charge sheet, map, phone screens, mobile-money statements, receipts, title deeds | Suspect/witness/victim portraits (ID-photo style) |
| All documents (so text stays sharp, translatable and accessible) | Location establishing shots |
| All effects, transitions, particles | Crime-scene photos (implied, no gore) |
| | Key evidence object photos where a drawing won't do |
| | Spine-story cast (protagonist, mentor, antagonist) |

**How images stay consistent across ~500 files from two different generators:**
1. One **master style prompt** (deliverable 7), prefixed to every image prompt.
2. Every image prompt is **generated from the case data** (each person, location and evidence item in the schema carries an `image.brief`), so prompts are written once, consistently, by a script, never by hand.
3. Every image is shown **through a code-side "case photo" treatment**: slight desaturation, grain, a print border, a paper clip or pin, a slight rotation, a handwritten label. This unifies style drift between generators and makes generated images read as evidence, not as AI art.
4. Recurring characters get **reference images** generated first; later prompts reuse them as references (both ChatGPT and Gemini accept image references) so the mentor looks like the mentor in case 90.

**Image budget.** Roughly 5 images per case on average (portraits for suspects and victim, 1 scene, 1–2 locations), about 500 total. Minor witnesses get a statement-only card with no portrait. Pasting 500 prompts into a chat app one by one is slow; once deliverable 6 starts, we decide between that and a small batch script using the image API with your own key. Commercial-use terms for both services must be re-checked before ship.

**Motion: physical, fast, never decorative.** Same principle as Live Wire: motion simulates real objects.
- Folders slide out of the cabinet and open with a hinge; pages flip with real 3D perspective; papers fan and settle with a spring, not a linear ease.
- Stamps thump down with a tiny ink-spread and a micro-shake (the "trauma" pattern from Live Wire).
- Corkboard string is a spring-damper rope (Live Wire's physics integrator, reused): it sags, swings and pulls taut.
- Typewriter text reveals OB entries and key report lines; a contradiction in interrogation gets a hard cut, a held beat of silence, then the suspect's reaction.
- The desk lamp's light subtly follows the active object.
- Performance rules: 60 fps target on older iPhones, animate only `transform` and `opacity`, no layout thrash, every transition interruptible (a tap never waits on an animation).

---

## 3. Case data schema + solvability validator (APPROVED)

### 3.1 Principles

- **One JSON file per case** (`cases/case-001.json` … `case-100.json`), plus `cases/_campaign.json` for region and spine data. The game engine is generic; every case is pure data.
- **Everything is an ID.** People, locations, evidence, facts, words, claims, contradictions, proof steps. All cross-references go by ID so the validator can check them.
- **The solution is authored as a proof,** not just an answer. The validator checks that the proof exists, uses only reachable evidence, and refutes every alternative.
- **Images and text live in the same file,** so the prompt compiler, the game and the validator read one source of truth.

### 3.2 Top-level structure

```
case
├── meta            id, number, region, title, boss flag, schema version
├── pattern         real-world crime pattern used + "no real case retold" declaration
├── difficulty      declared difficulty axes (validator checks they're true)
├── ob              the Occurrence Book entry that opens the case
├── people[]        victim, suspects, witnesses, recurring cast
├── locations[]     places, each with hotspots that yield evidence
├── evidence[]      evidence cards, each containing facts, optionally gated
├── facts[]         atomic statements (true facts, claims, lies)
├── interrogations[] per-person stance, topics, claims
├── contradictions[] claim + fact that breaks it + what it reveals
├── words[]         word-bank entries and what unlocks them
├── chargeSheet     template, groups, blanks, answers, prosecutor lines
├── solution        proof steps, eliminations, reconstruction
├── hints           tier 1/2 per group (tier 3 is derived)
└── glossary[]      Swahili/Sheng terms used in this case
```

### 3.3 Field definitions

**meta**
```json
{ "id": "case-001", "number": 1, "region": "nairobi-cbd", "title": "The Last Fare",
  "boss": false, "schemaVersion": 1, "estMinutes": 7 }
```

**pattern** (content policy, enforced by the validator)
```json
{ "crimePattern": "debt dispute between matatu crew members",
  "noRealCaseRetold": true,
  "notes": "Composite of common stage-level debt disputes; no identifiable real case." }
```

**difficulty** (declared; the validator recomputes and compares)
```json
{ "suspects": 3, "chainLength": 2, "redHerrings": 0, "liars": 0,
  "groups": ["who"], "evidenceTypes": ["physical", "witness"],
  "gatedActions": [], "twist": null }
```

**people[]**
```json
{ "id": "p_otieno", "role": "suspect",            // victim | suspect | witness | recurring
  "name": "Brian Otieno", "age": 29, "occupation": "Matatu conductor",
  "bio": "Works the Ngara–Kencom route. Owed the victim money.",
  "isCulprit": false,
  "unlock": { "start": true },                      // or { "fact": "f_..." } / { "location": "loc_..." }
  "image": { "kind": "portrait", "brief": "late-20s man, conductor's reflective vest, wary expression", "ref": null } }
```

**locations[]**
```json
{ "id": "loc_stage", "name": "Ngara matatu stage", "kind": "scene",   // scene | location
  "description": "...",
  "unlock": { "start": true },
  "hotspots": [ { "id": "hs_bench", "label": "Wooden bench", "yields": "ev_receipt" } ],
  "image": { "kind": "location", "brief": "busy matatu stage at dusk, painted matatus, sodium lights" } }
```

**evidence[]**
```json
{ "id": "ev_receipt", "type": "document",           // physical | witness | document | phone | forensic | cctv
  "title": "Fare receipt", "render": "receipt",     // which code-drawn template displays it
  "body": { "route": "Ngara → Kencom", "time": "20:15", "fare": "KSh 80" },
  "facts": ["f_receipt_time"],
  "gate": null,                                     // or { "action": "warrant" | "records" | "forensicRush", "cost": 1 }
  "image": null }
```

**facts[]**
```json
{ "id": "f_receipt_time", "text": "Fare receipt shows a Ngara → Kencom ride at 20:15.",
  "kind": "true",                                   // true | claim | lie
  "about": ["p_kamau", "loc_kencom"],
  "where": { "person": "p_kamau", "place": "loc_kencom", "from": "20:15", "to": "20:40" } }
```
The optional `where` block is a structured "this person was at this place during this time" statement. It lets the validator check alibis and timelines mechanically (§3.5, rule 6).

**interrogations[]**
```json
{ "person": "p_kamau", "stance": "guarded",         // cooperative | guarded | lawyered
  "claims": ["f_kamau_alibi"],
  "topics": [ { "about": "p_victim", "reply": "We worked the same route. That's all.", "reveals": [] } ] }
```

**contradictions[]**
```json
{ "id": "c_alibi", "claim": "f_kamau_alibi",
  "brokenBy": ["f_receipt_time"],                    // any one of these breaks the claim
  "reveals": ["f_kamau_admits_stage"],
  "reaction": "...okay. I went back. But only to collect what he owed me." }
```

**words[]**
```json
{ "id": "w_kamau", "text": "Peter Kamau", "category": "person",   // person | method | motive | time | place | object
  "unlock": { "anyOf": ["f_kamau_intro"] } }
```

**chargeSheet**
```json
{ "template": "{who} killed {victim}.",
  "fixed": { "victim": "Joseph Mwangi" },
  "groups": [
    { "id": "g_who", "blanks": [ { "id": "who", "category": "person", "answer": "w_kamau" } ],
      "prosecutor": { "pass": "That will hold.", "fail": "A defence lawyer would walk him out by lunch." } } ] }
```

**solution**
```json
{ "proof": [
    { "id": "s1", "from": ["f_kamau_alibi", "f_receipt_time"], "concludes": "Kamau lied about leaving at 19:00." },
    { "id": "s2", "from": ["s1", "f_witness_argument"], "concludes": "Kamau was at the stage and argued with the victim at the time of death.", "answers": ["who"] } ],
  "eliminations": [
    { "word": "w_otieno", "blank": "who", "by": ["f_otieno_cctv"], "why": "CCTV puts Otieno in Westlands at the time of death." } ],
  "reconstruction": [ { "text": "...", "image": null } ] }
```

**hints**
```json
{ "g_who": { "tier1": { "point": "ev_receipt" }, "tier2": { "facts": ["f_kamau_alibi", "f_receipt_time"] } } }
```

**glossary[]**
```json
[ { "term": "makanga", "def": "Matatu conductor (Sheng)." } ]
```

### 3.4 What the engine derives (not authored)

- Tier-3 hints (fill one blank from `chargeSheet` answers).
- The notebook's person/place/time grouping (from `about` and `where`).
- The word bank at any moment (from `words[].unlock` and the player's discovered facts).
- Image prompts (master style prefix + `image.brief` + generator-specific wrapper), compiled by `tools/compile-prompts.mjs` into one ready-to-paste text file per case.

### 3.5 Solvability validator rules

`tools/validate.mjs` runs on every case file in Codespaces and again as the first step of the Codemagic build. **Any error fails the build**, so a broken case can never ship (Heads Up!'s "broken deck" complaint, prevented structurally).

**Errors (build fails)**

1. **Integrity.** Every ID is unique; every reference resolves; every evidence card has at least one fact; every culprit is a `suspect`.
2. **Reachability.** Simulate play from the start state: OB facts → unlocked locations → hotspots → evidence → facts → unlocked people/topics/words → contradictions → revealed facts, repeating until nothing new unlocks. Every proof fact, every answer word and every elimination fact must be reachable.
3. **Credibility budget.** The cheapest set of gated actions needed to reach the proof costs at most **3** of the 5 stamps, leaving room for two mistakes before the player loses stars through no fault of the design.
4. **Proof completeness.** Every blank is concluded by a proof step marked `answers`. Proof steps only cite facts or earlier steps. No cycles.
5. **Uniqueness by elimination.** For every blank, every *other* word of that category that can appear in the bank has an authored elimination using reachable facts. This is the machine check for "the evidence forces one answer".
6. **Timeline consistency** (when facts carry `where` blocks): a person is never in two places at once in `true` facts; the culprit is placed at the scene at the time of death; every eliminated suspect's alibi covers the time of death; every `lie` contradicts at least one `true` fact.
7. **Liars are catchable.** Every `lie` fact has a reachable contradiction that breaks it.
8. **No leak.** No answer word is unlocked by the OB entry alone. A case can't be solved before the player investigates.
9. **Guess resistance.** A single-blank group needs at least 4 options in region 1 and at least 5 from region 2. A multi-blank group needs at least 12 possible combinations (regions 1–5) or 30 (regions 6–10). From region 2 every wrong submission also costs a credibility stamp and a star, so brute force is never the cheapest route. *(Amended during deliverable 5: the original flat 12/30 minimum would have forced filler names into every single-blank WHO group.)*
10. **Region rules.** No mechanic appears before the region that introduces it (§2.10): no warrants in region 1, no timeline blanks before region 5, and so on.
11. **Content policy.** `pattern.noRealCaseRetold` is `true`; no sexual-violence tags; every Swahili/Sheng term in dialogue appears in `glossary`; text fields fit phone-screen length limits.

16. **Clock solvability.** At least one order of actions takes every detention-gated sample and makes every press that needs a lab result inside the 24-hour detention, without forensic rush. *(Added during deliverable 5, region 4.)*
17. **Rush is optional.** The minimal proof never requires a forensic rush. *(Added during deliverable 5, region 4.)*
18. **Accepted alternatives are proven.** A blank may list more than one accepted answer (`accept: [...]`, used for FORGERY tells in cases 62 and 70, where the forged document has two independent flaws). Every accepted answer must be reachable from discovered facts and appear in the solution proof; every other option still needs an authored refutation. *(Added during deliverable 5, region 7.)* Implemented with the FORGERY group (deliverable 6, region 7): the answer document must be the only forged document among the options; every accepted tell's facts must be in the proof; document and handwriting examinations take 10 lab hours. Extended to the ABSENCE group (deliverable 6, region 8): absence words must name absence facts, conclusion words must carry the facts that prove them, and every accepted absence and the facts behind the answer conclusion must be in the proof; every absence fact must sit on some location's Expected list, grounded in a `because` fact (no trick items). Extended again in region 9: every accepted ACCOMPLICE role and PLANTED tell must have its facts in the proof; a second planted item is allowed only as an accepted alternative (case 88); exactly one forged document and exactly one intended target. Extended in region 10: every accepted SPINE pin must be cited in a proof step (cases 93, 98, 99); SPINE answers that depend on something revealed in the case are in-case facts, so the pin is proven before the verdict.

*Schema note (region 8):* `_campaign.json` gains `regions[].labTransportHours` (0 everywhere except region 8, where it is 4). Rule 16 adds it to every lab test in that region.

*Validator notes (region 10):* SPINE groups are allowed in every case from 91 to 99 (rule 15 applies as for boss cases). Case 100 is the only charge sheet allowed more than eight groups: its SPINE group has one line per thread (six). The fairness audit (`tools/audit.mjs`) also checks the A5 helper rule from a `community` tag on every character, and fails the build if a culprit community appears less often as victim, witness or helper.

*Validator notes (region 2, added while writing the case files):* guarded people need `opensWith`, and the simulation keeps their sheet closed until one of those is known; a warrant can only be served once one of its `grounds` facts is known; every contradiction's claim must be on someone's statement sheet (otherwise it can't be pressed) and every break needs a `mark`; the liar count is checked against `liarsPerCase`; rule 15 is implemented (pin words must resolve to a spine fact of an earlier case already on the Pattern File; spine groups only in boss cases and 91–99); and background spine details (A4) may not appear in an ordinary case's proof. Each of these was confirmed by a negative test (a deliberately broken copy of the case files).

*Validator notes (region 3):* records requests need `grounds` like warrants; WHY blanks must use motive words; rule 6 now understands containment: being in a place inside the scene places a culprit at the scene, and a place that contains the scene (a mast zone, a whole town) never counts as an alibi, because a mast narrows and never pins (master list D1). People's names are blanked before the glossary scan, so "Riziki Chai" doesn't demand a definition of *chai*. Each check was confirmed by a negative test.

**Warnings (reported, build continues)**

12. **Declared vs measured difficulty.** Recomputes suspect count, liar count, red herrings and chain length (longest path in the proof graph) and flags any mismatch with `difficulty`.
13. **Curve check across all 100 cases.** Flags any case that's measurably easier than the case three before it, within the same region (across a region boundary the old axes step back while a new mechanic arrives; the A2 targets govern that step). Score: suspects + chain length + liars + red herrings + twist + gated actions + 2 per extra charge-sheet group.
14. **Missing images.** Any `image.brief` without a matching asset file.

**Campaign-level audit** (`tools/audit.mjs`, run on the full set): culprit background and gender spread, victim spread, motive spread, repeated names across cases, the share of cases with each twist type. This is the fairness audit required by the brief, made repeatable instead of a one-off read-through.

### 3.6 What the validator cannot check (and how we cover it)

The validator proves that the evidence *exists*, is *reachable* and that every alternative has an *authored* refutation. It cannot judge whether a human will find the reasoning fair or the `why` text convincing.

That's covered by:
- **A blind playthrough of every case** by me in a fresh session that only sees the player-facing data, not the solution. If I can't solve it from the evidence alone, the case goes back for rewriting.
- **Playtesting Region 1** with real players before regions 2–10 are written in full.
- **A Kenyan cultural reader** for dialogue, Sheng and setting details.

### 3.6a Schema additions made while writing the case files (deliverable 6)

Writing real cases showed the engine needs a few more fields. All are optional unless marked.

| Where | Field | Purpose |
|---|---|---|
| `meta` | `regionNumber` (required), `date`, `folderTab` | Region rules lookup; the date line on the OB; the word printed on the folder tab |
| `people[]` | `community` (required), `at`, `statementOnly`, `redHerring` | A5 helper-rule audit (Part L); where the person is met; no portrait or bank word needed; rule 12's herring count |
| `places[]` (new, top level) | `id`, `name`, `within` | Sub-places that aren't visitable locations (a cart, a lift, another town) for `where` blocks and alibis |
| `locations[].hotspots[]` | `pos` [x%, y%], `text` (required), `unlock` | Where the tap target sits on the scene image; what Amani notices; hotspots that appear later (a matatu returning) |
| `interrogations[]` | `intro`, `yields` | The first line when the player opens the interview; evidence cards (statements) given on first interview |
| `interrogations[].topics[]` | `about` may be any person, place, evidence or fact | A topic appears once the thing asked about is known |
| `words[]` | `ref` (required for person words) | Links a bank word to its person, for the alibi check in rule 6 |
| `chargeSheet.groups[]` | `kind` (required), blank `spine`, blank `pool`, blank `accept` | Region rules (rule 10); spine blanks; restricting a blank's options; accepted alternatives (rule 18) |
| `solution` | `timeOfDeath` {`place`, `from`, `to`, `within`} (required) | Rule 6: culprit at the scene, suspects' alibis cover the window. Times may run past midnight |
| top level | `afterVerdict[]`, `tutorial[]`, `ui` {`beats`, `beatNotes`} | Boss and spine beats after the verdict; case 1's guided voice-notes; which interface beat the case introduces |
| `evidence[].render` | one of: `sceneNote`, `object`, `statement`, `tallyBook`, `visitorRegister`, `ticket`, `ticketBook`, `manifest`, `logBook`, `receipt`, `note`, `form`, `sketch`, `tag`, `jobBook`, `calendar`, `board`, `timetable`, `feeBook`, `photo`, `orderBook`, `collectionSlip`, `ledger` | The code-drawn template that displays the card (deliverable 7 designs each one) |

| `interrogations[]` (region 2) | `opensWith` (required for `guarded`) | Evidence or facts that open a guarded person's statement sheet. Until one is known, the sheet is blank |
| `contradictions[]` (region 2) | `mark` (required: `implicates` or `explains`), `greys` | Broken isn't guilty: a break is stamped red or grey (case 14). `greys` lists claims that collapse with it (linked claims, case 17) |
| `evidence[].gate` (region 2) | `grounds` (required for `warrant`) | Probable-cause facts. The warrant button appears only once one of them is known |
| `words[]` (boss cases) | category `pin`, field `pin: "case-NNN:f_id"` | A Pattern File pin offered as a SPINE word. Proof steps and eliminations may cite pin IDs directly |
| `regions[].allows` | `liarsPerCase` [min, max] | Region 2 is exactly one liar per case |
| `evidence[].gate` (region 3) | `action: "records"` with `grounds` | A court-ordered records request (1 stamp). The form appears as soon as a grounds fact is known; no location visit needed |
| `chargeSheet.groups[]` (region 3) | `kind: "why"`, blank `category: "motive"` | The WHY group. Motive words unlock on discovery like any other word; every wrong motive needs an authored refutation (rule 5) |
| `facts[]` | `redHerring: true` | A phantom red herring created by a lie (case 26's "tall man in a cap"), counted by rule 12 |
| `places[]` | `within` (transitive) | Containment: a laundry inside the staff side, a shop inside a mast zone. Used by rule 6 both ways (see validator notes) |
| `_campaign.json` | `masts[]`, `mastNote`, `phoneNumbers` | The fixed list of fictional mast coverage zones, and the rule that every phone number is written `07xx xxx NNN` with masked middle digits |
| `evidence[]` (region 4) | `lab` {`test`, `hours`, `needs[]`}, type `forensic` | A lab result. It appears `hours` in-game hours after every evidence item in `needs` is in hand and submitted. Autopsies and on-site comparisons are labs with `hours: 0` and need no submission |
| `evidence[]` (region 4) | `detention: "p_id"` | A detention sample (fingerprints, clothing, a swab), taken without consent only while that person is detained |
| `interrogations[]` (region 4) | `laterClaims[]` {`claim`, `after`} | A claim that joins the statement sheet once the `after` fact is known: a suspect's fallback story, pressable in detention |
| `contradictions[]` (region 4) | `mark: "mistaken"` | A third mark (amber): an honest witness who is wrong (case 37). Can't be applied to a lie |
| `solution.timeOfDeath` (region 4) | `note`; `alibisApply: false` + `reason` | The window is the *act* (handing over poisoned honey, case 39), not the death. When alibis can't apply, the reason is stated |
| `solution.eliminations[]` (region 4) | `present: true` | A suspect who was at the scene but isn't the killer (case 40's driver). Rule 6 then requires a lab or autopsy fact among the elimination's facts instead of an alibi |
| top level (region 4) | `clockPlan` {`steps[]` {`do`, `target`, `hours`}, `totalHours`, `note`} | An authored order of actions the validator replays against `_campaign.json`'s `clock` to prove rules 16 and 17. Actions: interview, visit, read, search, records, submit, detain, sample, press, wait, release |
| `_campaign.json` | `clock`, `clockNote`, `labHours`; `betweenCases`; `collectibles[]`; `recurringCast[].image.generateIn`/`reuse` | Hours per action [min, max]; standard lab times; between-case beats for every case; Joseph's reference photo is generated in case 40 and reused in 70 and 100 |
| `chargeSheet.groups[]` (region 5) | `kind: "when"`; blank `category: "time"` with words carrying `window` {`from`, `to`} | Single-window WHEN (cases 41–42). The answer window must equal `solution.timeOfDeath`; no wrong window may overlap it |
| `chargeSheet.groups[].blanks[]` (region 5) | `category: "strip"`, `strip` {`slots[]` {`id`, `label`, `from`, `to`, `day`}, `events[]` {`id`, `text`, `slot`, `by[]`, `why`, `unlock`, `act`}, `decoys[]` {`slot`, `by[]`, `why`}} | The timeline strip (from case 43): events dragged into slots, graded as one group. One event is the act; its slot must sit inside the act window. Every unused slot is a decoy with a refutation. Arrangements = P(slots, events) ≥ 12 (rule 9). Strip cases leave `{when}` out of the sentence template |
| `facts[]` (region 5) | `at` {`from`, `to`, `day`} | A time for the corkboard's timeline rail (ungraded) |
| `chargeSheet.groups[]` (region 6) | `kind: "where"`; blanks `category: "place"`, optional `subject` (`scene` default, `culprit` with `at` HH:MM, `other` with `note`), optional `pool[]` | WHERE. A scene answer must be the scene or inside it, and no other option may be; a culprit answer needs a true where-fact placing the culprit there at `at`. Two blanks share a group through pools (case 60: 6 × 6) |
| `words[]` (region 6) | `category: "place"`, `ref` (a location or place) | Place words for WHERE |
| `map` (region 6) | `start`, `nodes[]`, `edges[]` {`a`, `b`, `minutes`, `by`} | The site map. Nodes are locations or places; a case with a map must carry a clock plan |
| `clockPlan.steps[]` (region 6) | `do: "travel"`, `target`, `from`, `hours` | Travel between map nodes: from the last site, on an existing route, at least the route's minutes, inside `clock.travel` (0–3 h; fractions allowed). Visiting a map node without travelling there fails rule 16 |
| `afterVerdict[]` (region 6) | `choice` {`id`, `options[]` {`id`, `label`, `result`}, `affectsSolution: false`, `effect`} | A story choice after the verdict (case 60's phone call). Never changes the solution |
| `_campaign.json` regions (region 6) | `liarsPerCase: [2, 2]`, `whereRule`, `gateNote` | Exactly two liars per case from region 6 |
| `evidence[]` (region 7) | `doc` {`genuine`, `forger`, `kind`}; evidence type `document` | A document that may be genuine or forged; the forger can be the victim (case 64) |
| `words[]` (region 7) | `category: "document"` with `ref` (a document's evidence id); `category: "tell"` with `by[]` (the facts that show the tell) | Words for the FORGERY group |
| `chargeSheet.groups[]` (region 7) | `kind: "forgery"`; blanks `document` and `tell` (`accept[]` allowed on the tell) | "{document} was forged, as shown by {tell}." At least 5 × 6 = 30 combinations; one forged option (rule 18) |
| `interrogations[]` (region 7) | `stance: "lawyered"`, `lawyered` {`advocate`, `reopenedBy[]`, `line`} | Silent ("No comment") until a reopening fact is known; reachability treats the suspect as closed until then. A wrong reopening attempt costs a stamp (runtime) |
| `clockPlan.steps[]` (region 7) | `do: "reopen"` (0–1 h) | Presenting the reopening fact to a lawyered suspect |
| `afterVerdict[]` (region 7) | `beats[]` and `scene` (a tap-through scene, case 70's kitchen table); `files[]` {`thread`, `text`} | Pattern File entries filed after the verdict. Not facts: a later spine group that needs one promotes it to a spine fact first |
| `_campaign.json` (region 7) | regions[7] `liarsPerCase: [2, 3]`, `forgeryRule`, `lawyerRule`, `calendarNote`; `clock.reopen`; `labHours.document` and `labHours.handwriting` = 10; recurring cast `rc_ayugi`, `rc_muchiri` | Region 7 rules and the two new recurring characters |
| `locations[]` (region 8) | `expected[]` {`id`, `text`, `because`, `present`, `fact`} | The Expected list: what should be at a location and why (`because`, a known fact). `present: false` items name the absence fact the player notes as missing |
| `facts[]` (region 8) | `absence: true` | An absence fact ("Missing: …"). Known once its location and its Expected item's `because` fact are known. Must be on some Expected list |
| `words[]` (region 8) | `category: "absence"` with `ref` (an absence fact); `category: "conclusion"` with `by[]` | Words for the ABSENCE group |
| `chargeSheet.groups[]` (region 8) | `kind: "absence"`; blanks `missing` (absence) and `conclusion` (`accept[]` allowed on `missing`) | "That {missing} shows that {conclusion}." At least 5 × 6 = 30 combinations (rule 18) |
| `_campaign.json` (region 8) | regions[8] `liarsPerCase: [2, 3]`, `absenceRule`, `travelNote`, `labNote`, `calendarNote`, `labTransportHours: 4`, `travelHours: [0, 7]`; recurring cast `rc_halake`, `rc_ewoi`; `threads[t_registry].identifiedIn: 80` | Region 8 rules: samples travel to the county lab (+4 h on every lab), long northern drives, the two new recurring officers; the registry man is identified in case 80 |
| `people[]` (region 9) | `accomplice: true`, `unknowingHelper: true`, `intendedTarget: true` | The accomplice who knowingly helped (one per case, never the culprit); a helper who didn't know (refuted in the ACCOMPLICE group with 2+ facts); the person the killer meant to kill (never the victim) |
| `words[]` (region 9) | `category: "person"` with `nobody: true`; `category: "role"` with `by[]`; `category: "item"` with `ref` (evidence); `category: "plantTell"` with `by[]`; `category: "target"` with `ref` (a person) | Words for ACCOMPLICE, PLANTED and REAL TARGET |
| `evidence[]` (region 9) | `planted` {`by`, `frames`} | Planted evidence: placed by the culprit or the accomplice to frame an innocent person |
| `chargeSheet.groups[]` (region 9) | `kind: "accomplice"` (blanks `person` with a pool offering "nobody", and `role`); `kind: "planted"` (blanks `item` and `plantTell`, `accept[]` on both); `kind: "realTarget"` (one `target` blank); `kind: "who"` with `unordered: true` and two person blanks for joint principals (case 85) | The region 9 groups. WHO answers must name every culprit |
| `chargeSheet` (region 9) | `reviewer` | Who reviews this charge sheet when it isn't Halima (case 90: Rukia Hassan) |
| `_campaign.json` (region 9) | regions[9] `liarsPerCase: [3, 3]`, `labTransportHours: 0`, `accompliceRule`, `plantedRule`, `targetRule`, `castingRule`, `calendarNote`; recurring cast `rc_kiprop`, `rc_gachoki`, `rc_rukia`; `threads[t_kivuli].narrowedIn: 90`, `candidates[]` | Region 9 rules; the casting audit; Kivuli narrowed to three provisional names |
| `chargeSheet.groups[]` (region 10) | Every region-10 case has a `kind: "spine"` group and at least three of `when`, `where`, `forgery`, `absence`, `accomplice`, `planted`, `realTarget`; more than eight groups only in case 100 | K1: no new mechanics |
| `chargeSheet.groups[]` (case 100) | Two `kind: "accomplice"` groups (one per accomplice, distinct answers); a `where` group with two blanks (the scene, and `subject: "other"` with a note); a `spine` group with six blanks, one per thread, each with its own `pool` | The final charge sheet |
| `chargeSheet` (case 100) | `halima` | Halima's single acceptance line on the final sheet |
| `meta` (case 100) | `final: true` | The last case: ending, epilogue strip and post-game unlock |
| `evidence[]` (region 10) | `planted` {`by`} with `frames` omitted | A plant that frames a story rather than a person (case 91's fake lift notice) |
| `_campaign.json` (region 10) | regions[10] `liarsPerCase: [3, 4]`, `finalRule`, `castingRule`, `calendarNote`, `kivuliNote`; `threads[].closedIn`, `closedAs`; `threads[t_kivuli].identifiedIn: 100`, `identifiedAs`, `eliminated[]`; recurring cast `rc_mehta`, `rc_kabiru`, `rc_oduya`, `rc_rotich`; collectible `col_joseph_closed` | Region 10 rules; every thread closed; Kivuli identified (name provisional) |
| `_campaign.json` | `regions[5].whenRule`, `regions[5].moonNote`; `threads[].identifiedIn` | WHEN rules; the real moon phases used in cases 46 and 50; t_fundi is identified in case 50 |

`_campaign.json` holds: regions with their `allows` rules (rule 10), spine threads, the recurring cast with reference-image briefs, the Swahili/Sheng lexicon (rule 11), the prologue, the between-case beats, the Pattern File's opening pins and the collectibles.

### 3.7 File layout

```
Kesi-App/
├── www/
│   ├── index.html              engine (single file, Capacitor-wrapped)
│   ├── cases/case-001.json …   case data
│   ├── cases/_campaign.json    regions, spine story, unlock order
│   └── img/cases/001/…         treated case photos (WebP)
├── tools/
│   ├── validate.mjs            per-case validator (rules 1–18)
│   ├── contrast.mjs            WCAG contrast check of the design tokens
│   ├── generate-images.mjs     Gemini batch image generation (§6)
│   ├── audit.mjs               campaign fairness audit
│   └── compile-prompts.mjs     image prompts from case data
├── prompts/case-001.txt …      ready-to-paste image prompts
└── codemagic.yaml              build fails if validate.mjs fails
```

---

## 4. Spine story outline (APPROVED)

### 4.1 The story in one paragraph

Twelve years ago, a land surveyor named **Joseph Mwenda** was found dead on a roadside outside Nakuru. The file says robbery and was closed in nine days. His child, **Amani**, is now a detective newly posted to a small fictional unit in Nairobi. Across 100 cases, Amani keeps finding the same small details in unrelated murders: one mobile-money till number, one shell company, one forged stamp. They all trace back to **Kivuli** ("shadow"), a fixer who launders money through forged land titles and removes anyone who refuses to sign. Joseph refused to sign. The last case is Kivuli's charge sheet, and closing it reopens and finally closes Joseph's file.

**Theme:** a case file is a promise that the truth was looked for. The game is about what happens when one wasn't, and about one detective keeping that promise every time.

**Tone guardrails:** the spine is a slow thread, not a conspiracy in every case. About 80 of the 100 cases are complete, ordinary stories with no link to Kivuli. Corruption lives in named fictional individuals, never in a real institution shown as wholly rotten. Most officers, clerks and prosecutors in the game are honest and good at their jobs.

### 4.2 The cast

| Character | Role | Notes |
|---|---|---|
| **Amani** | The player | Seen only through the desk, the hands, the notebook and the phone. Never shown, never gendered (Amani is a gender-neutral Swahili name meaning "peace"), never given lines that tell the player how to feel. |
| **Chief Inspector Esther Wairimu, "Mwalimu"** | Mentor and the voice of the hint calls | A veteran nearing retirement who trains Amani. Dry, exacting, warm underneath. She is the reason the unit exists. She is also the officer who signed off Joseph's file twelve years ago, under pressure, and has lived with it since. |
| **Kivuli** | Antagonist | A fixer known only by a nickname for 90 cases. Not a politician or a stand-in for a real person: a private middleman who sells "problems solved". Real name revealed in case 100: **Margaret Kabiru**, former Deputy Chief Land Registrar (Records), now chair of a family foundation *(name confirmed 2 November 2026; the cultural reader still reviews it)*. |
| **"Fundi"** | Kivuli's enforcer | The first face of the network (case 50): **Benedict Mbuvi** (name confirmed 2 November 2026). A former mechanic who cleans up for Kivuli. |
| **The registry man** | Kivuli's inside contact | A lands-registry clerk who makes files disappear. Discovered in case 80 by noticing what is *missing*, fitting that region's mechanic. |
| **Prosecutor Halima Abdi** | Reviews every charge sheet | The voice of the batch-confirmation feedback (§2.3). Sceptical, fair, the closest thing Amani has to a friend at work. Her trust grows with your record. |
| **Joseph Mwenda** | Amani's father, the cold-case victim | Appears only in documents: his survey notes, one photo, the thin closed file in the drawer. |

**Names.** Kivuli (Margaret Kabiru) and Fundi (Benedict Mbuvi) were confirmed on 2 November 2026; Raphael Oduya and Stanley Rotich stay provisional. Names are spread across Kenya's communities, and none signals that a community is good or bad. The antagonist's real name in particular is decided with the Kenyan cultural reader before anything is final.

### 4.3 How the story is delivered (no long cutscenes)

- **Prologue (before case 1, under 3 minutes):** Amani's first morning at the unit. Mwalimu drops a folder on the desk. In the drawer, under the new case, is an old folder: an OB number, "Mwenda, J.", stamped CLOSED. The player can open and read it. It's thin. That's the hook.
- **Between cases:** a text from Halima, a voice-note from Mwalimu, a newspaper clipping on the desk, a new collectible. Five to twenty seconds, always skippable, never blocking.
- **The desk changes.** Every boss case adds an object to the desk, so the desk itself tells the story of the campaign.
- **Background threads.** About one case in four has a single small Kivuli detail in its evidence that isn't needed to solve that case (a till number on a statement, a company name on a receipt). Sharp players notice. Nobody is punished for missing it (§4.7).

### 4.4 The Pattern File (the story as a mechanic)

After case 10, a second corkboard unlocks: the **Pattern File**. Every Kivuli detail is pinned there automatically, labelled with the case it came from.

Each boss case adds a **spine group** to its charge sheet: a blank filled using evidence from *earlier* cases, pulled from the Pattern File. Example from case 40: *"The till number on the Nakuru surveyor's statement is the same one used in **[the case 20 chama fraud]**."* The story becomes something the player solves, not something they watch.

### 4.5 Boss cases: what each one reveals

| Boss | Region | The case | What it reveals | Desk collectible |
|---|---|---|---|---|
| **10** | Nairobi CBD | A printer is killed in his River Road shop | A forged rubber stamp and the till number of **Mvua Holdings**, a shell company. First appearance of the name Kivuli, in a handwritten note left with the order (not a phone text: phone evidence isn't introduced until region 3) | The brass rubber stamp |
| **20** | Eastlands | A chama treasurer is killed the week before payout | The chama's savings were being routed to the Mvua till. Kivuli launders through trust networks | The chama ledger |
| **30** | Mombasa Old Town | A port clerk dies in a "fall" | A container of blank title-deed paper. The forgery has a supply chain | A dhow captain's compass |
| **40** | Rift Valley / Nakuru | A land surveyor is murdered over a boundary dispute | The pattern matches Joseph's death exactly. Amani finds Joseph's survey number in the records. The personal turn | Joseph's surveying compass, released from the evidence room |
| **50** | Kisumu & Lake Victoria | A fisherman who saw a body dumped in the lake is killed | Fundi is identified. Kivuli's network has a face | A fishing float |
| **60** | Maasai Mara | A lodge manager is killed over a conservancy lease | Kivuli's money is in the lease. An old file in the evidence carries Mwalimu's signature | A ranger's whistle |
| **70** | Mt Kenya / Nyeri | A widow is killed over a forged will | Mwalimu admits she closed Joseph's case under pressure. Her hint calls change tone after this: she still helps, but quieter | Joseph's original file, reopened |
| **80** | Northern frontier | A records clerk vanishes, and the evidence is what *isn't* there | The registry man. Kivuli's files were being erased from the inside | A registry drawer key |
| **90** | Westlands / Karen / Runda | Kivuli's own lawyer is killed, and Halima is framed | Kivuli is cleaning up. The suspect list narrows to three | A fountain pen |
| **100** | The Final Files | Kivuli's charge sheet | Every spine group from the campaign comes back. Kivuli is named and charged | Joseph's file, stamped CLOSED, with the truth in it |

**Cases 91–99** are ordinary hard cases, each also closing one loose end. *(Updated during deliverable 5, region 9: Fundi was charged in case 50, Mwalimu promised to testify in case 70, and Halima was cleared in case 90, so the loose ends left for 91–99 are: Fundi's statement, the registry man's statement, Mwalimu's formal statement, who killed Joseph on the Bahati road, the Mvua money trail, and eliminating two of the three fourth-floor names.)*

### 4.6 The ending

One ending, earned by solving. The player fills in Kivuli's charge sheet from the whole Pattern File, and Halima accepts it. The last screen is the old folder from the prologue: Amani types a new OB entry at the bottom of Joseph's file and stamps it CLOSED, this time with the truth inside. Mwalimu's last voice-note is short.

**No branching endings.** In a deduction game, the satisfying ending is the one you proved. Multiple endings would mean some players "lose" the story by guessing wrong in case 100, which contradicts the never-softlock rule (§2.5).

### 4.7 Schema additions this requires (amends §3)

1. **`facts[].spine: "<thread-id>"`** marks a Kivuli detail. On case close it's pinned to the Pattern File.
2. **Spine facts are auto-filed when a case is solved,** whether the player found them or not, and shown in the verdict reconstruction. This prevents a softlock where a boss case needs a detail the player missed 30 cases earlier.
3. **`_campaign.json` gains `threads[]`**: each thread's ID, the cases where it appears, and which boss cases use it.
4. **Validator rule 15 (error):** every fact a spine group needs must be a `spine` fact from an earlier case, and every boss case's spine group must be solvable from the Pattern File as it stands at that point in the campaign.

---

## 5. Aesthetic concept + master image style prompt (deliverable 7, APPROVED)

Files: `kesi-repo/www/styles/tokens.css` (every token below), `kesi-repo/www/styles/sign.css` (the sign-painted display treatment), `kesi-repo/www/fonts/` (the bundled faces and their OFL licences), `kesi-repo/docs/aesthetic-reference.html` (the reference board and screen, drawn from the tokens), `kesi-repo/tools/contrast.mjs` → `docs/contrast.txt`, `kesi-repo/tools/compile-prompts.mjs` → `prompts/`.

### 5.1 The concept in one line

**Amani's desk at the SCU at night: the institution's paper under a desk lamp, with Kenya's street signage breaking in at the edges.**

It works as two worlds with a strict border between them:

| | The institution | The street |
|---|---|---|
| What it is | Paper, typewriter ink, carbon copies, rubber stamps, the OB ledger, manila folders, kraft evidence bags, the corkboard | Sign-painter lettering, matatu graffiti colour, sodium streetlight, red murram, each region's own materials |
| Where it appears | Everything the player reads to solve a case | Case titles, folder tabs, region cards, the map, the case clock, and the moments the player earns (a caught lie, an accepted charge sheet, a closed region) |
| Rule | Warm, desaturated, high contrast; every word on paper is ink | Saturated, used sparingly; never body text, never on paper except as a stamp |

This is the same "palette = the subject's real materials" rule Live Wire used, applied to two materials at once. The border matters for play as well as looks: when colour appears, it means "this is a place" or "you did something", so it never competes with the evidence.

### 5.2 Palette tokens

All values live in `www/styles/tokens.css`. Contrast is computed by `tools/contrast.mjs` (WCAG 2.2 relative luminance): 66 pairs, 0 failing (`docs/contrast.txt`).

**The room**

| Token | Hex | Material | Use |
|---|---|---|---|
| `--desk` | #2A1D15 | Government-issue hardwood, dark varnish | Every screen's background |
| `--desk-hi` / `--desk-lo` | #3D2B1F / #1A110C | Grain highlight / beyond the lamp | Wood grain, vignettes |
| `--lamp` | #F6C66B | Tungsten desk lamp | Radial light pool (top right, drifts towards the active object) |

**Paper (the institution)**

| Token | Hex | Material | Use | Ink on it |
|---|---|---|---|---|
| `--paper` | #F3EBDA | Typed report paper, slightly aged | Reports, statements, the charge sheet | 13.3:1 |
| `--paper-lo` | #E6DAC2 | The sheet underneath | Stacks, second pages | 11.4:1 |
| `--ledger` | #EEF0E2 | OB ledger page | The OB entry, logs | 13.6:1 |
| `--ledger-rule` / `--ledger-margin` | #9DB8A6 / #C9655B | Ledger ruling, red margin line | Decorative only | n/a |
| `--manila` / `--manila-lo` | #E2C48C / #C9A66B | Folder face / edge | Case folders, the filing cabinet | 9.4:1 |
| `--kraft` | #B98D5E | Evidence envelopes and bags | Exhibit tags, bag labels | 5.3:1 |
| `--cork` / `--cork-lo` | #B88A5A / #8F6640 | Corkboard | The board | n/a |

**Ink**

| Token | Hex | What it is | On paper |
|---|---|---|---|
| `--ink` | #23222B | Typewriter ribbon | 13.3:1 (all body text) |
| `--ink-soft` | #4E4B57 | Faded ribbon | 7.2:1 (meta lines, labels) |
| `--carbon` | #2F4497 | Carbon-copy blue | 7.4:1 (duplicated forms, "COPY") |
| `--pencil` | #3F3F44 | Graphite | 8.8:1 (Amani's notes) |
| `--ob-green` | #2F5D46 | OB ledger cloth | 6.4:1 ("ACCEPTED") |
| `--stamp` | #B3261E | Rubber-stamp red | 5.5:1 ("CLOSED", "RETURNED", "CONTRADICTED") |
| `--string` | #C7362B | Corkboard string | Always with a pin shape |
| `--highlighter` | #F4DD62 | Amani's highlighter | Ink on it 11.5:1 |

**The street** (display type, region identity, earned moments; never body text)

| Token | Hex | Source | Use | On the desk |
|---|---|---|---|---|
| `--sodium` | #F2A33A | Sodium streetlight | The arrest clock, night scenes | 7.8:1 |
| `--murram` | #A44A2A | Red murram roads | Map routes | n/a |
| `--matatu-pink` | #E8358A | Matatu graffiti | Celebration accents, region 2 | 4.1:1 (display only) |
| `--matatu-lime` | #A6D930 | Matatu graffiti | Celebration accents | 9.8:1 |
| `--matatu-cyan` | #19B5D6 | Matatu graffiti | Focus ring (3 px; on paper it gets a 2 px ink outline, because cyan on paper is only 2.1:1) | 6.7:1 |
| `--signwhite` | #FFF8EC | Sign-painter white | Captions on the desk | 15.5:1 |

**Meaning tokens.** `--accepted` = OB green, `--returned` and `--lie` = stamp red, `--focus` = matatu cyan. Each always comes with a word and a shape: ACCEPTED is a rectangular double-ruled stamp, RETURNED is round, a caught lie is struck through with a "CONTRADICTED" tag. Red/green colour blindness loses nothing.

**Night shift (system dark mode).** The room goes darker and the paper dims, but paper stays paper: `--desk` #17110C, `--paper` #DCD1BC, `--ledger` #D6D9C9, `--manila` #C8AC78, and stamp red darkens to #9E1F18 to keep 5.2:1 on dimmed paper. Body text stays at 10.4:1. A detective game played in bed should not flash white.

### 5.3 Region identity

Each region gets one material colour and one accent, both from what the place is made of. They appear only on the folder tab, the filing-cabinet drawer label, the region title card and the region's map. Tab labels are checked at ≥ 4.5:1.

| Region | Material | Accent | Tab colour | Label contrast |
|---|---|---|---|---|
| 1 Nairobi CBD | Concrete | Sodium light | #8C8A84 | 5.0:1 (dark ink) |
| 2 Eastlands | Mabati (corrugated iron) | Matatu pink | #4F6D7A | 5.2:1 |
| 3 Mombasa Old Town | Coral stone | Indian Ocean blue | #D8C3A0 | 9.2:1 (dark ink) |
| 4 Rift Valley | Red murram | Maize gold | #A44A2A | 5.5:1 |
| 5 Kisumu & Lake Victoria | Lake water | Tilapia silver | #3E6E73 | 5.4:1 |
| 6 Maasai Mara | Shuka red | Savanna ochre | #C1272D | 5.5:1 |
| 7 Mt Kenya / Nyeri | Tea green | Coffee cherry | #3F6B2F | 5.9:1 |
| 8 Northern frontier | Basalt | Turkana jade | #3A3633 | 11.3:1 |
| 9 Westlands / Karen / Runda | Jacaranda | Glass and steel | #6E55A8 | 5.6:1 |
| 10 The Final Files | OB ledger green | Stamp red | #2F5D46 | 7.2:1 |

Region 9's jacaranda is deliberate: its cases run from mid-August to late September, and Nairobi's jacarandas flower from about September to November. Region 10 uses the institution's own colours, because the final files are about the institution.

### 5.4 Typefaces

Three faces, as the project convention asks, plus one hand for Amani. All four are SIL Open Font License (free to bundle in a paid or free app), bundled offline in `www/fonts/` (424 KB including Latin Extended), with the licences alongside.

| Role | Face | Why | Size |
|---|---|---|---|
| **Display**: case titles, tabs, region cards, stamps | **Big Shoulders Display** (variable, 100–900) + its **Stencil** sibling for crates, drawers, CONFIDENTIAL | Condensed sign-painter weight without the "Wild West poster" cliché; long names fit a phone: "NYAHURURU" at 22 pt is 98 pt wide | 44 / 32 / 22 pt |
| **Documents**: every typed report, statement, OB entry, form | **Courier Prime** (4 styles) | A typewriter face designed for reading long scripts: even colour, real italic and bold, survives Dynamic Type | 17 pt body, never below 15 pt, line height 1.5 |
| **Data**: logs, registers, PesaPap statements, mast records, lab values, the clock | **IBM Plex Mono** (400/500/700) | A cleaner mono than Courier for tables and numbers, so a log reads as a printout and a report as a typescript | 15 pt, line height 1.35 |
| **Amani's hand**: notebook, photo labels, sticky notes, corkboard notes | **Patrick Hand** | Legible handwriting at small sizes; it marks the player's own voice, never the institution's | 20 pt (handwriting runs larger to read the same) |
| **Plain text mode** (Settings → Reading) | The system face (SF Pro) | Swaps every typed and handwritten face for the system font, for players with dyslexia or low vision | Follows Dynamic Type |

Alternatives considered, shown side by side on the reference board:

- **Bungee** (display) is the truest to painted Kenyan signage, but it is wide: "NYAHURURU" at 22 pt is 162 pt. Folder tabs and titles on a phone would need smaller sizes or truncation. Reconsider only if we want more street and less paper.
- **Anton** (display) is condensed and strong but single-weight and generic, with no stencil sibling.
- **Special Elite** (documents) looks more like a typewriter, but it is distressed and single-weight: tiring across 100 cases, and it breaks at large Dynamic Type sizes. Rejected.

Phone screens inside the game (SMS, PesaPap notifications, call logs) use the system face, as a real phone would. The fictional PesaPap brand never borrows a real mobile-money brand's colours.

### 5.5 Surfaces, light and motion (amends §2.13)

- **Paper texture** is an SVG `feTurbulence` noise, tinted and tiled at 9% opacity. It is procedural, so there are no texture files and no visible tiling.
- **The lamp** is a radial gradient centred top right that eases toward whatever object is active (`transform` only). Off-screen, the desk falls to `--desk-lo`.
- **Tilt**: every card, photo and sheet lies at a seeded angle within ±2.5°, from a hash of its id, so a card always lies the same way in every session. Reduce Motion removes the movement but keeps the static tilt.
- **Depth**: two shadows only: `--shadow-paper` (lying flat) and `--shadow-lift` (picked up).
- **Stamps** thump with a 2 px ink spread and a 90 ms micro-shake; the stamp's texture is a mask over a flat colour, so it stays crisp at any size.
- **Typewriter reveal** for the OB entry and key report lines: about 45 characters a second with a synthesized key click; one tap completes the text at once.

### 5.6 The case-photo treatment

Every generated image is shown through the same code-side treatment, which hides drift between images and makes them read as evidence rather than AI art:

| Layer | Spec |
|---|---|
| Colour | `filter: saturate(.82) contrast(1.04) sepia(.08)` |
| Grain | SVG fractal noise, `mix-blend-mode: overlay`, 16% opacity |
| Print border | 10 px warm white (#F7F3EA); 26–30 px at the bottom on Polaroid-style evidence prints |
| Mount by kind | Portraits are paper-clipped to the statement sheet. Locations are taped into the folder at two corners. Scene photos sit in corner mounts. Evidence close-ups sit in a kraft envelope with a window |
| Tilt | Seeded, ±2.5° |
| Label | In Amani's hand: the place and time for locations and scenes ("Ngara stage, 22:40"), the name for portraits, the exhibit number for evidence |
| Exhibit tag | Where an object carries writing that matters, the exact words are printed by the engine on a typed exhibit tag clipped to the photo (from the manifest's `transcribe` field: 30 images). The photo itself never carries the clue's words |

### 5.7 The reference screen (described; rendered in `docs/reference-screen.png`)

Case 1, the moment the folder opens, on a 390 × 844 pt iPhone:

1. **The room is the frame.** No navigation bar and no app chrome. The desk fills the screen and the lamp's pool sits top right. The status bar reads over the dark desk, so it never needs a band.
2. **The folder is the screen.** A manila folder lifts off the stack and opens on a hinge (Reduce Motion: a cross-fade). Its tab reads NGARA (case 1's `folderTab`) in region 1's concrete grey with a sodium-amber edge. A round "NAIROBI SCU 14 MAR" received stamp sits in the corner; it is decorative, never information.
3. **The title is street, the record is institution.** "THE LAST FARE" in Big Shoulders at 44 pt is the only display type on the page. "OB 41/14/03 · Case 001 · Fri 14 March" sits above it in Plex Mono.
4. **The OB entry types itself in.** A strip of OB ledger page (green rules, red margin, 22:52 in the margin column) carries the entry in Courier Prime at 15 pt, arriving at typewriter speed. Amani's highlighter marks the first fact the notebook logs ("argued with his conductor", `f_ob_argument`), so on screen one the player sees that reading carefully is the game.
5. **The photo is evidence.** The Ngara stage photo arrives clipped to the folder, tilted, bordered, grained and labelled "Ngara stage, 22:40" in Amani's hand. Beside it, a kraft exhibit tag: "EXHIBIT 1 · Fare pouch, on the body, not taken".
6. **One action, written as an action.** The only call to action is a typed index card: "VISIT: NGARA STAGE →", full width, 48 pt tall, with the stamp-red arrow as its only colour.
7. **Navigation is objects with words.** Along the desk edge: Notebook (a spiral pad), Board (a square of cork with two pins and string), Phone (face down, with a red "2" badge) and Charge sheet (a carbon form), each labelled in text and each a 70 × 86 pt target. VoiceOver reads them as buttons with their labels; the badge reads "2 new messages".
8. **Colour never carries meaning alone.** Stamp red appears three times (the received stamp, the arrow, the badge) and each has a word or a shape.

### 5.8 Document templates (the 31 `render` kinds)

Every document is drawn in code from the case data, so text stays sharp, accessible and translatable. Counts are uses across the 100 case files.

| Render | Uses | Drawn as |
|---|---|---|
| `statement` | 306 | Police statement form on `--paper`: a typed header (name, age, occupation, date, recorded by "Det. A. Mwenda"), a numbered statement body in Courier Prime, and a signature line with the witness's initials in their own hand. Claims the player can press are underlined in pencil once pressed; a caught lie is struck through with a CONTRADICTED tag |
| `object` | 298 | An evidence photo (5.6) in a kraft envelope, with an exhibit tag listing what Amani notices; objects without a photo get a pencil sketch on an exhibit card |
| `labReport` | 250 | A forensic lab form on `--paper` with a carbon "COPY" stamp: an exhibit / test / result table in Plex Mono, submitted and reported times, and the hours elapsed. It arrives face down and flips when the clock reaches it |
| `logBook` | 160 | A bound ledger page (`--ledger`, green rules): dated rows in Plex Mono, entries in the keeper's hand where the case data marks them |
| `form` | 145 | A generic official form: a boxed field grid, typed answers, a rubber stamp; carbon blue where the case calls it a copy |
| `sceneNote` | 124 | A scene-of-crime note: Amani's typed observations on a half sheet, with the scene photo in corner mounts. "Report language only" (never graphic) |
| `manifest` | 100 | Records returned on request: a computer printout with tractor-feed holes, Plex Mono, alternating pale green bands, the request reference and "Obtained under records request" at the top |
| `receipt` | 44 | A thermal or carbon receipt: narrow, slightly curled, fading Plex Mono, a till or M-number, a total |
| `note` | 38 | A handwritten note on lined or torn paper, in the writer's hand (a second handwriting style, distinct from Amani's) |
| `ledger` | 34 | A chama or business cash book: columns for date, item, in, out, balance; running totals in Plex Mono |
| `visitorRegister` | 21 | A gate or reception register: columns for time, name, ID number, to see, sign; each row in a different hand |
| `board` | 16 | A notice or duty board photographed as a document: chalk or marker on a painted board, transcribed beneath |
| `ticket` / `ticketBook` | 15 / 2 | Bus, matatu or rail tickets: small printed stock with a perforated stub; a ticket book shows the counterfoils |
| `tallyBook` | 10 | A stage marshal's tally book: plate, driver, in, out; the footer note in the marshal's hand |
| `letter` | 10 | A typed or handwritten letter on letterhead (fictional institutions only), with signature and envelope |
| `smsThread` | 9 | A phone screen in the system face: bubbles, timestamps, contact names as saved |
| `sketch` | 7 | A forensic sketch on graph paper: plan view, measurements, a north arrow, numbered items |
| `timetable` | 7 | A printed or painted timetable; the relevant row is highlighted only when the player has the fact that makes it matter |
| `photo` | 7 | A found photograph (a print inside the evidence), with the same treatment and a "found item" tag |
| `mastRecord` | 6 | A carrier mast record: a printout with cell IDs, sectors and times; a small coverage diagram drawn in code |
| `pesapapStatement` | 5 | The fictional mobile-money statement: transaction ID, date, details, in/out, balance; also shown as an SMS where the case gives one |
| `tag` / `jobBook` | 5 / 5 | A repair tag; a workshop job book |
| `calendar` / `orderBook` / `phoneLog` / `video` | 2 each | A wall or desk calendar; a printer's order book; a call log; a CCTV still sequence with timestamps |
| `feeBook` / `collectionSlip` / `cctv` | 1 each | A fee receipt book; a courier collection slip; a single CCTV still |

Every template follows the same rules: text from the case data (never baked into an image), ink on paper at ≥ 4.5:1, a typed title strip in the display face, VoiceOver reading the document top to bottom, and the plain-text mode swapping the faces.

### 5.9 The master image style prompt

Every image prompt is compiled from the case data by `tools/compile-prompts.mjs`, never written by hand. A prompt has five parts, in this order.

**1. The master prefix** (identical on all 1,127 images):

> Documentary photograph for a Kenyan police case file. Shot on 35 mm colour film with a standard lens: natural available light, true-to-life colour slightly muted and warm, fine even film grain, honest exposure, no HDR, no glow, no bokeh effects, no retouching. Contemporary Kenya, the 2020s. Ordinary and unglamorous: real wear, real dust, real clutter, real weather. People look like real people photographed by a tired police photographer, not models.

**2. The kind wrapper:**

| Kind | Count | Ratio and size | Wrapper |
|---|---|---|---|
| Portrait | 530 (incl. 16 recurring-cast references) | 3:4, 1K | Head-and-shoulders identification photograph. The subject faces the camera, shoulders square, centred, eyes on the upper third, against a plain pale grey or off-white wall. Even, flat front light like a station ID camera, a faint shadow behind the shoulders. Expression exactly as described; no smile unless stated. |
| Location | 325 | 3:2, 2K | Establishing photograph of a real kind of place in Kenya, taken at eye level from where an investigator would stand on arrival. Natural 35 mm perspective, everything in focus, people absent or distant and unidentifiable. Light and time of day as described; if not stated, bright overcast daylight. |
| Scene | 90 | 4:3, 2K | Crime-scene record photograph of the place after the event, slightly above eye level, flat on-camera flash or the available light, documentary and still. The event is implied only by what was left behind. |
| Evidence | 182 | 1:1, 1K | Close-up evidence photograph of the object as it was found, in its place, filling about two thirds of the frame, soft even light or flat flash, sharp detail on the object, the surroundings plain and slightly out of focus. No ruler, no numbered marker (the case file adds its own). |

**3. The brief**, rewritten by four rules:

- **Community words are dropped from portraits.** "Kenyan Luo man" becomes "Kenyan man", "Swahili Kenyan woman" becomes "Kenyan woman". Communities stay in the case data for the fairness audit, but a generator asked for "a Luo man" or "a Kalenjin woman" reaches for stereotyped features. Clothing, age, work and expression already carry who someone is (a kanzu and kofia, a buibui, a red shuka). "Kenyan Asian" and "Kenyan European" are kept, because they change what the person looks like rather than inviting a caricature. Place names are untouched ("Lake Turkana" stays). After the rewrite: 273 "Kenyan man", 173 "Kenyan woman", 11 Kenyan Asian, 10 Kenyan European, the rest by age word (elder, youth, grandmother).
- **Writing never carries a clue in a photo.** Any quoted or capitalised wording an object should carry ("a ticket reading 'Kitui 05:45 Seat 14'") is taken out of the prompt ("lettering, too small and soft to read") and returned as `transcribe` in the manifest; the engine prints it exactly on the exhibit tag. A generator can't misspell a clue, and the words stay accessible and translatable. 30 images.
- **Composition hints for tappable things.** For locations, up to five hotspots that are things (not people, and not records searches) become placement hints from their authored positions: "Kassim's tally book in the left third; Mercy's smokie cart in the right third". 291 hints across 325 locations. A placement pass after generation re-pins them exactly (5.10).
- **"ID-photo framing"** is removed from briefs, because the portrait wrapper says it.

**4. Continuity references.** A person who appears in more than one case is generated from their earlier image. The 16 recurring-cast portraits (`_campaign.json` `recurringCast`) are generated first; 21 later portraits attach one of them or an earlier case's portrait, listed in `_campaign.json` `imageContinuity` (for example Fundi: case 50 → 94 → 100, "now 53"). The compiler fails if two cases have portraits under the same name without a continuity entry: this check caught a real collision (a cellmate in case 94 shared case 83's "Kevin Otieno"; he is now Victor Omondi).

**5. The guardrails** (identical on all images):

> No readable text anywhere: any writing, signage, labels, number plates, screens or documents are out of focus, turned away or too small to read. No logos, brand names, flags, insignia or badges; uniforms are plain. No police officer, detective, photographer or camera visible; nobody looks at the camera except an ID-photo subject. No blood, wounds, injuries, dead bodies or nudity; weapons and tools appear only as still objects lying where they were found. Not an illustration, not a 3D render, not a painting.

The "no detective visible" rule keeps the game's promise that Amani is never shown. The compiler exits with an error if any community word, gore word, legible-text request, detective in frame or quoted wording survives the rewrite. On the current data: **1,127 prompts, 0 problems.**

**Output.** `prompts/_recurring.txt` (generate first), `prompts/case-001.txt` … `case-100.txt` (ready to paste, each block naming the file to save as and the reference to attach), `prompts/manifest.json` (one row per image, with ratio, size, file, reference and `transcribe`), and `prompts/batch-gemini.jsonl` (one Gemini request per line).

### 5.10 Image production pipeline (the decision deferred in §2.13)

**Recommendation: one generator, by script. Use Gemini's Nano Banana 2.1 through the Batch API, with ChatGPT only as a manual fallback for images that keep failing.**

| | Batch script, Gemini (recommended) | Paste into ChatGPT / Gemini apps | Batch script, OpenAI |
|---|---|---|---|
| Effort | One run per pass; you review images, not prompts | 1,127 manual pastes, saves and renames | One run per pass |
| Consistency | One model for every image | Two apps drifting; plan limits mid-run | One model |
| Reference images | Up to 4 characters and 10 objects per request (reported by a third-party model guide; check Google's image docs before relying on it) | Yes, manually | Yes (`gpt-image-2` lists image input) |
| Cost (verified) | $0.0336 per 1K image, $0.0504 per 2K; Batch half that ($0.0168 / $0.0252) | Subscription | Not verified this session (third-party listings only) |
| Data | Paid tier: Google says it doesn't use prompts or responses to improve its products | Consumer terms | API terms |

**Cost on the current manifest** (712 images at 1K, 415 at 2K): $44.84 at standard prices, **$22.42 on Batch**. With room to regenerate about half the images once, budget roughly **$35–70**.

**Run order.** (1) The 16 recurring-cast references, reviewed and approved by you. (2) Pass 1 on Batch: all 1,106 images without a reference. (3) Pass 2: the 21 continuity portraits, attaching the approved anchors. (4) Regenerate rejects.

**Who does what.** You create the Google AI Studio / Cloud billing account and the API key, and put the key in a Codespaces secret. Claude never sees or handles the key. The script (`tools/generate-images.mjs`, written at build time) reads `batch-gemini.jsonl`, submits it, downloads the results to `www/img/…`, converts them to WebP and writes a review sheet.

**Ship sizes.** Portraits are displayed at about 120 pt and locations at full width (366 pt), so files are stored at display size × 3: portraits 600 × 800, locations and scenes 1200 × 800, evidence 800 × 800, WebP at about 75 quality. That's an estimated 70–80 MB of images, which keeps the download modest. The 2K generation size is for cropping headroom; the 2K masters stay outside the app.

**Review checklist (every image).** Reject and regenerate if any of these appear:
- readable or garbled text;
- a logo, insignia or flag;
- warped hands, extra fingers or a melted face;
- a face that resembles a real public figure;
- an age more than about ten years off the brief;
- a caricature;
- blood, a body or an injury;
- a detective or camera in frame;
- a hotspot object missing from a location;
- a recurring face that doesn't match its reference.

Portraits also go to the cultural reader.

**Hotspot placement pass.** Hotspot positions in the case data were authored before any image existed. After generation, a small local tool (`tools/place-hotspots.html`, built in the build phase) shows each location image with its pins and lets you drag them onto the right things, writing the positions back to the case JSON. That's 325 locations, about two hours.

### 5.11 Terms and policy check (re-checked 2 November 2026)

| Question | What I found | Status |
|---|---|---|
| Who owns Gemini API output? | "Google won't claim ownership over that content"; Google may generate similar content for others; you are responsible for your use. Paid Services: prompts and responses aren't used to improve Google's products, and are logged for a limited time for abuse monitoring. Free tier: may be used for training and reviewed by humans (and Nano Banana 2.1 has no free tier). Gemini API Additional Terms, effective 23 March 2026, updated 28 April 2026 | Confirmed (primary source) |
| Nano Banana 2.1 price | $0.0336 (1K), $0.0504 (2K), $0.113 (4K); Batch $0.0168 / $0.0252 / $0.0567; no free tier | Confirmed (Google's pricing page) |
| OpenAI output ownership | OpenAI's pages couldn't be fetched from this session. As of my training, OpenAI's terms assign output rights to the user | Not re-verified: check before any OpenAI image ships |
| OpenAI image prices | Third-party listings put `gpt-image-2` at $0.053 (medium, 1024²) and show `gpt-image-1.5` and `gpt-image-1-mini` retiring 1 December 2026 | Reported, not confirmed |
| App Store and AI images | Apple's 16 October 2026 guideline update targets AI non-consensual intimate imagery on user-generated-content platforms (1.2), bait-and-switch features (2.5.19) and trafficking or exploitation apps (section 5). I found no requirement to disclose pre-made AI artwork of fictional people | Reported (press coverage); re-check the live guidelines at submission |
| Fonts | All four faces are SIL OFL 1.1: free to bundle and ship, not to sell on their own; licences included in `www/fonts/licenses/` | Confirmed |

I'm not a lawyer; this is a reading of the published terms, not legal advice.

### 5.12 What deliverable 7 changed elsewhere

- `_campaign.json`: `imageContinuity` (11 people who recur across cases, with the anchor case for each).
- Case 94: the cellmate is now Victor Omondi (he collided with case 83's Kevin Otieno).
- New repo files: `www/styles/tokens.css`, `www/fonts/` (19 font files and 5 licences), `tools/contrast.mjs`, `tools/compile-prompts.mjs`, `docs/aesthetic-reference.html` and its screenshots, `docs/contrast.txt`, `prompts/` (103 files).
- The validator's image count (1,111) plus the 16 recurring-cast references gives the 1,127 prompts.

### 5.13 Decisions (made on approval, 2 November 2026)

1. **Display face: Big Shoulders Display.** Bungee's street character is kept without its width problem: on the three places the street speaks loudest (region title cards, the verdict screen's case title, CASE CLOSED), Big Shoulders is drawn as a painted sign: weight 900, sign-white fill, a thin ink outline and a two-step offset shadow in the region's accent (`www/styles/sign.css`). Everywhere else it is plain ink. Bungee and Anton are not used. This keeps three faces, fits every tab ("NYAHURURU" 98 pt at 22 pt), and gives the region cards the matatu and shop-sign look the brief asked for.
2. **Images: Gemini Nano Banana 2.1, Batch mode, by script, with your key in a Codespaces secret.** Runbook in §6.
3. **Community words are out of image prompts**, kept in the case data for the fairness audit.
4. **Night shift follows the phone's dark mode.**

---

## 6. Image production runbook (Gemini Nano Banana 2.1, Batch mode)

Tool: `tools/generate-images.mjs` (in the repo), run inside a GitHub Codespace. It reads `prompts/requests.json` and never changes a prompt. Every step costs money only when you run it, and every command prints its estimated cost before it spends anything.

### 6.1 What you set up (once, about 20 minutes)

**A. The repo and Codespace**
1. On GitHub (account `buhumaid3`), create a new **private** repository, `Kesi-App` (§7). Leave it empty: no README, no .gitignore.
2. GitHub can't create a Codespace on an empty repo, so give it one commit first: on the repo page click **creating a new file**, name it `README.md`, type `Kesi`, and **Commit changes**. Then open it in a Codespace: **Code → Codespaces → Create codespace on main**. (The zip's README replaces this placeholder in step 3.)
3. Drag `kesi-app-initial.zip` into the Codespace's Explorer, then in the terminal:
   ```
   unzip kesi-app-initial.zip && mv kesi/* kesi/.gitignore . && rmdir kesi && rm kesi-app-initial.zip
   mkdir -p planning && mv kesi-design-doc.md kesi-case-master-list.md planning/
   npm install
   npm run validate && npm run prompts
   git add -A && git commit -m "Kesi: case data, tools, tokens, prompts" && git push
   ```
   `npm run validate` should end with `100 cases · 0 errors`; `npm run prompts` with `1127 prompts … 0 problems` (it prints nothing after the count when there are no problems).

**B. The Gemini key, on a paid project**
1. Go to **Google AI Studio** (aistudio.google.com) and sign in with the Google account that will pay.
2. Open **Get API key → Create API key**, choosing **Create in new project** (name it `kesi-images`). Don't copy the key anywhere yet.
3. Turn on billing. At the bottom of the left sidebar choose **Settings → Plan information → Set up Billing for your chosen project**, then add a card in Google Cloud Billing.
4. Back on the **API keys** page, find the `kesi-images` project and click **Upgrade**; Google checks eligibility and applies the paid tier straight away. Nano Banana 2.1 has no free tier, so without this step every request fails. If the page still shows "Free tier" after billing is on, Google's developer forum has several reports of this; wait 15 minutes and reload before creating a second project.
5. **Set a budget alert.** In the Google Cloud console go to **Billing → Budgets & alerts → Create budget**, scope it to the `kesi-images` project, amount **$80**, with email alerts at 50%, 90% and 100%. A budget alert emails you; it doesn't stop spending. The script's estimates and the region-by-region order are the real brake.

**C. The key in GitHub, not in the code**
1. GitHub → `Kesi-App` → **Settings → Secrets and variables → Codespaces → New repository secret**.
2. Name `GEMINI_API_KEY`; value: copy the key from AI Studio's API keys page. Save.
3. In the Codespace you'll see "Your codespace secrets have changed": click **Reload** (or stop and restart the codespace). Check with `test -n "$GEMINI_API_KEY" && echo key present`. Never `echo` the key itself.

You do all of B and C yourself; I never see or handle the key.

### 6.2 The order of work

| Step | Command | Images | Est. cost | Time | You do |
|---|---|---|---|---|---|
| 1 Pilot | `npm run images -- pilot` | 4 (case 1: a portrait, the stage, the spanner, the scene) | $0.17 | ~1 min | Open `www/img/cases/001/`. Check the look against §5.9: film grain, muted colour, no text, ID-photo framing. If the look is wrong, stop and send me the four images; I'll adjust the master prompt before anything else runs |
| 2 Batch pilot | `npm run images -- batch --case 1`, later `status`, then `fetch` | 4 (the rest of case 1) | $0.07 | minutes to 24 h | Confirms that Batch honours the aspect ratio and size (`npm run images -- report` lists any wrong ratio) and that results map back to the right files |
| 3 Recurring cast | `npm run images -- refs` | 16 reference portraits | $0.54 | ~3 min | Approve each face carefully: these faces appear in many later cases. Reject with `redo` (step 6) until each is right |
| 4 Region 1 | `npm run images -- batch --region 1` → `status` → `fetch` | 66 more | ≈ $1.22 | within 24 h | Review sheet, rejects, redo (step 6) |
| 5 Regions 2–10 | `npm run images -- batch --region 2` … `--region 10` (all can be submitted the same day once region 1 looks right) | 1,016 | ≈ $20.43 | within 24 h each | One review sheet per region |
| 6 Review and redo | `npm run images -- review --region N`, then `redo --rejects` | rejects only | $0.034 each | minutes | See 6.3 |
| 7 Continuity | `npm run images -- continuity` (run once a region's locations and the portrait anchors in cases 10, 50, 74, 80, 90 and 96 are approved) | 21 portraits that attach an earlier face, and the 90 scene photos, each generated from its own case's location photo so the same vehicle and place appear in both | $5.25 | ~20 min | Check each face matches its reference, and each scene matches its location |
| 8 Commit | `git add www/img prompts/state.json && git commit -m "Region N images" && git push` | | | | After each approved region |
| 9 Back up the masters | `zip -qr kesi-masters.zip img-masters` and download it (right-click → Download) | | | | `img-masters/` is git-ignored (about 1–2 GB); keep a copy on your computer or Drive |

Expected total for the plan above: **≈ $25** (batch prices, with the pilot, references and continuity portraits generated interactively), plus regenerations (≈ $0.034 each). Budget **$35–70**.

**Why region by region:** each batch is small enough to review in one sitting, a problem in the prompts costs one region rather than 1,127 images, and approved regions can be committed while later ones are still running.

### 6.3 Reviewing

1. `npm run images -- review --region 1` writes `review/region-01.html`. Open it in the Codespace (right-click → **Open with Live Server** or **Preview**), or download it together with `www/img/`.
2. For each image, tick **reject** if it shows any of the following, and add a short note saying what's wrong ("too old, make him late 30s", "remove the sign text", "the tool wall should be on the right"):
   - readable or garbled text;
   - a logo, insignia or flag;
   - warped hands, extra fingers or a melted face;
   - a face that resembles a real public figure;
   - an age more than about ten years off the brief;
   - a caricature;
   - blood, a body or an injury;
   - a detective or camera in frame;
   - a hotspot object missing from a location;
   - a recurring face that doesn't match its reference;
   - a scene photo whose vehicle or place doesn't match its location photo.
3. Click **Collect rejects**, copy the text into `prompts/rejects.txt` (one `KEY  note` per line), then run `npm run images -- redo --rejects`. Each note is appended to that image's prompt as "Correction from review: …". Clear `rejects.txt` once a round is done.
4. Portraits also go to the cultural reader before release.

### 6.4 If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `GEMINI_API_KEY is not set` | Secret missing, or the codespace wasn't reloaded | 6.1 C, then reload |
| Every request fails with a quota or permission error | Project still on the free tier | 6.1 B step 4 (Upgrade) |
| `no image (SAFETY)` or another block reason | The model refused that prompt | `redo KEY` once; if it fails again, send me the key and I'll rewrite that brief |
| A job sits in `JOB_STATE_PENDING` for hours | Normal: Google's target is 24 hours | Keep checking `status`; after 48 hours a job expires and `fetch` returns its images to pending |
| `report` lists wrong aspect ratios | Batch ignored `imageConfig` | Stop after the batch pilot (step 2) and tell me; we'd switch to interactive generation (about twice the cost, ≈ $45 total) |
| Codespace runs out of disk | The masters are large | Download `img-masters` and delete older regions' masters |

### 6.5 Pilot findings (2 November 2026) and the fixes

The first four images (case 1) were reviewed:
- **Portrait (Moses Wafula): pass.** It matches the brief: early 40s, greying hair, maroon jacket over a checked shirt, ID-photo framing, and the film look.
- **Spanner: pass.** The L-shaped wheel brace has the white-painted handle and the juice carton. The light is warmer daylight rather than orange street light, which the photo treatment absorbs.
- **Location (Ngara stage): rejected.** It came back with a readable "KDK 418T" plate. The compiler itself had put the plate in, through a hotspot label ("Behind KDK 418T"). **Fix:** number plates (Kenyan `KXX 000X` and `GK …` formats) are now replaced with "the parked vehicle" in every brief and composition hint; 0 plates remain in the 1,127 prompts.
- **Scene (cap by the rear wheel): rejected.** It showed a white van with spray-painted spots, not the painted matatu in the location photo. Scene and location had been generated independently. **Fix:** every scene photo now attaches its own case's location photo as a reference ("this same place, taken earlier the same night: keep the same vehicles, paintwork, buildings, ground and light"). Scenes therefore move from the batch to the `continuity` step (90 images, +$2.27 against batch prices).

### 6.6 What the script does (for checking)

- **Requests.** Each one is `contents` (the compiled prompt) and `generation_config` with `responseModalities ['TEXT','IMAGE']` and `imageConfig {aspectRatio, imageSize}`. Batch jobs go in as JSONL through the Files API, keyed `NNN/id` (for example `001/p_moses`).
- **Results.** Results come back in request order (Google's documentation for the batch output file). The script uses the key when a line carries one and the order when it doesn't, and records failures without stopping.
- **Saving.** Each image is saved twice. The **master** goes to `img-masters/…` as WebP q92 at full size. The **game size** goes to `www/img/…` as WebP q75, cropped with attention-based framing: portraits 600 × 800, locations 1200 × 800, scenes 1200 × 900, evidence 800 × 800. The script records each image's real pixel size, so `report` flags any image whose ratio is off by more than 3%.
- **Bookkeeping.** `prompts/state.json` holds each image's status, attempts and money spent; `prompts/jobs.json` holds the batch jobs. Both are committed, so the record survives the codespace.
- **Testing.** The script was run end to end against a fake Gemini client here: pilot, batch submit, status, fetch (including a failed line with no key, resolved by order), refs, continuity, redo with a note, review and report. It has not yet run against the real API; steps 1 and 2 of the order of work are that test.

---

## 7. Repo name (deliverable 8, APPROVED)

**`Kesi-App`**, private, under `buhumaid3`.

| Option | For | Against |
|---|---|---|
| **`Kesi-App`** (recommended) | Matches `LiveWire-App` and `Chalkline-App`; already the name in this doc's file layout (§3.7); short; the App Store name lives in the app, not the repo | None |
| `Kesi-Kenya-Case-Files` | Spells out the full title | Long in every Codespaces and Codemagic screen; breaks the `-App` pattern |
| `Kesi` | Shortest | Breaks the pattern; ambiguous among your repos |

**Bundle ID:** use the same reverse-domain prefix as Live Wire and Chalkline, followed by `.kesi` (for example `<your-prefix>.kesi`). Capacitor's `appId` and the App Store Connect record must match it exactly. You create the App Store Connect record and the Codemagic app yourself; I don't handle those accounts.

**Repo layout once created:**

```
Kesi-App/
├── www/
│   ├── index.html          the engine (build phase)
│   ├── cases/              100 case files + _campaign.json
│   ├── styles/             tokens.css, sign.css
│   ├── fonts/              4 faces (OFL) + licences
│   └── img/                game-size images (committed)
├── tools/                  validate, export-script, compile-prompts, contrast, generate-images
├── prompts/                compiled prompts, requests.json, state.json, jobs.json
├── docs/                   scripts, player views, validation, contrast, aesthetic reference
├── planning/               design doc + master list (copies of the project docs)
├── img-masters/            full-size masters (git-ignored)
├── package.json, .gitignore
└── codemagic.yaml          (build phase: build fails if validate fails)
```

With deliverable 8 approved, the planning phase is complete. Next comes the build brief's next step: **build Region 1 as a playable vertical slice**, then playtest and adjust the mechanics before the image run is finished for later regions.

---

## 8. Build B1: Region 1 playable vertical slice (IN REVIEW)

The first build of the game itself: cases 1–10, start to finish, with the prologue, the cabinet, every beat of the case loop (§2.1), the hint calls, the verdict and the Pattern File unlock after case 10. Regions 2–10 are in the cabinet as shut drawers ("Not in this build").

### 8.1 What the player can do

| Beat (§2.1) | In the build |
|---|---|
| Prologue (§4.3) | Lamp click, the typed first line, the folder dropping onto the desk, Mwalimu's three lines, the optional desk drawer with Joseph's thin CLOSED folder. Skippable. The drawer stays on the desk shelf to reread |
| Cabinet | Region 1 drawer with ten folders (folder tab, number, title, stars, CLOSED stamp); later folders sealed until the one before is closed; "Continue" card; the desk shelf (Pattern File, collectibles, desk changes from the between-case beats, the drawer). Region title card the first time |
| 1. OB entry | Manila folder with region tab, received stamp, OB number and date; the OB entry types itself onto a ledger strip at ~45 characters a second (tap completes it) |
| 2. Scene | The place photo with numbered pins at the authored hotspot positions, the same hotspots as a list below (the accessible route), each tap shows what Amani notices and bags the exhibit; hotspots that unlock later (a matatu returning) appear when their fact is known |
| 3. Investigate | Places as VISIT cards; people as clipped ID cards; interviews with the intro line, what they say (claims), statements they give, and "Ask about" chips for every known person, place, exhibit and authored fact topic; a plain "I don't know" for anything without an authored answer, so the chips don't reveal which topics matter. The transcript stays |
| Exhibits | All 22 document kinds used in region 1, drawn in code: statement forms, ledgers and registers as tables, receipts and tickets as slips, printouts, notes in a second hand, the notice board, scene notes, exhibit tags. Photos get the full case-photo treatment (§5.6) and open full size with zoom (case 9's beat) |
| Notebook (§2.7) | Every fact auto-logged on discovery, grouped by people / places / exhibits, searchable; a Time tab that draws every `where` fact as a bar (cases 2 and 5); a pinned tray of six facts (case 9); the case glossary. New facts are highlighted until read |
| 4. Board (§2.6) | Corkboard with every person met, every exhibit, pinned facts and sticky notes; drag to arrange, red string between any two cards, saved per case, never graded |
| Hints (§2.8) | The phone: one call button per charge-sheet group, tier 1 → 2 → 3 in order, each labelled with the star cap it costs; tier 1 opens the card it names, tier 2 shows the two facts (or says where the missing one is) and pins both, tier 3 fills a blank. From case 7 Mwalimu offers the calls after the first returned sheet. Message history keeps every voice-note and Halima's texts |
| 5. Charge sheet (§2.3) | Carbon-copy form ("Murder, contrary to section 203 of the Penal Code"), the template sentence with blanks; tap a blank then a word, or drag a word onto a blank; the bank only holds discovered words; batch confirmation by group with Halima's pass or fail line and an ACCEPTED (double-ruled) or RETURNED (round) stamp |
| 6. Verdict | ACCEPTED stamp and Halima's line, CASE CLOSED and the title in the sign-painted treatment, stars with the reason, the reconstruction, "Why not the others" (every elimination), after-verdict beats, spine details filed (including any the player missed), the collectible, the desk change, Mwalimu's voice-note and Halima's text; next case, cabinet, or play again (best stars kept) |
| Case 1 tutorial | The seven guided voice-notes fire on their triggers; "Before you send it…" arms the submit button so the first press only plays the note |
| Settings (§2.12) | Text size S/M/L/XL, plain text mode, inline glossary, sounds, motion (system / reduce / full), playtest mode (all ten cases open), erase progress |

Stars follow §2.9 exactly: three with at most one returned sheet and no calls; two with a tier-1 or tier-2 call or 2–3 returned sheets; one with a tier-3 call or more than three returned sheets. Region 1 has no credibility stamps (they arrive in region 2); the engine already carries them.

### 8.2 How it is built

- **Engine as modules, not one file.** §3.7 said "engine (single file)". It is `www/index.html` plus five ES modules in `www/engine/` and `www/styles/app.css`: easier to review and test, no build step, and Capacitor serves them the same way. No frameworks, no dependencies at runtime.
- **One set of rules.** `www/engine/state.js` reproduces the validator's reachability simulation (§3.5 rule 2) as player actions: visiting a place, tapping a hotspot, interviewing, asking. What the validator proves reachable is exactly what a player can reach. It has no DOM, so the same file runs in node for the tests.
- **Save anywhere.** Every action saves (debounced, and immediately when the app goes to the background). Reopening the app returns to the open case and the open sheet: the place, the person, the exhibit, the notebook tab, the board, the phone or the charge sheet. The save is `localStorage` for now; the iOS build moves it to `@capacitor/preferences`, which iOS doesn't purge.
- **Images.** The game loads `img/cases/NNN/<id>.webp` for each person, place and exhibit with an image brief; anything not generated yet shows a striped "Photo pending" frame, so the build plays with or without images.
- **Sounds** are synthesized (typewriter keys, stamp thump, pin, phone chime): no audio files.
- **Accessibility.** Every pin has a list equivalent, every drag has a tap equivalent, every badge and stamp has a word, iOS Reduce Motion is followed (and can be forced either way), text scales to 130%, plain text mode swaps all three faces for the system font.

### 8.3 The hotspot placement pass (§5.10), built now

Hotspot positions were authored before the images existed, and the generated photos put things elsewhere (on case 1's stage the tally book is bottom left, not on the road). `npm run place` serves the game plus a placement tool at `/place`: pick a case and place, drag each numbered pin onto its thing (arrow keys nudge, Shift for 5×), Save writes the positions into the case file and marks the place `hotspotsPlaced: true` (a new optional field; the validator ignores it). The header counts places done out of 326. Do it region by region, after each region's images are approved, then commit.

### 8.4 What was tested

- `npm test` (`tests/autoplay.mjs`): for each of cases 1–10, exhaustive play through the engine's own actions, with a save-and-reload between every pass. All facts and exhibits are reachable in all ten cases; every proof fact, elimination fact and answer word is reachable; a wrong sheet is returned with a line; the right sheet is accepted; the three hint tiers work and tier 3 fills the blank.
- `tests/ui-smoke.mjs`: case 1 played through the interface on a 390 × 844 iPhone screen (prologue with the drawer, the stage, every hotspot, every interview and question, notebook, time view, board with string, a hint call, a returned and an accepted sheet, the verdict, the cabinet), plus resume after closing mid-case and a dark-mode pass.
- `tests/ui-region1.mjs`: all ten cases played through the interface, start to verdict. Result on 2 November 2026: in every case every fact and every exhibit was found through the interface, the verdict came back with three stars, the next case unlocked, and after case 10 the Pattern File opened with 5 pins (the case 6 calendar and four from case 10) and Rashid Omar's stamp went on the desk. No page errors.
- The validator still passes on all 100 cases (0 errors) after the name confirmations.

### 8.5 Not in this build

- Regions 2–10 mechanics (contradictions and pressing, warrants and credibility stamps, records, labs and the arrest clock, timeline strips, the map and travel, forgery, absence, accomplice, planted, real target, spine groups). The data and validator are ready; each region's build adds its mechanics.
- Haptics, the Capacitor wrap and `codemagic.yaml` (next step after this review).
- Desk objects as drawn objects: the between-case desk changes and collectibles appear as a list on the desk shelf for now.

### 8.6 What happens next

1. You play region 1 (`npm run play` in the Codespace, or on a phone through the forwarded port) and tell me what feels wrong.
2. Hotspot placement for region 1 once its images are approved.
3. A blind playtest of region 1 with real players (§3.6). The test tells us whether the reasoning is fair before regions 2–10 are built on the same engine.
4. Capacitor wrap and Codemagic, then TestFlight with region 1.

---

## 9. Build B2: stage 1 polish (IN REVIEW)

Approved on 2 November 2026 as stage 1 of the polish plan: new-mechanic tips, case intros, music and sound cues, and a voice pilot for Mwalimu and Halima. Stage 2 (after the region 1 playtest): a 2.5D depth effect on photos, local detective profiles, iCloud sync. Stage 3 (after launch): Game Center achievements and leaderboards, then a pass-and-play partner mode. True 3D, accounts and online real-time multiplayer were turned down (cost, App Store account rules, a free app with no server budget, and the approved paper-desk concept).

### 9.1 Mwalimu's tips for each new mechanic

`www/cases/_coach.json` holds one tip per interface beat (the `ui.beats` every case already lists). A tip plays once, as a Mwalimu voice-note, the first time its trigger happens in the first case that lists the beat: opening the case, the scene, an exhibit (optionally only certain document kinds), the notebook, the board, the phone or the charge sheet. Tips teach how to use a tool, never what a case means. Region 1 has 14 (registers, the Time tab, two places, paper side by side, a building, empty stretches on the clock, zoom, red herrings, timetables, what isn't there, three-step proofs, pinned facts, photo backgrounds, two blanks). Four basic tips play for anyone who starts somewhere other than case 1 (playtest mode). The case 7 hint offer moved into the same file. Settings → Mwalimu's tips → Replay plays them all again. Each later region adds its beats to this file as its mechanics are built.

### 9.2 Case intros

A title sequence of about five seconds when a case opens: the case's scene photo, darkened, pushing in slowly; the folder tab and CASE NNN · REGION; the title in the sign-painted treatment; the place and date in Amani's hand; the OB time typing in; the OB number stamped. A low drum and a slow minor chord play under it. One tap skips it. Reduce Motion shows it still. Settings → Case intros: first time (default), always, or off. It uses no art beyond the case's own photos.

### 9.3 Music and sound

`www/engine/audio.js` runs three volume buses (music, effects, voices) through Web Audio, because iOS ignores the volume of a plain audio element. Settings has a slider for each.
- **Music:** one loop per region plus a cabinet theme, from `www/audio/music/` as listed in its `manifest.json`. Until a track exists, a quiet procedural room tone plays: distant traffic, the lamp's hum. The music dips while someone speaks. The brief for a composer is `docs/music-brief.md`. **Recommendation:** commission a Kenyan composer on a written buyout licence. Use a royalty-free library only after reading its licence for app use. No AI-generated music until its commercial rights are documented.
- **Cues** (synthesized, no files): case intro, sheet ACCEPTED (a rising chord), RETURNED (two falling notes), CASE CLOSED, alongside the existing keys, stamps, pins and phone.

### 9.4 Voices: Mwalimu and Halima (pilot)

`tools/generate-voices.mjs` records their lines with Gemini text-to-speech (`gemini-3.8-flash-tts`, read from Google's docs 2 November 2026), using the same `GEMINI_API_KEY` secret as the images.
1. `design` creates three candidate voices for each from a written description ("a Kenyan woman in her late fifties, a senior police inspector in Nairobi, natural Kenyan English accent…") through Google's voice design, and saves a sample of each. `catalog` lists any library voices tagged Kenyan, as an alternative.
2. `pick mwalimu N` / `pick halima N` chooses one; `say mwalimu "…"` tests a single line.
3. `lines` compiles every line they speak in region 1: the prologue, the case 1 guidance, the tips, the hint calls, the between-case voice-notes (Mwalimu), and the ACCEPTED and RETURNED lines on every charge sheet (Halima). That is **89 lines, about 9–10 minutes of speech, ≈ $0.13** at 2026 prices ($9 per million audio tokens, 25 tokens a second; the price doubles on 1 January 2027). Voice design was not priced on Google's page.
4. `generate` records them as AAC (`www/audio/voice/<speaker>/<key>.m4a`; WAV if ffmpeg is missing) and writes the manifest; `review` makes a listening page with reject boxes; `redo --rejects` re-records with the review note added to the delivery instruction.

The game plays a recorded line whenever it shows that exact text (the file name comes from the text, so an edited line never plays an old recording). A voice-note with a recording stays up until it has been said. Every line stays on screen; voices are never the only way to get information. Amani is never voiced. Halima's between-case texts stay texts.

**Before rolling out:** a Kenyan listener judges the samples (accent, names, Swahili and Sheng words). If the AI voices don't pass, the alternative is two voice actors for these two characters only, about 10 minutes of script for region 1.

### 9.5 Tested

- The voice tool ran end to end against a fake Gemini client (design, pick, say, lines, generate with ffmpeg conversion, report, review). The game then played a recorded line through the voice bus in a browser. The calls follow the shapes in Google's speech-generation docs and the installed SDK's type definitions; the first live run is `design` then `say`.
- `npm test` and both interface tests pass with intros and tips on (the intro is screenshotted in `ui-smoke`); the validator still passes all 100 cases.

---

## 10. Build B3: motion, every screen size, every voice, 2.5D depth (IN REVIEW)

Asked for on 2 November 2026, moving two stage 2 items (depth) forward and widening the voice pilot to the whole cast.

### 10.1 Motion

All of it lives in `www/engine/motion.js` and `app.css`. Only `transform` and `opacity` animate, everything can be interrupted, and Reduce Motion turns movement into a simple appearance.

| Moment | What moves |
|---|---|
| The room | The desk lamp's pool of light drifts toward wherever you touch and eases home after six seconds; dust turns slowly in the light (26 specks at 30 frames a second, paused when the app is in the background) |
| Opening a case | The intro (§9.2); the folder opens on its hinge; sections, place cards, ID cards, exhibit tags and the desk objects are dealt in with a 34 ms stagger |
| Cabinet | Folders are dealt into the drawer, each settling at its own tilt |
| Sheets | Paper slides up with a slight tilt and settles with a spring; the desk dims behind it on phones (tap the dimmed desk to put the sheet away) |
| A place | Unexamined pins breathe (a soft ring); a pin flips when examined; the note about it unfolds; a kraft EXHIBIT tag flies from the pin to the notebook, which nods |
| Interviews | New facts fly to the notebook as paper slips (up to three); the newest answer unfolds |
| Notebook | Tabs turn like pages |
| Board | New red string draws itself across the cork |
| Charge sheet | A word snaps into its blank; a RETURNED sheet shivers |
| Verdict | ACCEPTED stamps down, CASE CLOSED is painted on left to right, the title rises, the stars pop one by one, then the reason; the reconstruction, eliminations and filed details are dealt in |
| Hover (mouse and trackpad) | Folders, cards and tags lift |

### 10.2 Every screen size

Tested on nine sizes, light and dark: iPhone SE (320 × 568), iPhone SE 3 (375 × 667), iPhone 15 (390 × 844), Pro Max (430 × 932), a phone on its side (844 × 390), iPad (768 × 1024), iPad landscape (1024 × 768), iPad Pro landscape (1366 × 1024) and a desktop (1440 × 900). `tests/ui-viewports.mjs` opens the cabinet, the desk, a place, an interview, an exhibit, the notebook, the board, the charge sheet and the verdict at each size and fails if anything makes the page scroll sideways, sticks out past the screen edge, or pushes the close button or the dock off screen.
- **Small phones:** a smaller dock and portrait, the statement header in one column.
- **Phones on their side:** the dock becomes a rail on the right so the folder keeps its height; sheets sit beside the rail.
- **Tablets and desktops (900 px and wider):** the folder stays on the left and places, people, exhibits, the notebook, the phone and the charge sheet open beside it, so the case stays in view while you read. The board and the Pattern File use the full width. The cabinet shows the drawer and the desk shelf side by side, and the verdict lays the reconstruction out in two columns.
- Long words wrap inside their paper instead of widening the page; titles scale with the screen.

### 10.3 2.5D depth

Each place and scene photo gets a depth map, a small greyscale image where white is near. The game draws the photo through a WebGL shader that shifts near things more than far ones, refined three times so edges don't tear. It moves when you drag across the photo, when you tilt the phone (optional: Settings → Tilt to look around, which asks iOS for motion access once), and otherwise drifts slowly by itself. It appears on the place photos, the case intro, scene notes and the reconstruction. Hotspot pins stay where they are: the shift is at most about 2% of the photo. A photo without a depth map, or a device without WebGL, stays a still photo. No more than four photos run the effect at once, and older ones are released (iOS limits WebGL contexts). Settings → Depth in photos turns it off.

**Making the depth maps:** `tools/make-depth.py`, run in the Codespace on its CPU, about 1–3 seconds a photo. It uses **Depth Anything V2 Small**, which is Apache-2.0 licensed (the project's licence section: Small is Apache-2.0; Base, Large and Giant are CC-BY-NC-4.0, so they are not used). It writes `loc_*.depth.webp` beside each photo (640 px wide, slightly blurred so edges don't tear, about 15 KB each) and lists them in `www/img/depth.json`. That is 416 photos, roughly 6 MB for the whole game. Tested here with a hand-made depth map, because Hugging Face can't be reached from my workspace; the first real run is yours.

### 10.4 A voice for every character

538 people speak across the 100 cases. Google keeps at most 200 designed voices per project, and an individually designed voice for every person would also make region-to-region quality hard to control. So the game works like a radio-drama company (`tools/voice-cast.mjs`):
- **47 company voices**, each designed from a written description: Kenyan women and men in four age bands (twenties, thirties to early forties, late forties and fifties, sixties and older) with different timbres, plus Kenyan Asian and Kenyan-born European voices for the 17 characters whose briefs say so. Each band is sized by the largest number of same-band speakers in any one case, plus two for variety.
- **Casting:** case by case, no two people in the same case share a voice (checked: 0 clashes in 100 cases), and a voice used in the case before is avoided where possible. **9 fixed voices** keep recurring people the same across the campaign (people in `imageContinuity`, such as Juma Mwakio, Fundi and the fourth-floor names). Mwalimu and Halima keep their own voices.
- **What is voiced:** only the words a character says. Interview intros are mostly narration ("Kassim takes off his kofia…"), so only the quoted words are spoken. Every answer to a question is voiced, as are claims written as speech ("Peter: "I left on my 22:30 trip…""). The four plain "I don't know" answers are recorded once per company voice. Amani is never voiced. Every line stays on screen, and a ▶ button replays any recorded line.
- **The delivery note** sent with each line comes from the character's occupation, age and stance (cooperative, guarded, with a lawyer), ending "everyday Kenyan speech, not theatrical".
- **Size and cost (Google's 2026 prices):** region 1 is 394 lines, about 30 minutes, ≈ $0.42. The whole game's character lines are about 1,660 lines and 114,000 characters, about 2.3 hours, ≈ $2 in 2026 (≈ $4 from 1 January 2027), plus Mwalimu, Halima and the company's "don't know" lines. Voice design itself was not priced on Google's page.
- **Gender** comes from each person's image brief or bio. The 94 people where neither says were set from their names when the cast was written. The list is in `tools/voice-cast.mjs` for the cultural reader to check.

Run order: `cast` (free), `design --cast --region 1` (33 voices for region 1, each with a sample in `review/voices/`), listen and `redesign SLOT "…"` any that are wrong, then `generate --region 1` and `review`. Each later region is designed and recorded when its mechanics are built, so its lines are final first.

### 10.5 Tested

`npm test`, `ui-smoke`, `ui-region1` (all ten cases through the interface) and `ui-viewports` (nine sizes) pass. The depth shader was checked in a browser against a hand-made depth map: near objects shift against the background when you drag. The whole voice pipeline was run against a fake Google client for all of region 1 (cast, design, 394 recordings, manifest), and the game played a character's answer, a company "don't know" line, and correctly skipped a narration-only intro.
