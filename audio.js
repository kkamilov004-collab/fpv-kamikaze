// ===== Synthesized sound: motors, static, explosions, guns =====
const Snd = {
  ctx:null, master:null, motor:null, stat:null, engine:null,
  init(){
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ctx = this.ctx = new C();
      this.master = ctx.createGain(); this.master.gain.value = Save.d.sound ? 0.6 : 0; this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      // FPV motor whine: 2 saws through bandpass
      const mg = ctx.createGain(); mg.gain.value = 0; mg.connect(this.master);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.value = 900; bp.connect(mg);
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = o2.type = 'sawtooth';
      o1.connect(bp); o2.connect(bp); o1.start(); o2.start();
      this.motor = {g:mg, bp, o1, o2};
      // static hiss
      const sg = ctx.createGain(); sg.gain.value = 0; sg.connect(this.master);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500; hp.connect(sg);
      const ns = ctx.createBufferSource(); ns.buffer = buf; ns.loop = true; ns.connect(hp); ns.start();
      this.stat = sg;
      // tank diesel
      const eg = ctx.createGain(); eg.gain.value = 0; eg.connect(this.master);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.connect(eg);
      const e1 = ctx.createOscillator(); e1.type = 'square'; e1.frequency.value = 38; e1.connect(lp); e1.start();
      this.engine = {g:eg, o:e1};
    } catch (e) { this.ctx = null; }
  },
  setVol(on){ if (this.master) this.master.gain.value = on ? 0.6 : 0; },
  setMotor(on, thr, kind){
    if (!this.motor) return; const t = this.ctx.currentTime, m = this.motor;
    const base = kind === 'missile' ? 120 : kind === 'wing' ? 95 : 150;
    const f = base + thr * (kind === 'missile' ? 40 : 260);
    m.o1.frequency.setTargetAtTime(f, t, 0.05); m.o2.frequency.setTargetAtTime(f * 1.51, t, 0.05);
    m.bp.frequency.setTargetAtTime(kind === 'missile' ? 500 : 700 + thr * 1400, t, 0.05);
    m.g.gain.setTargetAtTime(on ? (kind === 'missile' ? 0.22 : 0.07 + thr * 0.1) : 0, t, 0.04);
  },
  setStatic(v){ if (this.stat) this.stat.gain.setTargetAtTime(v * 0.35, this.ctx.currentTime, 0.03); },
  setEngine(on, thr){
    if (!this.engine) return; const t = this.ctx.currentTime;
    this.engine.o.frequency.setTargetAtTime(32 + thr * 30, t, 0.2);
    this.engine.g.gain.setTargetAtTime(on ? 0.12 + thr * 0.1 : 0, t, 0.1);
  },
  burst(dur, vol, freq, q){
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  boom(dist){ const v = clamp(1.2 - (dist || 0) / 900, 0.08, 1.2); this.burst(1.6, v, 420); this.burst(0.35, v * 0.8, 2400); },
  cannon(){ this.burst(0.9, 1, 600); this.burst(0.15, 0.9, 5000); },
  mg(){ this.burst(0.06, 0.35, 3200, 2); },
  click(){ this.burst(0.04, 0.3, 4000, 4); },
};
