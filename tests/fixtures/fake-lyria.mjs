// A stand-in for the Gemini client in tests/music.mjs: returns a synthetic MP3 (a chord with a pulse at the
// prompt's tempo) instead of calling Lyria. Never used outside tests.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let n = 0;
export default {
  interactions: {
    async create({ model, input }) {
      const bpm = +(input.match(/Tempo: (\d+) BPM/)?.[1] || 80), secs = model.includes('clip') ? 30 : 40 + (n++ % 3) * 5;
      const f = path.join(os.tmpdir(), `fake-lyria-${process.pid}-${n}.mp3`);
      const beat = 60 / bpm;
      const expr = `0.2*sin(2*PI*220*t)+0.15*sin(2*PI*277.2*t)+0.12*sin(2*PI*329.6*t)+0.25*sin(2*PI*55*t)*exp(-6*mod(t\\,${beat.toFixed(4)}))`;
      const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-f', 'lavfi', '-i', `aevalsrc=${expr}:s=44100:d=${secs}`, '-ac', '2', '-b:a', '128k', f], { encoding: 'utf8' });
      if (r.status) throw new Error(r.stderr);
      const data = fs.readFileSync(f).toString('base64'); fs.rmSync(f);
      return { output_audio: { type: 'audio', data }, output_text: '' };
    },
  },
};
