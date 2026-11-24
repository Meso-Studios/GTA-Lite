// Realistic WebAudio acoustic engine: studio mastering chain, smoothly crossfading
// environmental ambience beds, natural non-8-bit SFX, wood/sand/pavement footsteps & warm lo-fi radio.
import { AmbienceContext, AmbienceGains, computeAmbienceTargets } from './soundMix';

interface AmbienceBed {
  gain: GainNode;
  filter?: BiquadFilterNode;
}

export class GameAudio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private bus!: GainNode;
  private compressor!: DynamicsCompressorNode;
  private whiteBuf!: AudioBuffer;
  private pinkBuf!: AudioBuffer;
  private brownBuf!: AudioBuffer;

  // Vehicle engine & siren
  engOsc: OscillatorNode[] = [];
  engGain!: GainNode;
  engFilter!: BiquadFilterNode;
  engRoadGain!: GainNode;
  sirenOsc!: OscillatorNode;
  sirenGain!: GainNode;

  // Continuous ambient noise layers (smoothly crossfaded via setTargetAtTime)
  private ambCity!: AmbienceBed;
  private ambWind!: AmbienceBed;
  private ambOcean!: AmbienceBed;
  private ambNight!: AmbienceBed;
  private ambRoom!: AmbienceBed;
  private ambCrowd!: AmbienceBed;
  private ambReady = false;
  lastAmbience: AmbienceGains = {
    cityHum: 0,
    wind: 0,
    ocean: 0,
    night: 0,
    roomTone: 0,
    crowdMurmur: 0,
    ducking: 1,
  };

  // Radio
  radioGain!: GainNode;
  radioFilter!: BiquadFilterNode;
  station = 0;
  step = 0;
  nextTime = 0;
  timer: number | null = null;
  muted = false;
  stations = ['OFF', 'NOVA FM · Sunset Lo-Fi', 'VICE NIGHTS · Deep Groove', 'COASTLINE · Warm House'];
  engineOn = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    // Studio mastering chain: gentle high-end warmth rolloff -> soft compressor -> master gain
    this.bus = ctx.createGain();
    this.bus.gain.value = 1.0;

    const warmth = ctx.createBiquadFilter();
    warmth.type = 'lowpass';
    warmth.frequency.value = 8400;
    warmth.Q.value = 0.5;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 4.5;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.18;

    this.master = ctx.createGain();
    this.master.gain.value = 0.65;

    this.bus.connect(warmth).connect(this.compressor).connect(this.master).connect(ctx.destination);

    // Pre-generate seamless white, pink, and brown noise buffers (4s loops with crossfaded edges)
    this.whiteBuf = this.buildNoiseBuffer(ctx, 3.0, 'white');
    this.pinkBuf = this.buildNoiseBuffer(ctx, 4.0, 'pink');
    this.brownBuf = this.buildNoiseBuffer(ctx, 4.0, 'brown');

    this.initAmbience(ctx);
    this.initEngine(ctx);
    this.initSiren(ctx);

    this.radioFilter = ctx.createBiquadFilter();
    this.radioFilter.type = 'lowpass';
    this.radioFilter.frequency.value = 3400;
    this.radioGain = ctx.createGain();
    this.radioGain.gain.value = 0.11;
    this.radioFilter.connect(this.radioGain).connect(this.bus);
  }

  private buildNoiseBuffer(ctx: AudioContext, seconds: number, kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);

    if (kind === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === 'pink') {
      // Paul Kellet pink noise filter — warm natural broadband spectrum (-3dB/octave)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      // Integrated brownian noise (-6dB/octave) for deep city rumble & cozy indoor room tone
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.024 * w) / 1.024;
        d[i] = Math.max(-1, Math.min(1, last * 3.4));
      }
    }

    // Crossfade loop ends (last 2048 samples into first 2048) for zero-click looping
    const fade = Math.min(2048, Math.floor(len * 0.1));
    for (let i = 0; i < fade; i++) {
      const a = i / fade;
      d[i] = d[i] * a + d[len - fade + i] * (1 - a);
    }
    return buf;
  }

  private loopNoise(ctx: AudioContext, buf: AudioBuffer): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(0, Math.random() * Math.max(0.1, buf.duration * 0.5));
    return src;
  }

  private initAmbience(ctx: AudioContext) {
    // 1. Distant urban city hum (warm low traffic bed)
    const citySrc = this.loopNoise(ctx, this.brownBuf);
    const cityLp = ctx.createBiquadFilter();
    cityLp.type = 'lowpass';
    cityLp.frequency.value = 165;
    const cityGain = ctx.createGain();
    cityGain.gain.value = 0;
    citySrc.connect(cityLp).connect(cityGain).connect(this.bus);
    this.ambCity = { gain: cityGain, filter: cityLp };

    // 2. Organic wind / breeze with slow gust LFO
    const windSrc = this.loopNoise(ctx, this.pinkBuf);
    const windBp = ctx.createBiquadFilter();
    windBp.type = 'bandpass';
    windBp.frequency.value = 310;
    windBp.Q.value = 0.85;
    const windLfo = ctx.createOscillator();
    windLfo.type = 'sine';
    windLfo.frequency.value = 0.13;
    const windLfoDepth = ctx.createGain();
    windLfoDepth.gain.value = 115;
    windLfo.connect(windLfoDepth).connect(windBp.frequency);
    windLfo.start();
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windBp).connect(windGain).connect(this.bus);
    this.ambWind = { gain: windGain, filter: windBp };

    // 3. Coastal ocean surf with slow rolling wave swell
    const oceanSrc = this.loopNoise(ctx, this.pinkBuf);
    const oceanLp = ctx.createBiquadFilter();
    oceanLp.type = 'lowpass';
    oceanLp.frequency.value = 460;
    const oceanWaveLfo = ctx.createOscillator();
    oceanWaveLfo.type = 'sine';
    oceanWaveLfo.frequency.value = 0.11;
    const oceanWaveFreq = ctx.createGain();
    oceanWaveFreq.gain.value = 210;
    oceanWaveLfo.connect(oceanWaveFreq).connect(oceanLp.frequency);
    oceanWaveLfo.start();
    const oceanGain = ctx.createGain();
    oceanGain.gain.value = 0;
    oceanSrc.connect(oceanLp).connect(oceanGain).connect(this.bus);
    this.ambOcean = { gain: oceanGain, filter: oceanLp };

    // 4. Warm subtropical night air & soft distant cricket shimmer
    const nightSrc = this.loopNoise(ctx, this.pinkBuf);
    const nightBp = ctx.createBiquadFilter();
    nightBp.type = 'bandpass';
    nightBp.frequency.value = 3900;
    nightBp.Q.value = 7.5;
    const nightPulse = ctx.createGain();
    nightPulse.gain.value = 0.65;
    const nightLfo = ctx.createOscillator();
    nightLfo.type = 'sine';
    nightLfo.frequency.value = 2.8;
    const nightLfoGain = ctx.createGain();
    nightLfoGain.gain.value = 0.3;
    nightLfo.connect(nightLfoGain).connect(nightPulse.gain);
    nightLfo.start();
    const nightGain = ctx.createGain();
    nightGain.gain.value = 0;
    nightSrc.connect(nightBp).connect(nightPulse).connect(nightGain).connect(this.bus);
    this.ambNight = { gain: nightGain, filter: nightBp };

    // 5. Warm indoor room tone (HVAC air movement + architectural warmth)
    const roomSrc = this.loopNoise(ctx, this.brownBuf);
    const roomBp = ctx.createBiquadFilter();
    roomBp.type = 'bandpass';
    roomBp.frequency.value = 120;
    roomBp.Q.value = 0.7;
    const roomGain = ctx.createGain();
    roomGain.gain.value = 0;
    roomSrc.connect(roomBp).connect(roomGain).connect(this.bus);
    this.ambRoom = { gain: roomGain, filter: roomBp };

    // 6. Muffled indoor restaurant / shop crowd chatter (dual vocal-formant pink-noise bands)
    const crowdSrcA = this.loopNoise(ctx, this.pinkBuf);
    const crowdF1 = ctx.createBiquadFilter();
    crowdF1.type = 'bandpass';
    crowdF1.frequency.value = 460;
    crowdF1.Q.value = 2.2;
    const crowdF2 = ctx.createBiquadFilter();
    crowdF2.type = 'bandpass';
    crowdF2.frequency.value = 1120;
    crowdF2.Q.value = 2.8;
    const crowdSwell = ctx.createGain();
    crowdSwell.gain.value = 0.8;
    const crowdLfo = ctx.createOscillator();
    crowdLfo.type = 'sine';
    crowdLfo.frequency.value = 0.27;
    const crowdLfoAmp = ctx.createGain();
    crowdLfoAmp.gain.value = 0.18;
    crowdLfo.connect(crowdLfoAmp).connect(crowdSwell.gain);
    crowdLfo.start();
    const crowdGain = ctx.createGain();
    crowdGain.gain.value = 0;
    crowdSrcA.connect(crowdF1).connect(crowdSwell);
    crowdSrcA.connect(crowdF2).connect(crowdSwell);
    crowdSwell.connect(crowdGain).connect(this.bus);
    this.ambCrowd = { gain: crowdGain };

    this.ambReady = true;
  }

  private initEngine(ctx: AudioContext) {
    // Smooth grounded engine: warm triangle fundamental + sine sub + gently filtered harmonics + road tire noise
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 260;
    this.engFilter.Q.value = 1.2;

    const specs: [OscillatorType, number, number][] = [
      ['triangle', 1.0, 0.34],
      ['sine', 0.5, 0.36],
      ['sawtooth', 1.5, 0.09],
    ];
    for (const [type, mult, level] of specs) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 46 * mult;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(this.engFilter);
      o.start();
      this.engOsc.push(o);
    }
    this.engFilter.connect(this.engGain).connect(this.bus);

    // Soft tire/road noise that scales smoothly with driving speed
    const roadSrc = this.loopNoise(ctx, this.pinkBuf);
    const roadLp = ctx.createBiquadFilter();
    roadLp.type = 'bandpass';
    roadLp.frequency.value = 220;
    roadLp.Q.value = 0.6;
    this.engRoadGain = ctx.createGain();
    this.engRoadGain.gain.value = 0;
    roadSrc.connect(roadLp).connect(this.engRoadGain).connect(this.bus);
  }

  private initSiren(ctx: AudioContext) {
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 920;
    sf.Q.value = 1.4;
    this.sirenOsc.connect(sf).connect(this.sirenGain).connect(this.bus);
    this.sirenOsc.start();
  }

  /** Smoothly crossfades all background ambience beds (city, wind, surf, night, indoor room tone & crowd chatter). */
  updateAmbience(ctxState: AmbienceContext) {
    const targets = computeAmbienceTargets(ctxState);
    this.lastAmbience = targets;
    if (!this.ctx || !this.ambReady) return;

    const t = this.ctx.currentTime;
    // Slow natural fade constants (~0.85s–1.35s) so room transitions and voice ducking feel effortless
    const fadeSlow = 1.15;
    const fadeMed = 0.72;
    this.ambCity.gain.gain.setTargetAtTime(targets.cityHum, t, fadeSlow);
    this.ambWind.gain.gain.setTargetAtTime(targets.wind, t, fadeMed);
    this.ambOcean.gain.gain.setTargetAtTime(targets.ocean, t, fadeSlow);
    this.ambNight.gain.gain.setTargetAtTime(targets.night, t, fadeSlow);
    this.ambRoom.gain.gain.setTargetAtTime(targets.roomTone, t, fadeMed);
    this.ambCrowd.gain.gain.setTargetAtTime(targets.crowdMurmur, t, fadeMed);

    // Subtle pitch-brightening of wind when moving fast or flying high
    if (this.ambWind.filter) {
      const windCut = 260 + Math.min(480, ctxState.speedMps * 8 + Math.max(0, ctxState.altitudeM) * 2.2);
      this.ambWind.filter.frequency.setTargetAtTime(windCut, t, 0.5);
    }
  }

  setEngine(on: boolean, speed01: number, throttle: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 0.14 + (speed01 % 0.25) * 1.85 + speed01 * 0.45 + throttle * 0.1;
    const f = 36 + rpm * 98;
    this.engOsc[0].frequency.setTargetAtTime(f, t, 0.06);
    this.engOsc[1].frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engOsc[2].frequency.setTargetAtTime(f * 1.5, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(160 + rpm * 460 + throttle * 190, t, 0.09);
    this.engGain.gain.setTargetAtTime(on ? 0.075 + throttle * 0.045 : 0, t, 0.16);
    this.engRoadGain.gain.setTargetAtTime(on ? Math.min(0.065, speed01 * 0.065) : 0, t, 0.2);
    this.engineOn = on;
  }

  setSiren(vol: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 620 + 310 * (0.5 + 0.5 * Math.sin(t * 6.2));
    this.sirenOsc.frequency.setTargetAtTime(f, t, 0.03);
    this.sirenGain.gain.setTargetAtTime(Math.max(0, Math.min(0.055, vol * 0.055)), t, 0.14);
  }

  private noise(
    dur: number,
    vol: number,
    freq: number,
    q = 0.7,
    type: BiquadFilterType = 'bandpass',
    vp = 1,
    sweepTo = 0,
    pan = 0,
    color: 'white' | 'pink' | 'brown' = 'pink',
    attack = 0.004,
  ) {
    const c = this.ctx;
    if (!c || vol * vp < 0.002) return;
    const s = c.createBufferSource();
    s.buffer = color === 'white' ? this.whiteBuf : color === 'brown' ? this.brownBuf : this.pinkBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(Math.max(40, freq), c.currentTime);
    f.Q.value = q;
    if (sweepTo > 20) f.frequency.exponentialRampToValueAtTime(sweepTo, c.currentTime + dur);
    const g = c.createGain();
    const peak = vol * vp;
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.linearRampToValueAtTime(peak, c.currentTime + Math.min(attack, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0005, c.currentTime + dur);
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
    s.connect(f).connect(g).connect(p).connect(this.bus);
    const startOff = Math.random() * Math.max(0.1, s.buffer.duration - dur - 0.1);
    s.start(c.currentTime, startOff, dur + 0.04);
  }

  private tone(
    freq: number,
    dur: number,
    vol: number,
    type: OscillatorType = 'sine',
    slideTo = 0,
    when = 0,
    dest?: AudioNode,
    lpCutoff = 0,
  ) {
    const c = this.ctx;
    if (!c || vol < 0.002) return;
    const o = c.createOscillator();
    o.type = type;
    const t0 = c.currentTime + when;
    o.frequency.setValueAtTime(Math.max(24, freq), t0);
    if (slideTo > 20) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.008, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    const target = dest ?? this.bus;
    if (lpCutoff > 0) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(lpCutoff, t0);
      o.connect(f).connect(g).connect(target);
    } else {
      o.connect(g).connect(target);
    }
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  shot(kind: string, vol = 1, pan = 0) {
    if (!this.ctx) return;
    const v = Math.max(0, Math.min(1, vol));
    if (kind === 'silenced') {
      this.noise(0.065, 0.16, 2600, 1.1, 'bandpass', v, 1100, pan, 'pink', 0.002);
      this.tone(190, 0.045, 0.09 * v, 'triangle', 95);
    } else if (kind === 'revolver') {
      this.noise(0.24, 0.42, 1150, 0.55, 'bandpass', v, 210, pan, 'pink', 0.002);
      this.noise(0.05, 0.22, 3400, 0.7, 'highpass', v, 1200, pan, 'white', 0.001);
      this.tone(105, 0.16, 0.28 * v, 'sine', 34);
    } else if (kind === 'smg') {
      this.noise(0.09, 0.28, 1900, 0.6, 'bandpass', v, 480, pan, 'pink', 0.002);
      this.tone(165, 0.06, 0.16 * v, 'sine', 64);
    } else if (kind === 'rifle' || kind === 'carbine' || kind === 'lmg') {
      this.noise(0.16, 0.36, 1450, 0.5, 'bandpass', v, 280, pan, 'pink', 0.002);
      this.noise(0.04, 0.18, 3200, 0.8, 'bandpass', v, 900, pan, 'white', 0.001);
      this.tone(118, 0.12, 0.24 * v, 'sine', 38);
    } else if (kind === 'shotgun' || kind === 'autoshotgun') {
      this.noise(0.32, 0.46, 920, 0.45, 'bandpass', v, 150, pan, 'pink', 0.002);
      this.noise(0.22, 0.26, 260, 0.6, 'lowpass', v, 85, pan, 'brown', 0.003);
      this.tone(86, 0.19, 0.3 * v, 'sine', 28);
    } else if (kind === 'sniper') {
      this.noise(0.38, 0.48, 1300, 0.4, 'bandpass', v, 170, pan, 'pink', 0.002);
      this.noise(0.06, 0.26, 3800, 0.7, 'bandpass', v, 1100, pan, 'white', 0.001);
      this.tone(82, 0.24, 0.32 * v, 'triangle', 26, 0, undefined, 420);
    } else if (kind === 'rpg') {
      this.noise(0.46, 0.44, 520, 0.5, 'lowpass', v, 140, pan, 'brown', 0.015);
      this.tone(135, 0.34, 0.22 * v, 'triangle', 48, 0, undefined, 320);
    } else {
      // Pistol / default
      this.noise(0.14, 0.32, 1650, 0.6, 'bandpass', v, 360, pan, 'pink', 0.002);
      this.tone(148, 0.095, 0.22 * v, 'sine', 48);
    }
  }

  katanaSlash() {
    this.noise(0.15, 0.18, 2200, 1.3, 'bandpass', 1, 720, 0, 'pink', 0.012);
    this.tone(360, 0.09, 0.07, 'sine', 150);
  }

  footstep(surface: boolean | 'wood' | 'sand' | 'pavement' = false) {
    if (!this.ctx) return;
    const kind = surface === true ? 'sand' : surface === false ? 'pavement' : surface;
    const jitter = 0.92 + Math.random() * 0.16;
    if (kind === 'wood') {
      // Warm hollow interior floorboard step: subtle wood body thud + gentle sole tap
      this.tone(132 * jitter, 0.055, 0.055, 'sine', 76 * jitter);
      this.noise(0.05, 0.05, 420 * jitter, 1.2, 'bandpass', 1, 210, 0, 'brown', 0.003);
      this.noise(0.028, 0.025, 1150 * jitter, 1.0, 'bandpass', 1, 680, 0, 'pink', 0.002);
    } else if (kind === 'sand') {
      this.noise(0.09, 0.065, 820 * jitter, 0.8, 'bandpass', 1, 390, 0, 'pink', 0.01);
    } else {
      this.noise(0.042, 0.045, 440 * jitter, 1.0, 'lowpass', 1, 175, 0, 'pink', 0.003);
      this.tone(95 * jitter, 0.032, 0.026, 'sine', 58);
    }
  }

  slide() {
    this.noise(0.26, 0.11, 1050, 0.7, 'bandpass', 1, 340, 0, 'pink', 0.02);
  }

  explosion(vol = 1) {
    const v = Math.max(0, Math.min(1, vol));
    this.noise(1.4, 0.62, 620, 0.5, 'lowpass', v, 55, 0, 'brown', 0.006);
    this.noise(0.55, 0.34, 1400, 0.6, 'bandpass', v, 240, 0, 'pink', 0.003);
    this.tone(66, 0.9, 0.42 * v, 'sine', 24);
  }

  crash(i: number) {
    const k = Math.max(0, Math.min(1, i));
    this.noise(0.32, k * 0.42, 640, 0.75, 'bandpass', 1, 180, 0, 'pink', 0.003);
    this.noise(0.18, k * 0.3, 210, 0.8, 'lowpass', 1, 70, 0, 'brown', 0.003);
    this.tone(110, 0.14, k * 0.22, 'triangle', 44, 0, undefined, 280);
  }

  hit(vol = 1) {
    this.noise(0.055, 0.14, 1900, 1.0, 'bandpass', Math.min(1, vol), 720, 0, 'pink', 0.002);
    this.tone(125, 0.045, 0.09 * Math.min(1, vol), 'sine', 62);
  }

  punch() {
    this.noise(0.09, 0.18, 280, 0.75, 'lowpass', 1, 95, 0, 'brown', 0.003);
    this.tone(98, 0.075, 0.18, 'sine', 46);
  }

  cash() {
    // Warm brass register bell (harmonic sine/triangle blend, zero 8-bit square waves)
    this.tone(1046.5, 0.16, 0.08, 'sine', 0, 0);
    this.tone(1568.0, 0.24, 0.07, 'sine', 0, 0.075);
    this.tone(2093.0, 0.18, 0.035, 'triangle', 0, 0.075, undefined, 3200);
  }

  beep(f = 880, v = 0.07) {
    this.tone(f, 0.06, Math.min(0.1, v), 'sine');
  }

  pickup() {
    this.tone(523.25, 0.12, 0.08, 'sine', 0, 0);
    this.tone(783.99, 0.18, 0.08, 'triangle', 0, 0.065, undefined, 2400);
  }

  horn(on: boolean) {
    if (!this.ctx || !on) return;
    // Authentic dual-tone brass car horn through warm lowpass filter (F4 + A4 major third)
    this.tone(349.2, 0.28, 0.065, 'sawtooth', 0, 0, undefined, 980);
    this.tone(440.0, 0.28, 0.055, 'sawtooth', 0, 0, undefined, 980);
  }

  missionPass() {
    [392.0, 493.88, 587.33, 783.99].forEach((f, i) =>
      this.tone(f, 0.45, 0.1, 'triangle', 0, i * 0.11, undefined, 1900),
    );
  }

  missionFail() {
    [293.66, 261.63, 220.0, 174.61].forEach((f, i) =>
      this.tone(f, 0.48, 0.1, 'triangle', 0, i * 0.14, undefined, 1200),
    );
  }

  wasted() {
    this.tone(146.8, 1.5, 0.16, 'sine', 42);
    this.tone(110.0, 1.6, 0.12, 'triangle', 36, 0.04, undefined, 340);
  }

  door() {
    // Realistic shop/wooden door latch + air whoosh + soft overhead entry chime
    this.noise(0.14, 0.11, 420, 0.8, 'lowpass', 1, 140, 0, 'brown', 0.01);
    this.tone(185, 0.045, 0.06, 'sine', 95, 0);
    this.tone(1318.5, 0.28, 0.032, 'sine', 0, 0.06);
  }

  // ------------------------------------------------------------ warm lo-fi radio
  setStation(i: number) {
    this.station = i % this.stations.length;
    if (!this.ctx) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.station > 0) {
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 35);
    }
  }

  private schedule() {
    const c = this.ctx;
    if (!c) return;
    const bpm = [0, 96, 88, 118][this.station];
    const stepDur = 60 / bpm / 4;
    while (this.nextTime < c.currentTime + 0.16) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private rtone(freq: number, t0: number, dur: number, vol: number, type: OscillatorType, cut = 1400) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cut, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(140, cut * 0.35), t0 + dur);
    o.connect(f).connect(g).connect(this.radioFilter);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private rdrum(kind: 'k' | 's' | 'h', t0: number, v = 1) {
    const c = this.ctx!;
    if (kind === 'k') {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(125, t0);
      o.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
      const g = c.createGain();
      g.gain.setValueAtTime(0.55 * v, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      o.connect(g).connect(this.radioFilter);
      o.start(t0);
      o.stop(t0 + 0.22);
    } else {
      const s = c.createBufferSource();
      s.buffer = this.pinkBuf;
      const f = c.createBiquadFilter();
      f.type = kind === 's' ? 'bandpass' : 'highpass';
      f.frequency.value = kind === 's' ? 1450 : 5400;
      const g = c.createGain();
      g.gain.setValueAtTime((kind === 's' ? 0.24 : 0.09) * v, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + (kind === 's' ? 0.14 : 0.045));
      s.connect(f).connect(g).connect(this.radioFilter);
      s.start(t0, Math.random());
      s.stop(t0 + 0.18);
    }
  }

  private playStep(n: number, t: number, d: number) {
    const s = n % 16;
    const bar = Math.floor(n / 16) % 4;
    const mf = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    if (this.station === 1) {
      // Sunset Lo-Fi Rhodes
      const roots = [45, 41, 48, 43];
      const r = roots[bar];
      if (s === 0 || s === 10) this.rdrum('k', t, 0.85);
      if (s === 4 || s === 12) this.rdrum('s', t, 0.7);
      if (s % 2 === 0) this.rdrum('h', t, 0.45);
      if (s === 0 || s === 6 || s === 10) this.rtone(mf(r), t, d * 2.4, 0.28, 'sine', 600);
      if (s === 0) {
        this.rtone(mf(r + 12), t, d * 12, 0.08, 'triangle', 1100);
        this.rtone(mf(r + 15), t, d * 12, 0.07, 'sine', 1200);
        this.rtone(mf(r + 19), t, d * 12, 0.06, 'sine', 1200);
      }
    } else if (this.station === 2) {
      // Deep Groove
      const roots = [43, 43, 46, 41];
      const r = roots[bar];
      if (s === 0 || s === 7 || s === 10) this.rdrum('k', t, 0.9);
      if (s === 4 || s === 12) this.rdrum('s', t, 0.75);
      this.rdrum('h', t, s % 2 ? 0.3 : 0.55);
      if (s === 0 || s === 3 || s === 8 || s === 11) this.rtone(mf(r - 12), t, d * 3, 0.38, 'sine', 500);
      if (s === 2 || s === 6 || s === 14) {
        this.rtone(mf(r + 12 + [0, 3, 7, 10][(s >> 1) % 4]), t, d * 1.6, 0.09, 'triangle', 1400);
      }
    } else {
      // Warm Coastline House
      const roots = [38, 38, 41, 36];
      const r = roots[bar];
      if (s % 4 === 0) this.rdrum('k', t, 0.85);
      if (s === 4 || s === 12) this.rdrum('s', t, 0.65);
      if (s % 4 === 2) this.rdrum('h', t, 0.55);
      if (s % 4 !== 0) this.rtone(mf(r), t, d * 0.9, 0.22, 'triangle', 520);
      if (s % 8 === 0) {
        this.rtone(mf(r + 24), t, d * 4, 0.07, 'sine', 1500);
        this.rtone(mf(r + 27), t, d * 4, 0.06, 'triangle', 1400);
        this.rtone(mf(r + 31), t, d * 4, 0.06, 'sine', 1400);
      }
    }
  }
}
