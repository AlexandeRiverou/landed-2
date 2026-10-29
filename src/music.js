// Calm generative soundtrack, synthesised live with WebAudio (no audio files): slow pad chords,
// a soft bass note, and sparse pentatonic plucks through an echo, all in a gentle reverb.
// Notes are scheduled a little ahead of the audio clock, so frame hiccups never cause gaps.

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

// A mood is a key, a chord loop and a tone colour. Zones (or anything else) can switch moods.
export const MOODS = {
  day: { root: 60, chords: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]], bright: 1300, pluckEvery: [1.6, 3.6] },
  dusk: { root: 57, chords: [[0, 3, 7, 10], [5, 8, 12, 15], [-2, 2, 5, 9], [3, 7, 10, 14]], bright: 900, pluckEvery: [2.2, 4.5] },
  dream: { root: 62, chords: [[0, 4, 7, 14], [5, 9, 12, 19], [2, 5, 9, 16], [7, 11, 14, 21]], bright: 1600, pluckEvery: [1.2, 2.8] },
  space: { root: 55, chords: [[0, 7, 14, 16], [-4, 3, 10, 14], [2, 9, 14, 17], [-2, 5, 12, 17]], bright: 700, pluckEvery: [2.8, 6] },
};

const CHORD_LEN = 9;   // seconds per chord
const AHEAD = 1.5;     // schedule this far ahead of the audio clock
const PENTATONIC = [0, 2, 4, 7, 9];

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

    // Echo for the plucks.
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(this.tone);

    this.mood = MOODS.day;
    this.chordIndex = 0;
    this.nextChord = ctx.currentTime + 0.2;
    this.nextPluck = ctx.currentTime + 3;
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

  setMood(name) {
    const m = MOODS[name];
    if (!m || m === this.mood) return;
    this.mood = m;
    this.tone.frequency.setTargetAtTime(m.bright, this.ctx.currentTime, 3);
  }

  update() {
    const now = this.ctx.currentTime;
    // After a long stall (tab in background), resync instead of firing a burst of old notes.
    if (this.nextChord < now - 1) this.nextChord = now + 0.1;
    if (this.nextPluck < now - 1) this.nextPluck = now + 0.5;
    while (this.nextChord < now + AHEAD) {
      this.playChord(this.nextChord);
      this.nextChord += CHORD_LEN;
    }
    while (this.nextPluck < now + AHEAD) {
      this.playPluck(this.nextPluck);
      this.nextPluck += rand(...this.mood.pluckEvery);
    }
  }

  playChord(t) {
    const m = this.mood;
    const chord = m.chords[this.chordIndex++ % m.chords.length];
    this.current = chord;
    for (const n of chord) {
      for (const [type, detune, vol] of [['triangle', -6, 0.035], ['sine', 7, 0.045]]) {
        this.voice(t, mtof(m.root + n), type, detune, vol, 3.5, CHORD_LEN + 1, 4);
      }
    }
    this.voice(t, mtof(m.root + chord[0] - 24), 'sine', 0, 0.06, 2.5, CHORD_LEN, 3); // bass
  }

  playPluck(t) {
    const m = this.mood;
    const base = (this.current || m.chords[0])[0];
    const note = m.root + base + PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)] + (Math.random() < 0.5 ? 12 : 24);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = mtof(note);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    o.connect(g);
    g.connect(this.tone);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + 2.7);
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
