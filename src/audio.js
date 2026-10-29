// Tiny WebAudio synth: no audio files, just beeps with ambition.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(c.destination);

    this.engFilter = c.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engGain = c.createGain();
    this.engGain.gain.value = 0;
    this.eng = c.createOscillator(); this.eng.type = 'sawtooth'; this.eng.frequency.value = 70;
    this.eng2 = c.createOscillator(); this.eng2.type = 'square'; this.eng2.frequency.value = 35;
    this.eng.connect(this.engFilter); this.eng2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.eng.start(); this.eng2.start();

    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setEngine(ratio, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.eng.frequency.setTargetAtTime(55 + ratio * 70, t, 0.1);
    this.eng2.frequency.setTargetAtTime(28 + ratio * 35, t, 0.1);
    this.engFilter.frequency.setTargetAtTime(280 + ratio * 600, t, 0.1);
    this.engGain.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.2);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0, pan = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.3, freq = 1200, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  success() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.18, delay: i * 0.08 })); }
  ding(p = 1) { this.tone(880 * p, 0.3, { type: 'triangle', vol: 0.15 }); this.tone(1320 * p, 0.3, { type: 'sine', vol: 0.08, delay: 0.05 }); }
  pop() { this.tone(600, 0.12, { type: 'square', vol: 0.08, slide: 600 }); this.noise(0.08, { vol: 0.15, freq: 3000 }); }
  shoot() { this.tone(900, 0.08, { type: 'square', vol: 0.04, slide: -500 }); }
  hit() { this.noise(0.15, { vol: 0.25, freq: 2000 }); this.tone(160, 0.15, { type: 'sawtooth', vol: 0.1, slide: -80 }); }
  explode() { this.noise(1.0, { vol: 0.5, freq: 900 }); this.tone(90, 0.8, { type: 'sawtooth', vol: 0.15, slide: -60 }); }
  firework() { this.noise(0.5, { vol: 0.12, freq: 2500 }); }
  zap() { this.tone(1400, 0.2, { type: 'sawtooth', vol: 0.08, slide: -1200 }); this.noise(0.2, { vol: 0.2, freq: 5000 }); }
  ping(pan = 0, pitch = 1) { this.tone(1200 * pitch, 0.18, { type: 'sine', vol: 0.12, pan }); }
  honk() { this.tone(330, 0.22, { type: 'sawtooth', vol: 0.12, slide: -60 }); this.tone(320, 0.22, { type: 'square', vol: 0.05, slide: -60 }); }
  nag() { this.tone(520, 0.12, { type: 'triangle', vol: 0.1 }); this.tone(390, 0.18, { type: 'triangle', vol: 0.1, delay: 0.12 }); }
  sad() { [392, 370, 349, 330].forEach((f, i) => this.tone(f, i === 3 ? 0.7 : 0.3, { type: 'sawtooth', vol: 0.07, delay: i * 0.3, slide: i === 3 ? -40 : 0 })); }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
}
