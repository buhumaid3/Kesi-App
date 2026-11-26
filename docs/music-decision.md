# Music: the decision (P1, 24 November 2026)

**Recommendation: route A.** Generate the score with Google's Lyria through the Gemini API (the paid tier, on the same `kesi-images` project and `GEMINI_API_KEY`), and make the short cues and stings in code. Keep route B (a Kenyan composer on a buyout licence) as an upgrade, for the cabinet theme and the finale, if budget allows later.

## What was checked, and how sure it is

| Finding | Status | Source |
|---|---|---|
| Lyria 3.5 (`lyria-3.5`) makes full-length tracks; the length is steered in the prompt ("create a 2-minute…", or timestamps). Lyria 3 Clip makes exactly 30 s | Confirmed (Google docs) | ai.google.dev/gemini-api/docs/music-generation |
| Instrumental only: there's no switch; you ask for it in the prompt ("Instrumental only, no vocals.") | Confirmed (Google docs) | same |
| Output: 44.1 kHz stereo, MP3 by default, WAV available through `response_format` | Confirmed (Google docs; the WAV syntax isn't shown, so test it) | same |
| Every track carries an inaudible SynthID watermark | Confirmed (Google docs) | same |
| One prompt, one result: no iterative editing; the same prompt gives different takes | Confirmed (Google docs) | same |
| Prompts naming an artist's voice or copyrighted lyrics are blocked | Confirmed (Google docs) | same |
| Lyria 3.5 was released to the Gemini API as a public preview on 3 Sept 2026 | Reported (press) | ppc.land |
| **Ownership:** under the Gemini API Additional Terms, Google won't claim ownership of generated content; the developer is responsible for its use. This wording is general, not image-specific. It was verified for images in design doc §5.11 (terms effective 23 March 2026, updated 28 April 2026) | Strong inference that it covers music too. **The owner should read the current terms once before shipping**; I'm not a lawyer | ai.google.dev/gemini-api/terms |
| **Commercial use in an app:** no Google page says "yes, music in your app" in so many words. On the developer forum (13 Nov 2026) the reply to an iOS developer asking exactly this was "We can't provide specific legal guidance on this forum" | Not confirmed by Google; no clause found that forbids it | discuss.ai.google.dev, thread 199519 |
| Lyria on **Vertex AI** (Google Cloud, enterprise terms) is described as usable "for production and commercial purposes" | Reported (third-party summary, April 2026) | rightsdocket.com |
| **Copyright:** prompt-only output is "presumptively not human-authored" under current US Copyright Office guidance, so the tracks probably can't be registered, and someone else could reuse them | Reported (legal commentary) | rightsdocket.com |
| Price per track | Not found on the docs pages; the pricing page wasn't readable from this session | The owner checks ai.google.dev pricing before the first batch |

## What that means for Kesi

- **The risk is low for a free, ad-free game** whose music sits under reading. Google doesn't claim the output. Nothing found forbids using it in an app. The tracks being uncopyrightable only means someone could reuse them, which doesn't hurt Kesi.
- **The open point is the lack of an explicit "commercial use" sentence for the Gemini API.** Two ways to close it:
  1. The owner reads the current Gemini API Additional Terms once (10 minutes) and records the date in `docs/licences.md`.
  2. If anything in them is unclear, generate through **Vertex AI** on the same Google Cloud project instead, where enterprise terms state commercial use plainly. The tool can support both.
- **Never put an artist's name, a song title or "in the style of [artist]" in a prompt.** Describe instruments, tempo, mood and place only. This is both Google's filter and the safe practice.
- **Keep the SynthID watermark** (it can't be removed and shouldn't be).
- **Log every track** in `docs/licences.md`: model, date, prompt and take number.

## The three routes, compared

| | A. Lyria (recommended) | B. Kenyan composer | C. Composed in code |
|---|---|---|---|
| Quality | Good to very good; varies by take, so pick from several | Best, and truly Kenyan | Fine for cues and ambience; not for themes |
| Rights | Google doesn't claim them; no explicit commercial sentence for the Gemini API; uncopyrightable | Clean, by written buyout | Clean (ours) |
| Cost | Pay per generation (check the price); the whole score is probably a few dollars | Hundreds to thousands of dollars | None |
| Time | Days | Weeks | Days |
| Who does it | Claude writes the tool and prompts; the owner runs `generate` with his key and approves takes | The owner hires; Claude prepares the brief (`docs/music-brief.md` exists) | Claude |

**Plan:** A for the cabinet theme, the ten regions, the finale and the launch sting. C for the UI cues, foley and ambience. B later, if wanted, to replace the cabinet theme and the finale with a composer's.
