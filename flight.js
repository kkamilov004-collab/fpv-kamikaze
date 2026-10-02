// ===== Drone / missile mission mode =====
const BASE = new THREE.Vector3(0, 0, 700);
const Flight = {
  start(map, def, wh){
    this.map = map; this.def = def; this.wh = def.warhead ? byId(WARHEADS, def.warhead) : wh;
    W.build(map, 'flight'); FX.init(W.scene);
    this.targets = W.spawnTargets(map.t, map.camo);
    this.sorties = map.sorties; this.used = 0; this.coins = 0; this.kills = [];
    this.log = [];
    UI.buildMarks(this.targets); UI.buildMiniBase();
    this.nextSortie();
  },
  nextSortie(){
    const def = this.def;
    if (this.targets.every(v => !v.alive)) return this.finish(true);
    if (this.used >= this.sorties) return this.finish(false);
    this.used++; this.phase = 'fly'; this.t = 0; this.lostT = 0; this.noise = 0; this.battery = 1; this.mah = 0;
    const gh = W.groundH(0, 690);
    this.pos = new THREE.Vector3(rnd(-6, 6), gh + (def.type === 'quad' ? 14 : def.type === 'wing' ? 40 : 3), 688);
    this.vel = new THREE.Vector3(0, 0, def.type === 'wing' ? -30 : -2);
    this.yaw = 0; this.pitch = def.type === 'missile' ? 0.06 : 0; this.roll = 0;
    this.q = new THREE.Quaternion(); this.spd = def.type === 'wing' ? 30 : def.type === 'missile' ? def.speed * 0.4 : 0;
    const dry = 0.6 + (def.payload || 0) * 0.55, w = def.type === 'missile' ? 0 : this.wh.weight;
    this.twr = def.type === 'quad' ? def.twr * dry / (dry + w) : 1;
    this.vmax = def.type === 'quad' ? def.speed * (0.72 + 0.28 * this.twr / def.twr) : def.type === 'wing' ? def.speed * (1 - w / (def.payload * 6)) : def.speed;
    this.acro = def.type === 'quad' && Save.d.mode === 'acro';
    Input.L.keepY = this.acro; Input.L.y = 0; Input.L.x = 0;
    this.lastIn = {lx:0, ly:0, rx:0, ry:0};
    UI.setFilter(this.map.night ? 'thermal' : '');
    const hint = this.acro && this.used === 1 ? '\nАКРО: левый стик — газ (центр = висение) и поворот, правый — наклон и кувырки' : '';
    UI.big(`ВЫЛЕТ ${this.used}/${this.sorties}`, `${def.name} · ${def.type === 'missile' ? 'ракета' : this.wh.name}${hint}`, hint ? 4 : 1.6);
    Snd.click();
  },
  // ---------- per-frame ----------
  update(dt){
    W.updateVehicles(dt);
    for (const v of W.vehicles) FX.wreckSmoke(v, dt);
    if (this.phase === 'fly') this.fly(dt);
    else if (this.phase === 'lost') { this.fall(dt); this.phaseT -= dt; UI.noise = 1; Snd.setStatic(1); if (this.phaseT <= 0) { Snd.setStatic(0); this.nextSortie(); } }
    else if (this.phase === 'obs') { this.phaseT -= dt; UI.noise = 0.04; this.obsCam(dt); if (this.phaseT <= 0) { UI.setFilter(''); this.nextSortie(); } }
    this.updateAA(dt);
    FX.update(dt, CAM); W.updateWeather(CAM, dt);
    if (this.phase === 'fly' || this.phase === 'lost') UI.flightHud(this);
  },
  readInput(){
    let lx = Input.L.x, ly = Input.L.y, rx = Input.R.x, ry = Input.R.y;
    const s = Save.d.sens; rx = clamp(rx * s, -1, 1); ry = clamp(ry * s, -1, 1);
    // jammed link: commands freeze / jitter
    if (this.noise > 0.45 && Math.random() < (this.noise - 0.45) * 1.6) return this.lastIn;
    if (this.noise > 0.6) { rx += rnd(-0.3, 0.3) * this.noise; ry += rnd(-0.3, 0.3) * this.noise; }
    return this.lastIn = {lx, ly, rx, ry};
  },
  fly(dt){
    const def = this.def, inp = this.readInput(), ag = def.agility;
    this.t += dt;
    // battery
    let thr = 0.5;
    const steps = def.type === 'missile' ? 3 : 2, h = dt / steps;
    for (let i = 0; i < steps && this.phase === 'fly'; i++) {
      if (def.type === 'quad') thr = this.stepQuad(h, inp, ag);
      else if (def.type === 'wing') thr = this.stepWing(h, inp, ag);
      else thr = this.stepMissile(h, inp, ag);
      const hit = W.collide(this.pos, 0.25);
      if (hit) { this.impact(hit); return; }
    }
    this.thr = thr;
    const drain = def.type === 'missile' ? 1 / def.battery : (0.45 + thr * 0.9) / def.battery * (1 + (def.type === 'quad' ? this.wh.weight / (def.payload * 3) : 0));
    this.battery = Math.max(0, this.battery - drain * dt); this.mah += drain * dt * (def.type === 'quad' ? 5200 : 9000);
    this.updateSignal(dt);
    // camera
    CAM.position.copy(this.pos);
    const shk = FX.shake * 0.02;
    CAM.quaternion.copy(this.q);
    const up = def.type === 'quad' ? (this.acro ? 0.38 : 0.14) : 0;
    CAM.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(up + rnd(-shk, shk) + (def.type === 'quad' ? Math.sin(this.t * 37) * 0.002 * thr : 0), rnd(-shk, shk), 0)));
    if (CAM.fov !== 82) { CAM.fov = 82; CAM.updateProjectionMatrix(); }
    Snd.setMotor(true, thr, def.type);
  },
  stepQuad(dt, inp, ag){
    const def = this.def, maxT = 0.62 + 0.38 * ag;
    const bat = this.battery > 0 ? (this.battery < 0.1 ? 0.75 + this.battery * 2.5 : 1) : 0;
    let thrust, thr;
    if (!this.acro) {
      const k = Math.min(1, dt * (5 + ag * 7));
      this.pitch += (-inp.ry * maxT - this.pitch) * k;
      this.roll += (-inp.rx * maxT - this.roll) * k;
      this.yaw += -inp.lx * (1.6 + ag * 1.6) * dt;
      this.q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
      const tc = Math.max(0.3, Math.cos(this.pitch) * Math.cos(this.roll));
      thrust = Math.min(G * (1 + inp.ly * 0.95) / tc, G * this.twr);
      if (inp.ly < -0.9) thrust *= 0.5;
      thr = thrust / (G * this.twr);
    } else {
      // Acro (rate mode): sticks set rotation speed in the drone's own axes, nothing self-levels — flips and rolls are possible.
      // Rates with expo like Betaflight: precise near centre, fast at full stick.
      const maxR = 5.5 + ag * 3.5, expo = 0.55, rc = x => x * (1 - expo) + x * x * x * expo;
      const w = new THREE.Vector3(-rc(inp.ry) * maxR, -rc(inp.lx) * 3.6, -rc(inp.rx) * maxR), ang = w.length() * dt;
      if (ang > 1e-6) this.q.multiply(new THREE.Quaternion().setFromAxisAngle(w.normalize(), ang)).normalize();
      // throttle: stick centre = hover, top = full power, bottom = motors idle
      const hover = clamp(1 / this.twr, 0.15, 0.85);
      thr = inp.ly >= 0 ? hover + (1 - hover) * inp.ly : hover * (1 + inp.ly);
      thrust = thr * G * this.twr;
      const e = new THREE.Euler().setFromQuaternion(this.q, 'YXZ'); this.yaw = e.y; this.pitch = e.x; this.roll = e.z;
    }
    thrust *= bat;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.q);
    const sp = this.vel.length(), cd = G * Math.tan(maxT) / (this.vmax * this.vmax);
    const acc = up.multiplyScalar(thrust); acc.y -= G;
    acc.addScaledVector(this.vel, -(cd * sp + 0.04));
    this.vel.addScaledVector(acc, dt); this.pos.addScaledVector(this.vel, dt);
    return thr;
  },
  stepWing(dt, inp, ag){
    const def = this.def, iv = Save.d.invert ? 1 : -1;
    this.roll += (-inp.rx * 1.05 - this.roll) * Math.min(1, dt * (2 + ag * 3));
    this.pitch += -inp.ry * iv * (0.6 + ag * 0.9) * dt;
    if (this.spd < 17) this.pitch -= (17 - this.spd) * 0.05 * dt;
    this.pitch = clamp(this.pitch, -1.35, 1.0);
    this.yaw += (G * Math.tan(this.roll) / Math.max(this.spd, 12) + -inp.lx * 0.25) * dt;
    const thr = this.battery > 0 ? clamp((inp.ly + 1) / 2, 0.05, 1) : 0;
    const cd = 0.0062, T = cd * this.vmax * this.vmax * 1.05;
    this.spd += (thr * T - cd * this.spd * this.spd - G * Math.sin(this.pitch)) * dt;
    this.spd = Math.max(this.spd, 6);
    this.q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.q);
    this.vel.copy(fwd).multiplyScalar(this.spd); if (this.spd < 14) this.vel.y -= (14 - this.spd) * 0.8;
    this.pos.addScaledVector(this.vel, dt);
    return thr;
  },
  stepMissile(dt, inp, ag){
    const def = this.def, iv = Save.d.invert ? 1 : -1, turn = 0.5 + ag * 0.9, fuel = this.battery > 0;
    if (fuel) this.spd = Math.min(def.speed, this.spd + def.speed * 1.2 * dt); else this.spd = Math.max(25, this.spd - 12 * dt);
    this.yaw += -inp.rx * turn * dt;
    this.pitch += (-inp.ry * iv * turn - (fuel ? 0.015 : 0.35)) * dt;
    this.pitch = clamp(this.pitch, -1.45, 1.2);
    this.roll += (-inp.rx * 0.35 - this.roll) * Math.min(1, dt * 6);
    this.q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
    this.vel.set(0, 0, -1).applyQuaternion(this.q).multiplyScalar(this.spd);
    this.pos.addScaledVector(this.vel, dt);
    if (Math.random() < dt * 30 && fuel) FX.sprite('smoke', this.pos.clone().addScaledVector(this.vel, -0.05), new THREE.Vector3(0, 0.5, 0), 2.5, 0.8, 2, 0xdddddd, 0.5);
    return fuel ? 1 : 0;
  },
  fall(dt){
    if (!this.pos) return;
    this.vel.y -= G * dt; this.vel.multiplyScalar(1 - 0.3 * dt); this.pos.addScaledVector(this.vel, dt);
    const hit = W.collide(this.pos, 0.25); if (hit) { this.blast(hit, true); this.pos = null; }
  },
  updateSignal(dt){
    const def = this.def, dist = Math.hypot(this.pos.x - BASE.x, this.pos.z - BASE.z), agl = this.pos.y - W.surfaceH(this.pos.x, this.pos.z);
    let n = 0; this.ewNear = 0;
    if (def.fiber || def.wire) { n = dist > def.range ? 1 : 0; this.cable = dist; }
    else {
      n += clamp((dist - def.range) / 350, 0, 1);
      if (agl < 14) n += clamp((dist - 320) / 800, 0, 0.55) * (1 - agl / 14) * (this.map.city ? 1.6 : 1);
      if (this.map.mountains) n += clamp((Math.abs(this.pos.x - 120 * Math.sin(this.pos.z / 260)) - 120) / 300, 0, 0.4) * (agl < 40 ? 1 : 0.3);
      let ew = 0;
      for (const v of this.targets) if (v.alive && v.type === 'ew') { const d = Math.hypot(this.pos.x - v.x, this.pos.z - v.z); if (d < 260) ew = Math.max(ew, (1 - d / 260) * 1.7); }
      this.ewNear = ew; n += Math.max(0, ew - def.ewResist * 1.2);
    }
    this.noise = clamp(n + rnd(-0.03, 0.03) * (n > 0.1 ? 1 : 0), 0, 1);
    UI.noise = Math.max(def.fiber || def.wire ? 0.02 : 0.05, this.noise);
    Snd.setStatic(this.noise > 0.15 ? this.noise : 0);
    if (this.noise > 0.93) this.lostT += dt; else this.lostT = Math.max(0, this.lostT - dt);
    if (this.lostT > 1.1) this.lose(def.fiber || def.wire ? 'ОБРЫВ КАБЕЛЯ' : 'НЕТ СИГНАЛА');
    if (this.battery <= 0 && this.def.type !== 'missile' && !this.batWarned) { this.batWarned = 1; }
  },
  lose(reason){
    this.phase = 'lost'; this.phaseT = 2.0; Snd.setMotor(false, 0, this.def.type);
    UI.big(reason, 'Дрон потерян', 2); this.log.push(reason);
  },
  // ---------- impact & damage ----------
  impact(hit){
    Snd.setMotor(false, 0, this.def.type); Snd.setStatic(0);
    const res = this.blast(hit, false);
    this.phase = 'obs'; this.phaseT = 3.4; this.obsT = 0; this.impactP = this.pos.clone();
    UI.setFilter('obs');
    UI.big(res.title, res.sub, 3.2);
  },
  blast(hit, silent){
    const p = this.pos.clone(), wh = this.wh, def = this.def;
    if (hit.kind === 'water') { FX.explosion(p, 0.8, 'water'); Snd.boom(CAM.position.distanceTo(p)); return {title:'УПАЛ В ВОДУ', sub:'Цель не поражена'}; }
    const power = clamp(wh.dmg / 90 + wh.radius / 14, 0.6, 2.6);
    FX.explosion(p, power, hit.kind); Snd.boom(silent ? 300 : 0);
    let best = null, kills = [];
    const vd = this.vel.clone().normalize();
    for (const v of this.targets) {
      if (!v.alive) continue;
      const c = new THREE.Vector3(v.x, v.y + v.def.h * 0.5, v.z), d = Math.max(0, p.distanceTo(c) - v.def.r * 0.6);
      let dmg = 0, how = '';
      if (hit.veh === v) {
        const fwd = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw)), vh = new THREE.Vector3(vd.x, 0, vd.z).normalize(), dot = vh.dot(fwd);
        let mul = 1; how = 'в борт';
        if (vd.y < -0.55) { mul = 1.5; how = 'в крышу'; } else if (dot > 0.5) { mul = 1.35; how = 'в корму'; } else if (dot < -0.5) { mul = 0.65; how = 'в лоб'; }
        dmg = wh.dmg * mul;
      } else if (d < wh.radius) { dmg = wh.dmg * 0.6 * (1 - d / wh.radius); how = 'осколками'; }
      if (!dmg) continue;
      dmg *= v.def.armored ? wh.armor : wh.soft;
      v.hp -= dmg;
      if (!best || hit.veh === v) best = {v, how, dmg};
      if (v.hp <= 0) { this.kill(v); kills.push(v); }
    }
    if (kills.length) {
      const names = kills.map(v => v.def.name).join(', ');
      return {title:'ЦЕЛЬ УНИЧТОЖЕНА', sub:`${names}${best && best.how ? ' · ' + best.how : ''}\n+${kills.reduce((s, v) => s + v.def.reward, 0)} монет`};
    }
    if (best) return {title:'ПОПАДАНИЕ', sub:`${best.v.def.name} повреждён ${best.how} · осталось ${Math.max(1, Math.round(best.v.hp / best.v.maxHp * 100))}%`};
    const near = this.targets.filter(v => v.alive).map(v => Math.hypot(v.x - p.x, v.z - p.z)).sort((a, b) => a - b)[0];
    return {title:hit.kind === 'tree' ? 'ВРЕЗАЛСЯ В ДЕРЕВО' : hit.kind === 'building' ? 'ВРЕЗАЛСЯ В ЗДАНИЕ' : 'ПРОМАХ', sub:near ? `До ближайшей цели ${Math.round(near)} м` : ''};
  },
  kill(v){
    W.killVehicle(v); this.coins += v.def.reward; this.kills.push(v.def.name);
    const c = new THREE.Vector3(v.x, v.y + 1.5, v.z);
    setTimeout(() => { FX.explosion(c, v.type === 'depot' ? 3 : 1.6, 'veh'); Snd.boom(CAM.position.distanceTo(c)); }, 250);
    if (v.type === 'depot') for (let i = 1; i < 6; i++) setTimeout(() => FX.explosion(c.clone().add(new THREE.Vector3(rnd(-4, 4), rnd(0, 6), rnd(-4, 4))), 1.2, 'air'), 400 + i * 260);
  },
  obsCam(dt){
    this.obsT += dt; const p = this.impactP;
    CAM.position.set(p.x + 70 - this.obsT * 3, p.y + 110, p.z + 80 - this.obsT * 2);
    CAM.lookAt(p); if (CAM.fov !== 24) { CAM.fov = 24; CAM.updateProjectionMatrix(); }
  },
  // ---------- anti-aircraft ----------
  updateAA(dt){
    this.aaWarn = false;
    for (const v of this.targets) {
      if (v.type !== 'aa' || !v.alive) continue;
      const P = this.phase === 'fly' ? this.pos : null;
      if (!P) { v.burst = 0; continue; }
      const mz = new THREE.Vector3(v.x, v.y + 2, v.z), d = mz.distanceTo(P), agl = P.y - W.surfaceH(P.x, P.z);
      if (d > 430 || agl < 6) { v.burst = 0; continue; }
      this.aaWarn = true;
      const parts = v.g.userData.parts; const ang = Math.atan2(P.x - v.x, P.z - v.z) - v.yaw;
      if (parts.tur) parts.tur.rotation.y = ang; if (parts.gun) parts.gun.rotation.x = -Math.atan2(P.y - mz.y, Math.hypot(P.x - v.x, P.z - v.z));
      v.cool -= dt;
      if (v.cool <= 0 && !v.burst) { v.burst = 10; v.bt = 0; }
      if (v.burst) {
        v.bt -= dt;
        if (v.bt <= 0) {
          v.bt = 0.08; v.burst--; if (!v.burst) v.cool = rnd(1.5, 3);
          const lead = P.clone().addScaledVector(this.vel, d / 330), sp = d * 0.022;
          lead.add(new THREE.Vector3(rnd(-sp, sp), rnd(-sp, sp), rnd(-sp, sp)));
          const tr = FX.tracer(mz, lead.sub(mz), 330, 2.0, 0xffc840);
          tr.onStep = t => { if (this.phase === 'fly' && segPointDist(t.prev, t.pos, this.pos) < 1.3) { t.dead = true; this.shotDown(); } };
          if (Math.random() < 0.5) Snd.mg();
        }
      }
    }
  },
  shotDown(){
    Snd.setMotor(false, 0, this.def.type);
    const res = this.blast({kind:'air'}, false);
    this.phase = 'obs'; this.phaseT = 3; this.obsT = 0; this.impactP = this.pos.clone(); UI.setFilter('obs');
    UI.big('СБИТ ЗЕНИТКОЙ', res.title === 'ЦЕЛЬ УНИЧТОЖЕНА' ? res.sub : 'Летай ниже 6 м рядом с зениткой', 3);
  },
  finish(win){
    this.phase = 'done'; Snd.setMotor(false, 0); Snd.setStatic(0);
    const map = this.map, left = this.sorties - this.used;
    let stars = 0;
    if (win) stars = this.used <= Math.ceil(this.sorties / 2) ? 3 : this.used < this.sorties ? 2 : 1;
    const bonus = win ? 120 * map.diff + left * 40 : 0, total = this.coins + bonus;
    Save.d.coins += total; Save.d.stars[map.id] = Math.max(Save.d.stars[map.id] || 0, stars); Save.save();
    UI.showResult({win, stars, title:win ? 'Задача выполнена' : 'Дроны закончились', rows:[
      ['Карта', map.name], ['Аппарат', this.def.name], ['Вылетов', `${this.used} из ${this.sorties}`],
      ['Уничтожено', `${this.targets.filter(v => !v.alive).length} из ${this.targets.length}`],
      ['За цели', `+${this.coins}`], ['Бонус', `+${bonus}`], ['Итого', `+${total} монет`]]});
  },
};
