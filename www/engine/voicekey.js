// The file key for a voiced line: the same function names the audio file when it is generated
// (tools/generate-voices.mjs) and finds it when the line is shown in the game. Change a line's text
// and its key changes, so a stale recording can never play under new words.
export function voiceKey(speaker, text) {
  const s = `${speaker}|${String(text).trim().replace(/\s+/g, ' ')}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `${speaker}/${h.toString(16).padStart(8, '0')}`;
}
