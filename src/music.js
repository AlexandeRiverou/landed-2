// Calm generative soundtrack, synthesised live with WebAudio (no audio files): slow pad chords,
// a soft bass note and a light top layer (plucks, an arpeggio, a little melody or a pulsing bass),
// all in a gentle reverb. The music moves in sections of a few chords: each section picks one of the
// mood's chord progressions, a texture, a pad colour and now and then a nearby key, so it never loops.
// Notes are scheduled a little ahead of the audio clock, so frame hiccups never cause gaps.

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MAJ = [0, 2, 4, 7, 9], MIN = [0, 3, 5, 7, 10]; // pentatonic scales (melodies are built from these)

// A mood is a key, a few chord progressions (semitones from the root), a tone colour and a taste in textures.
// root: key (MIDI) · len: seconds per chord · bright: filter cutoff · beat: seconds per arp / melody step
// tex: texture weights · home: texture of a mood's first section · pads: pad colours it may use · bass: octave of the bass
// Progression 0 + 'home' pad + the home texture is the mood's signature, heard whenever the mood starts.
export const MOODS = {
  day: {
    root: 60, len: 9, bright: 1300, beat: 0.42, pluckEvery: [1.6, 3.6], scale: MAJ, home: 'plucks',
    tex: { plucks: 3, arp: 2, motif: 2, pads: 1, pulse: 1 }, pads: ['home', 'airy', 'warm', 'glass'],
    progs: [
      [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]],   // Cmaj7 Am F G7 (the original loop)
      [[5, 9, 12, 16], [7, 11, 14, 21], [4, 7, 11, 14], [9, 12, 16, 19]],  // Fmaj7 Gadd9 Em7 Am
      [[0, 7, 12, 16], [-1, 7, 11, 14], [-3, 7, 12, 16], [5, 9, 12, 16]],  // C G/B Am7 Fmaj7
      [[2, 9, 12, 17], [7, 11, 14, 17], [0, 4, 11, 14], [0, 7, 11, 16]],   // Dm7 G7 Cmaj9 Cmaj7
    ],
  },
  dusk: {
    root: 57, len: 9, bright: 900, beat: 0.5, pluckEvery: [2.2, 4.5], scale: MIN, home: 'plucks',
    tex: { plucks: 3, pads: 2, motif: 2, pulse: 1, arp: 1 }, pads: ['home', 'warm', 'airy'],
    progs: [
      [[0, 3, 7, 10], [5, 8, 12, 15], [-2, 2, 5, 9], [3, 7, 10, 14]],      // Am7 Dm7 Gmaj7 Cmaj7 (the original loop)
      [[0, 3, 7, 10], [-4, 3, 7, 12], [3, 7, 10, 14], [-2, 5, 10, 14]],    // Am7 Fmaj7 Cmaj7 G
      [[5, 8, 12, 15], [0, 7, 10, 15], [7, 10, 14, 17], [0, 3, 7, 14]],    // Dm7 Am7 Em7 Am9
      [[0, 7, 12, 14], [-2, 5, 10, 12], [-4, 3, 7, 12], [-5, 0, 2, 7]],    // Asus2 Gsus2 Fmaj7 Esus4
    ],
  },
  dream: {
    root: 62, len: 9, bright: 1600, beat: 0.45, pluckEvery: [1.2, 2.8], scale: MAJ, home: 'plucks',
    tex: { plucks: 3, arp: 2, motif: 2, pads: 2 }, pads: ['home', 'airy', 'glass'],
    progs: [
      [[0, 4, 7, 14], [5, 9, 12, 19], [2, 5, 9, 16], [7, 11, 14, 21]],     // the original loop
      [[0, 7, 11, 16], [-3, 4, 7, 14], [5, 9, 12, 16], [7, 11, 14, 19]],   // Dmaj9 Bm7 Gmaj7 A
      [[0, 4, 9, 14], [5, 12, 16, 21], [2, 9, 12, 17], [7, 14, 16, 21]],   // D6/9 Gmaj7 Em7 A6sus2
      [[0, 4, 11, 16], [2, 6, 9, 14], [0, 7, 11, 16], [2, 9, 14, 18]],     // Dmaj7 E (lydian) Dmaj7 E
    ],
  },
  space: {
    root: 55, len: 10, bright: 700, beat: 0.6, pluckEvery: [2.8, 6], scale: MAJ, home: 'plucks',
    tex: { pads: 4, plucks: 3, motif: 1, pulse: 1 }, pads: ['home', 'airy', 'glass'],
    progs: [
      [[0, 7, 14, 16], [-4, 3, 10, 14], [2, 9, 14, 17], [-2, 5, 12, 17]],  // the original loop
      [[0, 7, 12, 14], [-2, 5, 10, 15], [0, 7, 12, 17], [-5, 2, 7, 12]],   // open fifths
      [[0, 5, 10, 14], [3, 10, 14, 19], [-4, 3, 7, 14], [-2, 5, 9, 14]],   // quartal drift
    ],
  },
  // Underwater and underground: low, dark and slow, with a heartbeat of a bass.
  deep: {
    root: 50, len: 11, bright: 650, beat: 0.55, pluckEvery: [2.6, 5.5], scale: MIN, home: 'pads', bass: -12,
    tex: { pads: 3, pulse: 2, plucks: 2, motif: 1 }, pads: ['home', 'warm', 'hollow'],
    progs: [
      [[0, 7, 10, 15], [-4, 3, 7, 12], [-2, 5, 10, 14], [0, 7, 12, 15]],   // Dm7 Bbmaj7 C Dm
      [[0, 3, 7, 14], [5, 8, 12, 15], [3, 7, 10, 14], [-5, 2, 7, 10]],     // Dm9 Gm7 Fmaj7 Am
      [[0, 5, 10, 15], [-2, 3, 8, 12], [-4, 3, 7, 14], [-5, 0, 7, 10]],    // quartal Dm, Csus, Bbmaj7, Am7sus
    ],
  },
  // The volcano: warm and smouldering, a slow pulse under minor chords.
  ember: {
    root: 52, len: 9, bright: 800, beat: 0.5, pluckEvery: [2.2, 4.8], scale: MIN, home: 'pulse', bass: -12,
    tex: { pulse: 3, pads: 2, motif: 2, plucks: 1 }, pads: ['home', 'warm', 'hollow'],
    progs: [
      [[0, 7, 10, 14], [-4, 3, 7, 12], [5, 8, 12, 15], [-2, 5, 10, 14]],   // Em9 Cmaj7 Am7 D
      [[0, 3, 7, 14], [-2, 2, 5, 10], [-4, 0, 3, 7], [-5, -2, 2, 7]],      // Em9 D Cmaj7 Bm
      [[0, 7, 12, 15], [5, 12, 15, 19], [3, 10, 14, 19], [-2, 5, 10, 14]], // Em Am9 Gmaj7 D
    ],
  },
  // The synthwave grid: the classic minor four-chord turn, with a soft arpeggio ticking along.
  retro: {
    root: 57, len: 8, bright: 1400, beat: 0.36, pluckEvery: [1.8, 3.6], scale: MIN, home: 'arp',
    tex: { arp: 4, pulse: 2, motif: 2, pads: 1 }, pads: ['home', 'warm', 'glass'],
    progs: [
      [[0, 3, 7, 12], [-4, 0, 3, 8], [3, 7, 10, 15], [-2, 2, 5, 10]],      // Am F C G
      [[-4, 3, 8, 12], [-2, 5, 10, 14], [0, 7, 12, 15], [0, 3, 7, 10]],    // F G Am Am7
      [[0, 3, 7, 12], [-5, 2, 7, 10], [-4, 3, 8, 12], [-2, 5, 10, 14]],    // Am Em F G
      [[3, 10, 15, 19], [-2, 5, 10, 14], [0, 7, 12, 15], [-4, 3, 8, 12]],  // C G Am F
    ],
  },
  // Snow and ice: high, open and glassy, lots of air between the notes.
  frost: {
    root: 64, len: 10, bright: 1700, beat: 0.48, pluckEvery: [2.4, 5], scale: MAJ, home: 'plucks',
    tex: { plucks: 3, pads: 3, motif: 2, arp: 1 }, pads: ['home', 'airy', 'glass'],
    progs: [
      [[0, 7, 14, 16], [-3, 4, 11, 14], [5, 12, 16, 21], [7, 14, 16, 21]], // Eadd9 C#m7 Amaj7 Bsus
      [[0, 4, 11, 14], [-7, 2, 9, 12], [-5, 2, 7, 11], [0, 7, 11, 14]],    // Emaj9 A6/9 B Emaj7
      [[0, 7, 11, 18], [2, 9, 14, 18], [-3, 4, 9, 14], [0, 7, 14, 19]],    // Emaj7#11 F# C#m E (lydian)
    ],
  },
  // Candy, mushrooms and alien skies: bright lydian chords, sparkly arpeggios and little tunes.
  wonder: {
    root: 65, len: 8, bright: 1500, beat: 0.4, pluckEvery: [1.4, 3], scale: MAJ, home: 'arp',
    tex: { arp: 3, motif: 3, plucks: 2, pads: 1 }, pads: ['home', 'airy', 'glass'],
    progs: [
      [[0, 4, 11, 14], [2, 9, 14, 18], [-3, 4, 9, 12], [7, 11, 14, 19]],   // Fmaj9 G Dm C
      [[0, 7, 11, 16], [-3, 4, 7, 14], [5, 9, 12, 16], [7, 11, 14, 21]],   // Fmaj7 Dm7 Bbmaj7 Cadd9
      [[0, 4, 7, 14], [2, 6, 9, 14], [4, 7, 11, 16], [-5, 2, 7, 11]],      // Fadd9 G Am C
    ],
  },
};

// Pad colours: [oscillator, detune (cents), volume, octave offset] per layer. All soft waveforms, no saws.
const PADS = {
  home: [['triangle', -6, 0.035, 0], ['sine', 7, 0.045, 0]], // the original pad
  airy: [['sine', -5, 0.045, 0], ['sine', 4, 0.016, 12]],    // sine with a faint octave above
  warm: [['triangle', -10, 0.03, 0], ['triangle', 9, 0.03, 0]],
  glass: [['sine', 0, 0.05, 0], ['triangle', 4, 0.01, 12]],
  hollow: [['triangle', 0, 0.035, 0], ['sine', -4, 0.03, -12]],
};
const ARPS = [[0, 1, 2, 3, 2, 1], [0, 2, 1, 3], [0, 1, 2, 3, 1, 2, 3, 2], [3, 2, 1, 0, 1, 2]];
const KEYS = [5, -5, 2, -2]; // key changes away from home: up a 4th, down a 4th (a 5th, folded down), a tone either way
const SECTION = 4;            // chords per section
const AHEAD = 1.5;            // schedule this far ahead of the audio clock

// Weighted choice over { name: weight }, skipping `avoid` (unless it's the only option).
function weighted(weights, avoid) {
  const names = Object.keys(weights).filter((k) => k !== avoid || Object.keys(weights).length === 1);
  let r = Math.random() * names.reduce((s, k) => s + weights[k], 0);
  for (const k of names) if ((r -= weights[k]) < 0) return k;
  return names[names.length - 1];
}

// A short melody: 4-6 steps through two octaves of the mood's pentatonic scale, each 1-3 beats long.
function makeMotif(scale) {
  const top = scale.length * 2 - 1;
  let i = 2 + Math.floor(Math.random() * 4);
  const notes = [];
  for (let k = 3 + Math.floor(Math.random() * 3); k >= 0; k--) {
    notes.push({ i, beats: k ? pick([1, 1, 2, 2, 3]) : 3 });
    i = clamp(i + pick([-2, -1, -1, 1, 1, 2]), 0, top);
  }
  return notes;
}

// The next section, after `prev` (or the mood's signature section if the mood just started).
// Pure apart from the dice, so the smoke test can roll it many times.
export function pickSection(moodName, prev) {
  const m = MOODS[moodName], n = prev ? prev.n + 1 : 0;
  let s;
  if (!prev || prev.mood !== moodName) s = { mood: moodName, progression: 0, texture: m.home, pad: 'home', shift: 0, bright: 1 };
  else {
    let progression = Math.floor(Math.random() * (m.progs.length - 1));
    if (progression >= prev.progression) progression++; // any progression but the last one
    // Key: from home, sometimes step to a nearby key; from away, usually drift back home. Never further.
    const shift = prev.shift === 0 ? (Math.random() < 0.3 ? pick(KEYS) : 0) : (Math.random() < 0.6 ? 0 : prev.shift);
    const pads = m.pads.filter((p) => p !== prev.pad);
    s = { mood: moodName, progression, texture: weighted(m.tex, prev.texture), pad: pick(pads), shift, bright: rand(0.8, 1.2) };
  }
  s.n = n;
  s.root = m.root + s.shift;
  s.arp = Math.floor(Math.random() * ARPS.length);
  if (s.texture === 'motif') s.motif = makeMotif(m.scale);
  return s;
}

export class Music {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    this.level = 0.5;
    this.enabled = true;
    this.ducked = false;

    // Soft room: a generated impulse response (decaying stereo noise).
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet);
    wet.connect(this.out);

    // Everything goes through a gentle low-pass so nothing is ever sharp.
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 1300;
    this.tone.Q.value = 0.3;
    this.tone.connect(this.out);
    this.tone.connect(this.reverb);

    // Echo for the plucks and melodies.
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(this.tone);

    this.moodName = 'day';
    this.mood = MOODS.day;
    this.section = null;   // debug handle: { mood, progression, texture, pad, root, shift, n, ... }
    this.chordIndex = 0;   // chords played in total
    this.inSection = 0;    // chords played in the current section
    this.played = [];      // the last few chords with their start times, so the top layer follows what's sounding
    this.nextChord = ctx.currentTime + 0.2;
    this.nextNote = ctx.currentTime + 3;
    this.fadeTo(this.level, 4);
  }

  fadeTo(v, seconds) {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(v, t + seconds);
  }

  target() { return !this.enabled ? 0 : this.ducked ? this.level * 0.4 : this.level; }

  toggle() {
    this.enabled = !this.enabled;
    this.fadeTo(this.target(), 1.5);
    return this.enabled;
  }

  duck(on) {
    if (this.ducked === on) return;
    this.ducked = on;
    this.fadeTo(this.target(), 1);
  }

  // The filter glides to the new colour now; the new mood's first section starts with the next chord.
  setMood(name) {
    const m = MOODS[name];
    if (!m || m === this.mood) return;
    this.mood = m;
    this.moodName = name;
    this.tone.frequency.setTargetAtTime(m.bright, this.ctx.currentTime, 3);
  }

  update() {
    const now = this.ctx.currentTime;
    // After a long stall (tab in background), resync instead of firing a burst of old notes.
    if (this.nextChord < now - 1) this.nextChord = now + 0.1;
    if (this.nextNote < now - 1) this.nextNote = now + 0.5;
    while (this.nextChord < now + AHEAD) this.nextChord += this.playChord(this.nextChord);
    // Bounded: every step moves nextNote forward by at least 0.2 s.
    while (this.nextNote < now + AHEAD) this.nextNote += Math.max(0.2, this.playNote(this.nextNote));
  }

  // Plays the next chord at time t (starting a new section when due) and returns its length.
  playChord(t) {
    if (!this.section || this.section.mood !== this.moodName || this.inSection >= SECTION) {
      this.section = pickSection(this.moodName, this.section);
      this.inSection = 0;
      this.tone.frequency.setTargetAtTime(this.mood.bright * this.section.bright, t, 3);
    }
    const s = this.section, m = MOODS[s.mood];
    const chord = m.progs[s.progression][this.inSection++];
    this.chordIndex++;
    this.played.push({ t, chord, section: s });
    if (this.played.length > 3) this.played.shift();
    const breathe = s.texture === 'pads'; // pads alone swell in more slowly and a touch fuller
    for (const n of chord) {
      for (const [type, detune, vol, oct] of PADS[s.pad]) {
        this.voice(t, mtof(s.root + n + oct), type, detune, vol * (breathe ? 1.15 : 1), breathe ? 5 : 3.5, m.len + 1, 4);
      }
    }
    this.voice(t, mtof(this.bassNote(s, chord)), 'sine', 0, 0.06, 2.5, m.len, 3);
    return m.len;
  }

  bassNote(s, chord) {
    let b = s.root + chord[0] + (MOODS[s.mood].bass ?? -24);
    while (b < 31) b += 12; // key changes never push the bass below a low B
    return b;
  }

  // The chord sounding at time t (chords are scheduled ahead, so this isn't always the newest one).
  chordAt(t) {
    for (let i = this.played.length - 1; i >= 0; i--) if (this.played[i].t <= t + 0.05) return this.played[i];
    return this.played[0];
  }

  // One step of the section's top layer at time t; returns the time to the next step.
  playNote(t) {
    const at = this.chordAt(t);
    if (!at) return 1;
    const s = at.section, m = MOODS[s.mood], chord = at.chord;
    switch (s.texture) {
      case 'plucks': { // the original: random pentatonic notes over the chord root, through the echo
        const note = s.root + chord[0] + MAJ[Math.floor(Math.random() * 5)] + (Math.random() < 0.5 ? 12 : 24);
        this.blip(t, note, 'sine', 0.05, 2.6, true);
        return rand(...m.pluckEvery);
      }
      case 'arp': { // a soft arpeggio up through the chord, with the odd rest
        const pat = ARPS[s.arp];
        this.arpStep = (this.arpStep || 0) + 1;
        let note = s.root + chord[pat[this.arpStep % pat.length]] + 12;
        if (note > 86) note -= 12;
        if (Math.random() > 0.12) this.blip(t, note, 'sine', 0.026, 1.4, false);
        return m.beat;
      }
      case 'motif': { // call & answer: the phrase repeats, the answer ends on the home note, small changes each time
        if (this.motifOf !== s) { this.motifOf = s; this.motifPos = 0; this.motifRep = 0; }
        const notes = s.motif, beat = m.beat * 2;
        if (this.motifPos >= notes.length) { // breathe between phrases
          this.motifPos = 0;
          this.motifRep++;
          return beat * (2 + Math.floor(Math.random() * 3));
        }
        const step = notes[this.motifPos++];
        let i = step.i;
        if (this.motifRep % 2 && this.motifPos === notes.length) i = i < m.scale.length ? 0 : m.scale.length; // answer resolves
        else if (Math.random() < 0.12) i = clamp(i + pick([-1, 1]), 0, m.scale.length * 2 - 1);
        const L = m.scale.length, note = s.root + (s.root < 56 ? 12 : 0) + m.scale[i % L] + 12 * Math.floor(i / L);
        this.blip(t, note, 'sine', 0.04, Math.min(3, step.beats * beat + 0.8), true);
        return step.beats * beat;
      }
      case 'pulse': { // a soft pulsing bass: root, root, fifth, root, every other beat
        this.pulseStep = ((this.pulseStep || 0) + 1) % 4;
        const note = this.bassNote(s, chord) + 12 + (this.pulseStep === 2 ? 7 : 0);
        this.blip(t, note, 'sine', this.pulseStep === 0 ? 0.05 : 0.035, m.beat * 2.2, false, 0.06);
        return m.beat * 2;
      }
      default: return 1; // 'pads': nothing on top, just the chords breathing
    }
  }

  // A short note with a quick swell and an exponential fade, optionally sent into the echo.
  blip(t, note, type, vol, decay, echo, attack = 0.02) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = mtof(note);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(this.tone);
    if (echo) g.connect(this.delay);
    o.start(t);
    o.stop(t + decay + 0.1);
  }

  voice(t, freq, type, detune, vol, attack, hold, release) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + hold);
    g.gain.linearRampToValueAtTime(0, t + hold + release);
    o.connect(g);
    g.connect(this.tone);
    o.start(t);
    o.stop(t + hold + release + 0.1);
  }
}
