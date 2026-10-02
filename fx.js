// ===== Effects: particles, explosions, smoke, craters, tracers =====
const FX = {
  init(scene){
    this.scene = scene; this.parts = []; this.tracers = []; this.shake = 0;
    if (!this.tex) {
      const mk = (inner, outer) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
        const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, inner); g.addColorStop(1, outer); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
        const t = new THREE.CanvasTexture(c); return t; };
      this.tex = {smoke:mk('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), fire:mk('rgba(255,240,200,1)', 'rgba(255,90,0,0)')};
      this.craterGeo = new THREE.CircleGeometry(1, 12); this.craterGeo.rotateX(-Math.PI / 2);
      this.debrisGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
      this.tracerGeo = new THREE.BoxGeometry(0.12, 0.12, 6);
    }
  },
  sprite(kind, pos, vel, life, size, grow, color, opacity){
    if (this.parts.length > 260) { const old = this.parts.shift(); this.scene.remove(old.s); old.s.material.dispose(); }
    const m = new THREE.SpriteMaterial({map:this.tex[kind === 'fire' ? 'fire' : 'smoke'], color, transparent:true, opacity, depthWrite:false,
      blending:kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending, fog:kind !== 'fire'});
    const s = new THREE.Sprite(m); s.position.copy(pos); s.scale.setScalar(size); this.scene.add(s);
    this.parts.push({s, vel:vel.clone(), life, t:0, size, grow, op:opacity, kind});
  },
  explosion(p, power, kind){
    power = power || 1; const V = THREE.Vector3;
    for (let i = 0; i < 6 + power * 4; i++) this.sprite('fire', p, new V(rnd(-1, 1), rnd(0.5, 2.5), rnd(-1, 1)).multiplyScalar(4 * power), 0.5 + Math.random() * 0.4, 2 + power * 2, 6 * power, 0xffffff, 1);
    for (let i = 0; i < 6 + power * 5; i++) this.sprite('smoke', p.clone().add(new V(rnd(-1, 1), rnd(0, 1), rnd(-1, 1))), new V(rnd(-1, 1), rnd(1, 4), rnd(-1, 1)).multiplyScalar(2.2 * power), 3 + Math.random() * 3, 3 * power, 3 * power, kind === 'water' ? 0xe8f0f4 : 0x3a3631, 0.85);
    if (kind !== 'water') for (let i = 0; i < 8; i++) {
      const d = new THREE.Mesh(this.debrisGeo, mat(0x2a2620)); d.position.copy(p); this.scene.add(d);
      this.parts.push({mesh:d, vel:new V(rnd(-1, 1), rnd(1, 2.5), rnd(-1, 1)).multiplyScalar(9 * power), life:2.5, t:0, kind:'debris'});
    }
    if (kind === 'ground' || kind === 'veh') this.crater(p, 1.6 + power * 1.6);
    this.shake = Math.max(this.shake, 0.6);
  },
  crater(p, r){
    const c = new THREE.Mesh(this.craterGeo, mat(0x1e1b16, {transparent:true, opacity:0.8, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2}));
    c.position.set(p.x, W.groundH(p.x, p.z) + 0.08, p.z); c.scale.setScalar(r); this.scene.add(c);
  },
  wreckSmoke(v, dt){
    if (v.burn <= 0) return; v.burn -= dt; v.smokeT = (v.smokeT || 0) - dt;
    if (v.smokeT < 0) { v.smokeT = 0.35;
      const p = new THREE.Vector3(v.x + rnd(-1, 1), v.y + v.def.h, v.z + rnd(-1, 1));
      this.sprite('smoke', p, new THREE.Vector3(rnd(-0.5, 0.5) + 1.2, 5, rnd(-0.5, 0.5)), 6, 3, 4, 0x26231f, 0.7);
      if (Math.random() < 0.5) this.sprite('fire', p, new THREE.Vector3(0, 3, 0), 0.6, 2.2, 1, 0xffffff, 0.9);
    }
  },
  tracer(from, dir, speed, life, color, owner){
    const m = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({color:color || 0xffd060, fog:false}));
    m.position.copy(from); m.lookAt(from.clone().add(dir)); this.scene.add(m);
    const t = {m, pos:from.clone(), vel:dir.clone().normalize().multiplyScalar(speed), life, owner, prev:from.clone()};
    this.tracers.push(t); return t;
  },
  update(dt, cam){
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.t += dt;
      if (p.kind === 'debris') { p.vel.y -= 9.8 * dt; p.mesh.position.addScaledVector(p.vel, dt); p.mesh.rotation.x += dt * 8; p.mesh.rotation.y += dt * 6;
        const gh = W.groundH(p.mesh.position.x, p.mesh.position.z); if (p.mesh.position.y < gh + 0.2) { p.mesh.position.y = gh + 0.2; p.vel.multiplyScalar(0.3); p.vel.y = Math.abs(p.vel.y); } }
      else { p.vel.multiplyScalar(1 - dt * 1.2); if (p.kind === 'smoke') p.vel.y += dt * 0.6; p.s.position.addScaledVector(p.vel, dt); p.s.scale.setScalar(p.size + p.grow * p.t); p.s.material.opacity = p.op * (1 - p.t / p.life); }
      if (p.t >= p.life) { if (p.mesh) { this.scene.remove(p.mesh); } else { this.scene.remove(p.s); p.s.material.dispose(); } this.parts.splice(i, 1); }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.prev.copy(t.pos); t.vel.y -= 9.8 * dt * 0.3; t.pos.addScaledVector(t.vel, dt); t.m.position.copy(t.pos);
      t.m.lookAt(t.pos.clone().add(t.vel)); t.life -= dt;
      if (t.onStep) t.onStep(t);
      if (t.life <= 0 || t.dead) { this.scene.remove(t.m); t.m.material.dispose(); this.tracers.splice(i, 1); }
    }
    this.shake = Math.max(0, this.shake - dt * 1.5);
  },
};
// closest distance from point c to segment a-b (3D)
function segPointDist(a, b, c){ const ab = b.clone().sub(a), t = clamp(c.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1); return a.clone().addScaledVector(ab, t).distanceTo(c); }
