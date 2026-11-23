// Tiny WebAudio synth: engine, gunshots, explosions, sirens and procedural radio.
export class GameAudio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  noiseBuf!: AudioBuffer;
  engOsc: OscillatorNode[] = [];
  engGain!: GainNode;
  engFilter!: BiquadFilterNode;
  sirenOsc!: OscillatorNode;
  sirenGain!: GainNode;
  radioGain!: GainNode;
  station = 0;
  step = 0;
  nextTime = 0;
  timer: number | null = null;
  muted = false;
  stations = ['OFF', 'NOVA FM · Synthwave', 'STREET BEATS · Hip-Hop', 'NEON DRIVE · House'];
  engineOn = false;

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    for (const [type, mult] of [['sawtooth', 1], ['square', 0.5], ['sawtooth', 2.01]] as [OscillatorType, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 50 * mult;
      const g = ctx.createGain();
      g.gain.value = mult === 2.01 ? 0.12 : 0.3;
      o.connect(g).connect(this.engFilter);
      o.start();
      this.engOsc.push(o);
    }
    this.engFilter.connect(this.engGain).connect(this.master);
    // siren
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'sawtooth';
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 1100;
    sf.Q.value = 0.8;
    this.sirenOsc.connect(sf).connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
    this.radioGain = ctx.createGain();
    this.radioGain.gain.value = 0.16;
    this.radioGain.connect(this.master);
  }

  setEngine(on: boolean, speed01: number, throttle: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 0.12 + (speed01 % 0.25) * 2.2 + speed01 * 0.5 + throttle * 0.08;
    const f = 38 + rpm * 120;
    this.engOsc[0].frequency.setTargetAtTime(f, t, 0.05);
    this.engOsc[1].frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engOsc[2].frequency.setTargetAtTime(f * 2.01, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(220 + rpm * 900 + throttle * 300, t, 0.08);
    this.engGain.gain.setTargetAtTime(on ? 0.1 + throttle * 0.07 : 0, t, 0.12);
    this.engineOn = on;
  }
  setSiren(vol: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 650 + 380 * (0.5 + 0.5 * Math.sin(t * 7));
    this.sirenOsc.frequency.setTargetAtTime(f, t, 0.02);
    this.sirenGain.gain.setTargetAtTime(Math.min(0.1, vol * 0.1), t, 0.1);
  }

  private noise(dur: number, vol: number, freq: number, q = 0.7, type: BiquadFilterType = 'bandpass', vp = 1, sweepTo = 0, pan = 0) {
    const c = this.ctx;
    if (!c || vol < 0.003) return;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol * vp, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(this.master);
    s.start(c.currentTime, Math.random() * 0.5, dur + 0.05);
  }
  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slideTo = 0, when = 0, dest?: AudioNode) {
    const c = this.ctx;
    if (!c) return;
    const o = c.createOscillator();
    o.type = type;
    const t0 = c.currentTime + when;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  shot(kind: string, vol = 1, pan = 0) {
    if (!this.ctx) return;
    if (kind === 'pistol') { this.noise(0.14, 0.5, 1800, 0.6, 'bandpass', vol, 400, pan); this.tone(160, 0.1, 0.35 * vol, 'sine', 50); }
    else if (kind === 'silenced') { this.noise(0.07, 0.22, 3200, 1.2, 'highpass', vol, 1400, pan); this.tone(240, 0.04, 0.1 * vol, 'triangle', 120); }
    else if (kind === 'revolver') { this.noise(0.24, 0.78, 1250, 0.5, 'bandpass', vol, 220, pan); this.tone(110, 0.18, 0.52 * vol, 'sine', 34); }
    else if (kind === 'smg') { this.noise(0.09, 0.45, 2400, 0.5, 'bandpass', vol, 600, pan); this.tone(190, 0.06, 0.25 * vol, 'sine', 70); }
    else if (kind === 'rifle' || kind === 'carbine') { this.noise(0.16, 0.58, 1500, 0.5, 'bandpass', vol, 300, pan); this.tone(120, 0.12, 0.42 * vol, 'sine', 40); }
    else if (kind === 'lmg') { this.noise(0.14, 0.62, 1300, 0.5, 'bandpass', vol, 260, pan); this.tone(105, 0.11, 0.46 * vol, 'sawtooth', 38); }
    else if (kind === 'shotgun' || kind === 'autoshotgun') { this.noise(0.3, 0.8, 1000, 0.4, 'bandpass', vol, 160, pan); this.tone(90, 0.2, 0.5 * vol, 'sine', 30); }
    else if (kind === 'sniper') { this.noise(0.36, 0.9, 1400, 0.35, 'bandpass', vol, 180, pan); this.tone(85, 0.24, 0.58 * vol, 'sawtooth', 26); }
    else if (kind === 'rpg') { this.noise(0.42, 0.75, 650, 0.45, 'lowpass', vol, 160, pan); this.tone(150, 0.35, 0.45 * vol, 'sawtooth', 55); }
    else { this.noise(0.14, 0.5, 1600, 0.6, 'bandpass', vol, 350, pan); }
  }
  katanaSlash() {
    this.noise(0.14, 0.28, 2800, 1.4, 'bandpass', 1, 900);
    this.tone(420, 0.09, 0.14, 'triangle', 160);
  }
  footstep(onSand = false) {
    if (!this.ctx) return;
    if (onSand) this.noise(0.08, 0.09, 900, 0.8, 'bandpass', 1, 450);
    else this.noise(0.045, 0.06, 480, 1.1, 'lowpass', 1, 180);
  }
  slide() {
    this.noise(0.24, 0.16, 1200, 0.7, 'bandpass', 1, 400);
  }
  explosion(vol = 1) {
    this.noise(1.3, 1.0, 900, 0.5, 'lowpass', vol, 60);
    this.tone(70, 0.9, 0.7 * vol, 'sine', 25);
  }
  crash(i: number) {
    this.noise(0.3, Math.min(1, i) * 0.7, 700, 0.8, 'bandpass', 1, 200);
    this.tone(120, 0.15, Math.min(1, i) * 0.4, 'square', 50);
  }
  hit(vol = 1) { this.noise(0.06, 0.25, 3000, 1, 'bandpass', vol); }
  punch() { this.noise(0.1, 0.3, 300, 0.7, 'lowpass'); this.tone(100, 0.08, 0.3, 'sine', 50); }
  cash() { this.tone(880, 0.1, 0.18, 'square'); this.tone(1320, 0.18, 0.18, 'square', 0, 0.09); }
  beep(f = 1200, v = 0.12) { this.tone(f, 0.07, v, 'sine'); }
  pickup() { this.tone(520, 0.08, 0.18, 'triangle'); this.tone(780, 0.14, 0.18, 'triangle', 0, 0.07); }
  horn(on: boolean) {
    if (!this.ctx) return;
    if (on) { this.tone(392, 0.25, 0.12, 'square'); this.tone(494, 0.25, 0.1, 'square'); }
  }
  missionPass() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 0.2, 'triangle', 0, i * 0.12)); }
  missionFail() { [330, 277, 220, 164].forEach((f, i) => this.tone(f, 0.4, 0.2, 'sawtooth', 0, i * 0.15)); }
  wasted() { this.tone(200, 1.6, 0.3, 'sawtooth', 40); }
  door() { this.noise(0.1, 0.2, 500, 1, 'lowpass'); }

  // ------------------------------------------------------------ radio
  setStation(i: number) {
    this.station = i % this.stations.length;
    if (!this.ctx) return;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.station > 0) {
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 30);
    }
  }
  private schedule() {
    const c = this.ctx!;
    const bpm = [0, 104, 90, 124][this.station];
    const stepDur = 60 / bpm / 4;
    while (this.nextTime < c.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }
  private rtone(freq: number, t0: number, dur: number, vol: number, type: OscillatorType, cut = 0) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = g;
    if (cut) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(cut, t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(80, cut * 0.2), t0 + dur);
      o.connect(f).connect(g);
    } else o.connect(g);
    g.connect(this.radioGain);
    void node;
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  private rdrum(kind: 'k' | 's' | 'h', t0: number, v = 1) {
    const c = this.ctx!;
    if (kind === 'k') {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(150, t0);
      o.frequency.exponentialRampToValueAtTime(40, t0 + 0.14);
      const g = c.createGain();
      g.gain.setValueAtTime(0.9 * v, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
      o.connect(g).connect(this.radioGain);
      o.start(t0);
      o.stop(t0 + 0.25);
    } else {
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = kind === 's' ? 'bandpass' : 'highpass';
      f.frequency.value = kind === 's' ? 1800 : 7000;
      const g = c.createGain();
      g.gain.setValueAtTime((kind === 's' ? 0.5 : 0.2) * v, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + (kind === 's' ? 0.16 : 0.05));
      s.connect(f).connect(g).connect(this.radioGain);
      s.start(t0, Math.random());
      s.stop(t0 + 0.2);
    }
  }
  private playStep(n: number, t: number, d: number) {
    const s = n % 16, bar = Math.floor(n / 16) % 4;
    const mf = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    if (this.station === 1) {
      // synthwave: A minor progression
      const roots = [45, 41, 48, 43];
      const r = roots[bar];
      if (s % 4 === 0) this.rdrum('k', t);
      if (s === 4 || s === 12) this.rdrum('s', t);
      if (s % 2 === 0) this.rdrum('h', t, 0.6);
      if (s % 2 === 0 || s % 4 === 3) this.rtone(mf(r), t, d * 1.8, 0.35, 'sawtooth', 900);
      const arp = [0, 7, 12, 15, 12, 7, 3, 7];
      this.rtone(mf(r + 24 + arp[s % 8]), t, d * 1.5, 0.12, 'square', 2500);
      if (s === 0) { this.rtone(mf(r + 12), t, d * 14, 0.1, 'sawtooth', 700); this.rtone(mf(r + 19), t, d * 14, 0.08, 'sawtooth', 700); }
    } else if (this.station === 2) {
      const roots = [43, 43, 46, 41];
      const r = roots[bar];
      if (s === 0 || s === 7 || s === 10) this.rdrum('k', t);
      if (s === 4 || s === 12) this.rdrum('s', t);
      this.rdrum('h', t, s % 2 ? 0.4 : 0.7);
      if (s === 0 || s === 3 || s === 8 || s === 11) this.rtone(mf(r - 12), t, d * 3, 0.5, 'sine');
      if (s === 2 || s === 6 || s === 14) this.rtone(mf(r + 12 + [0, 3, 7, 10][(s >> 1) % 4]), t, d * 1.4, 0.12, 'triangle', 2000);
    } else {
      const roots = [38, 38, 41, 36];
      const r = roots[bar];
      if (s % 4 === 0) this.rdrum('k', t);
      if (s === 4 || s === 12) this.rdrum('s', t, 0.7);
      if (s % 4 === 2) this.rdrum('h', t);
      if (s % 4 !== 0) this.rtone(mf(r), t, d * 0.9, 0.3, 'sawtooth', 600);
      if (s % 8 === 0) { this.rtone(mf(r + 24), t, d * 4, 0.1, 'square', 3000); this.rtone(mf(r + 27), t, d * 4, 0.08, 'square', 3000); this.rtone(mf(r + 31), t, d * 4, 0.08, 'square', 3000); }
    }
  }
}
