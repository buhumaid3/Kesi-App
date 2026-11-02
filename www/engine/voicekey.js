// Shared by the game and tools/generate-voices.mjs, so a line is recorded and found under the same key.

// The file key for a voiced line. Change a line's text and its key changes, so a stale recording can never
// play under new words.
export function voiceKey(speaker, text) {
  const s = `${speaker}|${String(text).trim().replace(/\s+/g, ' ')}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `${speaker}/${h.toString(16).padStart(8, '0')}`;
}

// The speaker key for a character in a case: c001-p_kassim.
export const characterKey = (caseNo, personId) => `c${String(caseNo).padStart(3, '0')}-${personId}`;

// What a character actually says out loud in a piece of text.
//  · reply: the whole reply is speech.
//  · intro: only the words inside quotation marks; the rest is narration ("Kassim takes off his kofia…").
//  · claim: only "Name: "words"" lines; a reported claim ("Peter says his spanner…") is not voiced.
const QUOTES = /["“]([^"”]+)["”]/g;
export function spokenText(kind, text) {
  if (!text) return null;
  const t = String(text).trim();
  if (kind === 'reply') return t.replace(/^["“]|["”]$/g, '').trim() || null;
  if (kind === 'reaction' && !/["“]/.test(t)) return t;
  if (kind === 'claim' && !/^[^:"“]{1,48}:\s*["“]/.test(t)) return null;
  const parts = [...t.matchAll(QUOTES)].map(m => m[1].trim()).filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}
