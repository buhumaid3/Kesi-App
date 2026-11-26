# App Store listing and submission answers (release prep, 25 Nov 2026)

Everything App Store Connect asks for, ready to paste. Character limits checked. Apple's rules change; re-check the three flagged items at submission.

## App information

| Field | Value | Limit |
|---|---|---|
| Name | Kesi: Kenya Case Files | 22 / 30 |
| Subtitle | Solve 100 murders by deduction | 30 / 30 |
| Primary category | Games › Puzzle | |
| Secondary category | Games › Adventure | |
| Price | Free (no in-app purchases, no ads) | |
| Bundle ID | com.buhumaid.kesi | |
| Privacy policy URL | `https://<your-github-name>.github.io/kesi-site/privacy.html` (see "The website" below) | required |
| Support URL | `https://<your-github-name>.github.io/kesi-site/support.html` | required |
| Marketing URL | `https://<your-github-name>.github.io/kesi-site/` (optional) | |
| Copyright | 2026 Abdulla (or your company name) | |

**Keywords** (100 characters, comma-separated, no spaces; words already in the name are left out because Apple indexes the name):
`detective,mystery,murder,deduction,crime,puzzle,investigation,noir,clues,whodunit,Nairobi,sleuth` (96 / 100)

**Promotional text** (170; can be changed any time without review):
> A hundred murders across Kenya, from River Road to the Mara. Read the evidence, catch the lies, write the charge. No hints for sale, no ads, no guessing.  (152 / 170)

**Description** (4,000):
> Kesi is Swahili for a police case. In Kesi: Kenya Case Files you are a new detective at a small Nairobi unit, and every case on your desk is solved the same way real cases are: by reading carefully and proving it.
>
> 100 ORIGINAL CASES
> Ten regions, from the matatu stages of Nairobi to Mombasa's Old Town, the Rift Valley, Lake Victoria, the Maasai Mara, Mt Kenya, the northern frontier and the leafy suburbs. Every case is fiction; the streets, the slang and the way evidence works are Kenyan.
>
> DEDUCTION, NOT GUESSWORK
> There is no list of suspects to pick from. Names, weapons and motives reach your charge sheet only when you've discovered them. The prosecutor confirms only the parts of your charge that hold up, so guessing costs you, and reasoning pays.
>
> A DETECTIVE'S DESK
> Occurrence Book entries, statements, mobile-money statements, mast records, lab reports, title deeds, CCTV notes: dozens of kinds of paper, each drawn like the real thing. Walk the scene, question witnesses, press a claim with the fact that breaks it, pin it all to the corkboard with red string.
>
> GROWS WITH YOU
> New tools arrive region by region: lying witnesses and warrants, phone records, the lab and the 24-hour arrest clock, timelines, site maps and travel, forged documents, what is missing, accomplices and planted evidence.
>
> ONE STORY UNDER ALL OF IT
> Twelve years ago a land surveyor was found dead outside Nakuru and the file was closed in nine days. Small details keep turning up in unrelated cases. Follow them to the last file.
>
> FAIR AND FREE
> Free, with no ads and no hints for sale. Hints come as calls to your mentor; they cost stars, never money. Every case can be finished, and saves exactly where you left off.
>
> Plays offline. Text size, plain-text mode, VoiceOver labels and Reduce Motion are all supported.

**What's new** (first version): `The first hundred cases.`

## App Privacy ("nutrition label")

Answer: **Data Not Collected.** Basis (checked in the code on 25 Nov 2026): the app makes no network requests, has no analytics, no ads, no accounts and no third-party SDKs that collect data. Progress is saved only on the device (localStorage mirrored to iOS UserDefaults through Capacitor Preferences). The optional "tilt to look around" uses the phone's motion sensor on the device only and sends nothing. If any of that changes (analytics, crash reporting, iCloud sync), this answer must change first.

## Age rating

Apple's questionnaire changed in 2025 (new 13+, 16+ and 18+ tiers; every app had to answer the new questions by 31 January 2026). My reading of Kesi against Apple's definitions, for you to confirm in App Store Connect:

| Question | Answer | Why |
|---|---|---|
| Realistic violence | Infrequent / mild | Every case is a murder, but it is told in report language and never shown: no blood, bodies or injuries in any image (enforced in the image prompts) |
| Prolonged graphic or sadistic violence | None | |
| Guns or other weapons | Infrequent | Weapons appear as still evidence objects; guns are mentioned in 5 of 100 cases |
| Mature or suggestive themes | **Frequent** | Murder, corruption, fraud and grief run through every case |
| Alcohol, tobacco or drug references | Frequent | Alcohol comes up in 42 cases, drugs in 9, tobacco in 4 (references, never shown as a reward) |
| Horror / fear | None | |
| Medical | Infrequent | Autopsy and lab reports (findings, not treatment) |
| Profanity, sexual content, gambling, contests, loot boxes | None | |
| User-generated content, messaging, web access, advertising | No | |
| Parental controls, age assurance | No | |

**Likely result: 16+**, driven by frequent mature themes (Apple's table puts frequent mature or suggestive themes at 16+). If App Store Connect rates it lower from your answers, accept its result; don't under-answer to get a lower rating.

## Export compliance
Already answered in the build (`ITSAppUsesNonExemptEncryption = false`).

## Screenshots and preview
- `npm run store:shots` → `store/framed/6.9/` (1320 × 2868) and `store/framed/6.5/` (1242 × 2688), six each. Upload 6.9" (required); 6.5" optional (Apple scales).
- Re-run after the region 2–10 photos exist so the screens show real photos.
- Preview video storyboard: `docs/app-preview.md`.

## The website (privacy policy and support)

Apple needs a public privacy-policy URL and support URL. Your app repo is private, and GitHub Pages on a private repo needs a paid plan, so:
1. Create a **new public repo** `kesi-site` (no code in it).
2. Copy the three files from this repo's `site/` folder into it.
3. Settings → Pages → Source: deploy from branch `main`, folder `/ (root)`.
4. The pages appear at `https://<your-github-name>.github.io/kesi-site/` within a minute or two. Paste those URLs into App Store Connect.
5. Put a support email you're happy to publish into `site/support.html` and `site/privacy.html` (search for `SUPPORT_EMAIL`). A separate address for the game is better than your personal one.

Sources checked: Apple's age-rating values and definitions (App Store Connect Help); Apple's July 2025 notice on updated age ratings; App Store Connect Help on app privacy.
