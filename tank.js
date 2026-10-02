// ===== Tank mode: drive a tank, fight vehicles and incoming FPV drones =====
const Tank = {
  start(map, def){
    this.map = map; this.def = def;
    W.build(map, 'tank'); FX.init(W.scene);
    const t = map.t;
    this.enemies = W.spawnTargets({tank:2 + Math.floor(map.diff / 2), apc:2, truck:2, arty:t.arty ? 1 : 0, aa:Math.min(t.aa, 1), depot:t.depot}, map.camo, [-720, 180]);
    const p = this.p = {x:0, z:640, yaw:Math.PI, speed:0, hp:def.hp, ty:Math.PI, gp:0.02};
    p.g = W.makeVehicle('tank', map.snow ? 0xa9ada4 : 0x6a7444); W.scene.add(p.g); W.placeVehicle(p);
    this.drones = []; this.pend = []; this.time = 0; this.waveT = 7; this.reload = 0; this.mgT = 0;
    this.ewOn = false; this.ewE = def.ew; this.coins = 0; this.dkills = 0; this.phase = 'fight'; this.hitFlash = 0;
    Input.L.keepY = false; Input.L.x = Input.L.y = 0;
    UI.buildMarks(this.enemies); UI.buildMiniBase(); UI.setFilter(map.night ? 'thermal' : '');
    UI.big('РЕЖИМ ТАНКА', 'Уничтожь технику противника.\nСбивай FPV-дроны пулемётом или глуши РЭБ.', 3);
  },
  update(dt){
    if (this.phase !== 'fight') { FX.update(dt, CAM); return; }
    this.time += dt;
    W.updateVehicles(dt); for (const v of W.vehicles) FX.wreckSmoke(v, dt);
    this.drive(dt); this.weapons(dt); this.enemyAI(dt); this.dronesAI(dt);
    FX.update(dt, CAM); W.updateWeather(CAM, dt); this.camera(dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    UI.tankHud(this);
    if (this.enemies.every(v => !v.alive)) this.finish(true);
    else if (this.p.hp <= 0) this.finish(false);
  },
  drive(dt){
    const p = this.p, d = this.def, thr = Input.L.y;
    const target = thr >= 0 ? thr * d.speed : thr * d.speed * 0.45;
    p.speed += (target - p.speed) * Math.min(1, dt * 1.1);
    p.yaw += -Input.L.x * d.turn * dt * (p.speed < -0.5 ? -1 : 1);
    const nx = p.x + Math.sin(p.yaw) * p.speed * dt, nz = p.z + Math.cos(p.yaw) * p.speed * dt;
    let ok = Math.abs(nx) < 800 && Math.abs(nz) < 800 && !W.blocked(nx, nz, 2.5) && !(this.map.water && W.groundH(nx, nz) < 0.6);
    if (ok) for (const v of W.vehicles) if (Math.hypot(v.x - nx, v.z - nz) < v.def.r + 3) { ok = false; break; }
    if (ok) { p.x = nx; p.z = nz; } else p.speed *= -0.2;
    W.placeVehicle(p);
    const s = Save.d.sens;
    p.ty += -Input.R.x * 1.1 * s * dt; p.gp = clamp(p.gp + Input.R.y * 0.45 * s * dt, -0.12, 0.5);
    const parts = p.g.userData.parts; parts.tur.rotation.y = p.ty - p.yaw; parts.gun.rotation.x = -p.gp * 0.6;
    Snd.setEngine(true, Math.abs(p.speed) / d.speed);
  },
  camera(dt){
    const p = this.p, fx = Math.sin(p.ty), fz = Math.cos(p.ty);
    const want = new THREE.Vector3(p.x - fx * 14, p.y + 6 - Math.sin(p.gp) * 9, p.z - fz * 14);
    const gh = W.groundH(want.x, want.z); if (want.y < gh + 1.5) want.y = gh + 1.5;
    CAM.position.lerp(want, Math.min(1, dt * 8));
    const sh = FX.shake * 0.4;
    const g = this.gunDir();
    CAM.lookAt(p.x + g.x * 80 + rnd(-sh, sh), p.y + 2.5 + g.y * 80 + rnd(-sh, sh), p.z + g.z * 80);
    if (CAM.fov !== 62) { CAM.fov = 62; CAM.updateProjectionMatrix(); }
  },
  gunDir(){ const p = this.p; return new THREE.Vector3(Math.sin(p.ty) * Math.cos(p.gp), Math.sin(p.gp), Math.cos(p.ty) * Math.cos(p.gp)); },
  muzzle(){ const p = this.p; return new THREE.Vector3(p.x + Math.sin(p.ty) * 5.5, p.y + 2.3, p.z + Math.cos(p.ty) * 5.5); },
  weapons(dt){
    this.reload = Math.max(0, this.reload - dt);
    const gd = this.gunDir(), aim = W.raycast(this.muzzle(), gd, 1400, 4).point;
    this.aimPoint = aim;
    if (Input.btn.fire && this.reload <= 0) {
      Input.btn.fire = false; this.reload = this.def.reload;
      const m = this.muzzle(), dir = gd.clone();
      dir.y += 0.0017 * m.distanceTo(aim) / 100; // compensate drop
      const tr = FX.tracer(m, dir, 900, 2.2, 0xffe6a0);
      tr.onStep = t => this.shellStep(t);
      FX.sprite('fire', m, dir.clone().multiplyScalar(6), 0.25, 3, 4, 0xffffff, 1);
      FX.sprite('smoke', m, dir.clone().multiplyScalar(4), 2, 3, 3, 0xbbb8b0, 0.6);
      Snd.cannon(); FX.shake = Math.max(FX.shake, 0.5);
    } else if (Input.btn.fire && this.reload > 0) Input.btn.fire = false;
    this.mgT -= dt;
    if (Input.btn.mg && this.mgT <= 0) {
      this.mgT = 0.085;
      const m = new THREE.Vector3(this.p.x, this.p.y + 3.4, this.p.z), dir = aim.clone().sub(m).normalize();
      dir.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.008)).normalize();
      const tr = FX.tracer(m, dir, 650, 1.3, 0xff8a50);
      tr.onStep = t => this.bulletStep(t);
      Snd.mg();
    }
    if (Input.btn.ewToggle) { Input.btn.ewToggle = false; this.ewOn = !this.ewOn && this.ewE > 0.5; }
    if (this.ewOn) { this.ewE -= dt; if (this.ewE <= 0) { this.ewE = 0; this.ewOn = false; } }
    else this.ewE = Math.min(this.def.ew, this.ewE + dt * 0.35);
  },
  segHit(t, r){
    for (let i = 1; i <= 5; i++) {
      const pt = t.prev.clone().lerp(t.pos, i / 5), h = W.collide(pt, r);
      if (h) return {pt, h};
    }
    return null;
  },
  shellStep(t){
    for (const d of this.drones) if (d.alive && segPointDist(t.prev, t.pos, d.pos) < 2.5) this.killDrone(d);
    const r = this.segHit(t, 0.1); if (!r) return;
    t.dead = true; FX.explosion(r.pt, 1.1, r.h.kind); Snd.boom(CAM.position.distanceTo(r.pt));
    for (const v of this.enemies) {
      if (!v.alive) continue; let dmg = 0;
      if (r.h.veh === v) {
        const fwd = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw)), dir = t.vel.clone().setY(0).normalize(), dot = dir.dot(fwd);
        dmg = 75 * (dot > 0.5 ? 1.5 : dot < -0.5 ? 0.75 : 1.15) * (v.def.armored ? 1 : 1.6);
      } else { const dd = Math.hypot(v.x - r.pt.x, v.z - r.pt.z) - v.def.r; if (dd < 6) dmg = 30 * (1 - Math.max(0, dd) / 6) * (v.def.armored ? 0.4 : 1.2); }
      if (dmg) { v.hp -= dmg; if (v.hp <= 0) this.killVeh(v); else UI.big('', `${v.def.name}: попадание, ${Math.round(v.hp / v.maxHp * 100)}%`, 1.2); }
    }
  },
  bulletStep(t){
    for (const d of this.drones) if (d.alive && segPointDist(t.prev, t.pos, d.pos) < 1.7) { this.killDrone(d); t.dead = true; return; }
    const r = this.segHit(t, 0.05); if (!r) return; t.dead = true;
    if (r.h.veh && r.h.veh.alive && !r.h.veh.def.armored) { r.h.veh.hp -= 3; if (r.h.veh.hp <= 0) this.killVeh(r.h.veh); }
    if (Math.random() < 0.3) FX.sprite('smoke', r.pt, new THREE.Vector3(0, 1, 0), 0.6, 0.6, 1.5, 0x9a8e78, 0.6);
  },
  killVeh(v){
    W.killVehicle(v); this.coins += v.def.reward;
    const c = new THREE.Vector3(v.x, v.y + 1.5, v.z); FX.explosion(c, v.type === 'depot' ? 3 : 1.6, 'veh'); Snd.boom(CAM.position.distanceTo(c));
    UI.big('', `${v.def.name} уничтожен  +${v.def.reward}`, 1.6);
  },
  // ---------- enemy vehicles ----------
  enemyAI(dt){
    const p = this.p, P = new THREE.Vector3(p.x, p.y + 1.5, p.z);
    for (const v of this.enemies) {
      if (!v.alive) continue;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < 950 && (v.type === 'tank' || v.type === 'apc')) v.speed = 0;
      const parts = v.g.userData.parts;
      if (parts.tur && d < 900) parts.tur.rotation.y = Math.atan2(p.x - v.x, p.z - v.z) - v.yaw;
      const range = v.type === 'tank' ? 800 : v.type === 'apc' ? 500 : v.type === 'aa' ? 450 : v.type === 'arty' ? 1400 : 0;
      if (!range || d > range) continue;
      v.cool -= dt; if (v.cool > 0) continue;
      v.cool = v.type === 'tank' ? rnd(6, 10) : v.type === 'apc' ? rnd(3, 5) : v.type === 'aa' ? rnd(4, 6) : rnd(11, 15);
      const m = new THREE.Vector3(v.x, v.y + 2.2, v.z);
      if (v.type === 'arty') { const E = P.clone().add(new THREE.Vector3(rnd(-28, 28), 0, rnd(-28, 28))); E.y = W.groundH(E.x, E.z); this.pend.push({t:2.5, E, arty:true}); UI.big('', 'Обстрел артиллерией!', 1.5); continue; }
      const moveF = Math.min(1, Math.abs(p.speed) / 10);
      const chance = (v.type === 'tank' ? 0.55 : 0.45) * (1 - d / (range * 1.6)) * (1 - moveF * 0.5);
      const hit = Math.random() < chance;
      const E = hit ? P.clone() : P.clone().add(new THREE.Vector3(rnd(-12, 12), rnd(-1, 6), rnd(-12, 12)));
      const dmg = v.type === 'tank' ? rnd(40, 60) : v.type === 'apc' ? rnd(18, 28) : rnd(10, 16);
      const n = v.type === 'tank' ? 1 : 5;
      for (let i = 0; i < n; i++) {
        const tr = FX.tracer(m, E.clone().sub(m), v.type === 'tank' ? 700 : 500, d / 500 + 0.2, 0xffd27a);
        const ttl = d / (v.type === 'tank' ? 700 : 500);
        this.pend.push({t:ttl + i * 0.09, E:E.clone().add(new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1)).multiplyScalar(n > 1 ? 2 : 0)), hit:hit && i === 0, dmg, big:v.type === 'tank', tr});
      }
      if (v.type === 'tank') { FX.sprite('fire', m, new THREE.Vector3(), 0.25, 3, 3, 0xffffff, 1); Snd.boom(d * 0.8); }
    }
    for (let i = this.pend.length - 1; i >= 0; i--) {
      const s = this.pend[i]; s.t -= dt; if (s.t > 0) continue;
      this.pend.splice(i, 1); if (s.tr) s.tr.dead = true;
      if (s.arty) { FX.explosion(s.E, 1.8, 'ground'); Snd.boom(CAM.position.distanceTo(s.E)); const dd = Math.hypot(s.E.x - p.x, s.E.z - p.z); if (dd < 10) this.damage(70 * (1 - dd / 10), 'Артиллерия'); continue; }
      if (s.big || Math.random() < 0.3) FX.explosion(s.E, s.big ? 1 : 0.3, 'air');
      if (s.big) Snd.boom(CAM.position.distanceTo(s.E));
      if (s.hit) this.damage(s.dmg, 'Попадание');
    }
  },
  damage(d, what){
    d *= 260 / (200 + this.def.hp * 0.25);
    this.p.hp -= d; this.hitFlash = 0.5; FX.shake = Math.max(FX.shake, 1);
    UI.warn(`${what}! −${Math.round(d)}`, 1.2);
  },
  // ---------- enemy FPV drones ----------
  dronesAI(dt){
    const p = this.p, P = new THREE.Vector3(p.x, p.y + 1.8, p.z);
    this.waveT -= dt;
    if (this.waveT <= 0) {
      this.waveT = Math.max(4.5, 12 - this.time / 25) * rnd(0.8, 1.2);
      const n = 1 + (this.time > 70 ? 1 : 0) + (this.time > 160 && Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = p.ty + Math.PI + rnd(-2.2, 2.2) + Math.PI, dist = rnd(450, 620);
        const pos = new THREE.Vector3(p.x + Math.sin(a) * dist, 0, p.z + Math.cos(a) * dist); pos.y = W.surfaceH(pos.x, pos.z) + rnd(22, 40);
        const g = W.makeVehicle('drone'); W.scene.add(g);
        this.drones.push({pos, vel:new THREE.Vector3(), g, alive:true, state:'go', fiber:this.time > 50 && Math.random() < 0.28, ph:rnd(0, 6), spd:rnd(24, 30)});
      }
    }
    let nearest = 1e9;
    for (const d of this.drones) {
      if (!d.alive) continue;
      const to = P.clone().sub(d.pos), dist = to.length(); nearest = Math.min(nearest, dist);
      if (d.state !== 'jam' && this.ewOn && !d.fiber && dist < 120) { d.state = 'jam'; d.vel.multiplyScalar(0.45).add(new THREE.Vector3(rnd(-4, 4), 0, rnd(-4, 4))); }
      if (d.state === 'jam') { d.vel.y -= G * dt; d.vel.multiplyScalar(1 - dt * 0.4); }
      else {
        const want = to.clone().normalize();
        if (dist > 90) { want.y = clamp((P.y + 16 - d.pos.y) / 30, -0.4, 0.4); want.x += Math.sin(this.time * 1.7 + d.ph) * 0.25; want.normalize(); }
        const sp = dist < 90 ? d.spd + 8 : d.spd;
        d.vel.lerp(want.multiplyScalar(sp), Math.min(1, dt * 2.2));
      }
      d.pos.addScaledVector(d.vel, dt);
      d.g.position.copy(d.pos); d.g.lookAt(d.pos.clone().add(d.vel)); d.g.rotateX(-0.5);
      d.g.userData.led.visible = (this.time * 4 + d.ph) % 1 < 0.5;
      const dt2 = d.pos.distanceTo(P);
      if (dt2 < 3.4) { this.droneBoom(d, true); continue; }
      const h = W.collide(d.pos, 0.3); if (h) this.droneBoom(d, false);
    }
    this.nearestDrone = nearest;
    Snd.setMotor(nearest < 260, clamp(1 - nearest / 260, 0, 1), 'quad');
    this.drones = this.drones.filter(d => d.alive || d.g.parent);
  },
  droneBoom(d, direct){
    d.alive = false; W.scene.remove(d.g);
    FX.explosion(d.pos, 0.8, direct ? 'air' : 'ground'); Snd.boom(CAM.position.distanceTo(d.pos));
    const dd = Math.hypot(d.pos.x - this.p.x, d.pos.z - this.p.z);
    if (direct) this.damage(rnd(40, 60) * (d.vel.y < -5 ? 1.3 : 1), d.vel.y < -5 ? 'FPV в крышу' : 'FPV-дрон');
    else if (dd < 7) this.damage(25 * (1 - dd / 7), 'Осколки');
  },
  killDrone(d){
    if (!d.alive) return; d.alive = false; W.scene.remove(d.g); this.dkills++; this.coins += 25;
    FX.explosion(d.pos, 0.5, 'air'); Snd.boom(CAM.position.distanceTo(d.pos));
    UI.big('', 'FPV-дрон сбит  +25', 1.2);
  },
  finish(win){
    this.phase = 'done'; Snd.setEngine(false, 0); Snd.setMotor(false, 0);
    for (const d of this.drones) W.scene.remove(d.g);
    const hpP = Math.max(0, this.p.hp / this.def.hp);
    const stars = win ? (hpP > 0.6 ? 3 : hpP > 0.3 ? 2 : 1) : 0, bonus = win ? 150 * this.map.diff : 0, total = this.coins + bonus;
    Save.d.coins += total; Save.d.tstars[this.map.id] = Math.max(Save.d.tstars[this.map.id] || 0, stars); Save.save();
    UI.showResult({win, stars, title:win ? 'Противник разбит' : 'Танк подбит', rows:[
      ['Карта', this.map.name], ['Танк', this.def.name], ['Время', UI.fmtT(this.time)],
      ['Техника', `${this.enemies.filter(v => !v.alive).length} из ${this.enemies.length}`], ['Сбито дронов', this.dkills],
      ['Броня', `${Math.round(hpP * 100)}%`], ['Итого', `+${total} монет`]]});
  },
};
