// ===== World: terrain, roads, trees, buildings, vehicles, collisions =====
function mulberry(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoise(seed){
  const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  return (x, y) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vn(x * f, y * f); f *= 2; a *= 0.5; } return s / 0.9375; };
}
function segDist(px, pz, ax, az, bx, bz){
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = clamp(t, 0, 1);
  const x = ax + dx * t - px, z = az + dz * t - pz; return Math.sqrt(x * x + z * z);
}

const MatCache = {};
function mat(color, opts){ const k = color + JSON.stringify(opts || {}); if (!MatCache[k]) { MatCache[k] = new THREE.MeshLambertMaterial(Object.assign({color}, opts || {})); MatCache[k].userData.keep = true; } return MatCache[k]; }
const GeoCache = {};
function box(w, h, d){ const k = 'b' + w + ',' + h + ',' + d; if (!GeoCache[k]) GeoCache[k] = new THREE.BoxGeometry(w, h, d); return GeoCache[k]; }
function cyl(r1, r2, h, s){ const k = 'c' + r1 + ',' + r2 + ',' + h + ',' + s; if (!GeoCache[k]) GeoCache[k] = new THREE.CylinderGeometry(r1, r2, h, s || 8); return GeoCache[k]; }
function part(g, geo, m, x, y, z, rx, ry, rz){ const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0); g.add(o); return o; }

const W = {
  size:2400, seg:192, half:1200, play:820,
  build(map, mode){
    this.map = map; this.mode = mode;
    const seed = MAPS.indexOf(map) * 7919 + 13;
    this.rand = mulberry(seed); this.noise = makeNoise(seed); this.noise2 = makeNoise(seed + 99);
    if (this.scene) this.dispose();
    const sc = this.scene = new THREE.Scene();
    sc.fog = new THREE.FogExp2(map.fog, map.fogD);
    sc.background = new THREE.Color(map.sky);
    this.vehicles = []; this.trees = []; this.boxes = []; this.grid = new Map(); this.roads = []; this.disp = [];
    this.makeRoads();
    this.makeTerrain();
    this.makeSky();
    const hemi = new THREE.HemisphereLight(map.night ? 0x445566 : 0xdfeaff, map.night ? 0x111111 : 0x4a4636, map.night ? 0.5 : 0.75);
    const sun = new THREE.DirectionalLight(map.night ? 0x8899bb : 0xfff1d6, map.night ? 0.25 : 0.85); sun.position.set(-300, 500, 200);
    sc.add(hemi, sun);
    if (map.city) this.makeCity(); else this.makeHouses();
    this.makeTrees();
    this.makeBase();
    if (map.snow) this.makeSnow();
    return sc;
  },
  dispose(){
    this.scene.traverse(o => {
      if (o.geometry && !Object.values(GeoCache).includes(o.geometry)) o.geometry.dispose();
      if (o.material && !o.material.userData.keep) o.material.dispose();
    });
  },
  // ---------- terrain ----------
  rawH(x, z){
    const m = this.map;
    let h = (this.noise(x / 330 + 50, z / 330 + 50) - 0.5) * 2 * m.amp + (this.noise2(x / 80, z / 80) - 0.5) * m.amp * 0.22;
    if (m.mountains) { const v = Math.abs(x - 120 * Math.sin(z / 260)); h = h * 0.5 + Math.pow(Math.max(0, v - 55) / 240, 1.6) * m.amp * 1.7; }
    if (m.city) h *= 0.12;
    if (m.water && x > 300) h -= (x - 300) * 0.09;
    // flatten roads slightly and the launch site
    const rd = this.roadDist(x, z); if (rd < 14) h = lerp(h, h * 0.6, 1 - rd / 14);
    const db = Math.hypot(x, z - 700); if (db < 50) h = lerp(h, this.baseH0 || h, 1 - db / 50);
    return h;
  },
  makeTerrain(){
    const m = this.map, n = this.seg + 1, step = this.size / this.seg;
    this.baseH0 = 0; this.baseH0 = this.rawH(0, 700);
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.seg, this.seg); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    this.hg = new Float32Array(n * n); this.step = step; this.n = n;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = this.rawH(x, z);
      pos.setY(i, h);
      const ix = Math.round((x + this.half) / step), iz = Math.round((z + this.half) / step); this.hg[iz * n + ix] = h;
      const t = this.noise2(x / 40 + 3, z / 40 + 3);
      let r = lerp(m.g1[0], m.g2[0], t), g = lerp(m.g1[1], m.g2[1], t), b = lerp(m.g1[2], m.g2[2], t);
      const f = 0.85 + this.noise(x / 9, z / 9) * 0.3; r *= f; g *= f; b *= f;
      if (m.mountains && h > 55) { const s = clamp((h - 55) / 25, 0, 1); r = lerp(r, 0.92, s); g = lerp(g, 0.93, s); b = lerp(b, 0.96, s); }
      if (m.water && h < 2.5) { r = 0.82; g = 0.76; b = 0.56; }
      const rd = this.roadDist(x, z);
      if (rd < 6) { const s = 1 - rd / 6; const rc = m.snow ? [0.55, 0.55, 0.55] : m.city ? [0.23, 0.23, 0.24] : [0.42, 0.37, 0.3]; r = lerp(r, rc[0], s); g = lerp(g, rc[1], s); b = lerp(b, rc[2], s); }
      if (Math.hypot(x, z - 700) < 26) { r = 0.4; g = 0.38; b = 0.33; }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({vertexColors:true}));
    this.scene.add(mesh); this.terrain = mesh;
    if (m.water) {
      const wg = new THREE.PlaneGeometry(6000, 6000); wg.rotateX(-Math.PI / 2);
      const wm = new THREE.MeshLambertMaterial({color:0x2c5a74, transparent:true, opacity:0.88});
      const w = new THREE.Mesh(wg, wm); w.position.y = 0; this.scene.add(w);
    }
    // outer ground skirt so the horizon never shows a hole
    const sg = new THREE.PlaneGeometry(9000, 9000); sg.rotateX(-Math.PI / 2);
    const skirt = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({color:new THREE.Color(m.g1[0] * 0.9, m.g1[1] * 0.9, m.g1[2] * 0.9)}));
    skirt.position.y = (m.water ? -30 : Math.min(-m.amp * 0.6, -3)); this.scene.add(skirt);
  },
  groundH(x, z){
    const n = this.n, fx = clamp((x + this.half) / this.step, 0, n - 1.001), fz = clamp((z + this.half) / this.step, 0, n - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, g = this.hg;
    const a = g[iz * n + ix], b = g[iz * n + ix + 1], c = g[(iz + 1) * n + ix], d = g[(iz + 1) * n + ix + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  },
  surfaceH(x, z){ const h = this.groundH(x, z); return this.map.water ? Math.max(h, 0) : h; },
  makeSky(){
    const m = this.map, g = new THREE.SphereGeometry(4000, 16, 12), col = [], top = new THREE.Color(m.sky).multiplyScalar(m.night ? 0.6 : 0.78), hor = new THREE.Color(m.fog);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = clamp(p.getY(i) / 1600, 0, 1); const c = hor.clone().lerp(top, Math.sqrt(t)); col.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.BackSide, fog:false, depthWrite:false}));
    sky.renderOrder = -1; this.scene.add(sky); this.sky = sky;
  },
  // ---------- roads ----------
  makeRoads(){
    const m = this.map, R = this.rand, roads = this.roads;
    const poly = (pts) => { let L = 0; const cum = [0]; for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); } roads.push({pts, cum, len:L}); };
    if (m.city) {
      for (const z of [-480, -170, 140]) poly([[-760, z], [760, z]]);
      for (const x of [-330, 0, 330]) poly([[x, -780], [x, 420]]);
      poly([[0, 420], [0, 790]]);
      return;
    }
    if (m.mountains) { const pts = []; for (let z = -800; z <= 800; z += 40) pts.push([120 * Math.sin(z / 260), z]); poly(pts); return; }
    const ph = R() * 6, z0 = -260 + R() * 120, pts = [];
    for (let x = -800; x <= 800; x += 50) pts.push([x, z0 + 90 * Math.sin(x / 230 + ph)]);
    poly(pts);
    const x0 = -150 + R() * 300, pts2 = [];
    for (let z = -800; z <= 790; z += 50) pts2.push([x0 + 70 * Math.sin(z / 200 + ph * 2) * (z < 650 ? 1 : 0.2), z]);
    poly(pts2);
    if (m.water) poly([[200, -700], [230, -300], [210, 100], [180, 400]]);
    else { const z1 = -560 + R() * 80, pts3 = []; for (let x = -800; x <= 600; x += 50) pts3.push([x, z1 + 60 * Math.cos(x / 180)]); poly(pts3); }
  },
  roadDist(x, z){
    let d = 1e9;
    for (const r of this.roads) for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i]; if (Math.abs(a[0] - x) > 140 && Math.abs(b[0] - x) > 140 && Math.sign(a[0] - x) === Math.sign(b[0] - x)) continue; d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1])); }
    return d;
  },
  roadAt(r, s){
    s = clamp(s, 0, r.len - 0.01); let i = 1; while (i < r.cum.length - 1 && r.cum[i] < s) i++;
    const a = r.pts[i - 1], b = r.pts[i], t = (s - r.cum[i - 1]) / (r.cum[i] - r.cum[i - 1]);
    return {x:lerp(a[0], b[0], t), z:lerp(a[1], b[1], t), yaw:Math.atan2(b[0] - a[0], b[1] - a[1])};
  },
  // ---------- spatial grid ----------
  key(cx, cz){ return (cx + 200) * 1000 + (cz + 200); },
  addGrid(obj, minx, maxx, minz, maxz, kind){
    for (let cx = Math.floor(minx / 40); cx <= Math.floor(maxx / 40); cx++) for (let cz = Math.floor(minz / 40); cz <= Math.floor(maxz / 40); cz++) {
      const k = this.key(cx, cz); let c = this.grid.get(k); if (!c) { c = {t:[], b:[]}; this.grid.set(k, c); } c[kind].push(obj);
    }
  },
  cell(x, z){ return this.grid.get(this.key(Math.floor(x / 40), Math.floor(z / 40))); },
  blocked(x, z, pad){ // is a building near this ground point
    const c = this.cell(x, z); if (!c) return false;
    for (const b of c.b) if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true; return false;
  },
  // ---------- buildings ----------
  addBuildings(list, roofs){
    if (!list.length) return;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), list.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    list.forEach((b, i) => { M.compose(new THREE.Vector3((b.x0 + b.x1) / 2, b.y + b.h / 2, (b.z0 + b.z1) / 2), q, new THREE.Vector3(b.x1 - b.x0, b.h, b.z1 - b.z0)); im.setMatrixAt(i, M); c.setHex(b.color); im.setColorAt(i, c); });
    this.scene.add(im);
    if (roofs && roofs.length) {
      const rg = new THREE.CylinderGeometry(1, 1, 1, 3); rg.rotateX(-Math.PI / 2);
      const rm = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial(), roofs.length);
      roofs.forEach((r, i) => { const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.rot, 0)); M.compose(new THREE.Vector3(r.x, r.y, r.z), qq, new THREE.Vector3(r.w, r.h, r.d)); rm.setMatrixAt(i, M); c.setHex(r.color); rm.setColorAt(i, c); });
      this.scene.add(rm);
    }
    for (const b of list) { b.top = b.y + b.h; this.boxes.push(b); this.addGrid(b, b.x0, b.x1, b.z0, b.z1, 'b'); }
  },
  makeHouses(){
    const m = this.map, R = this.rand, list = [], roofs = [];
    const walls = m.snow ? [0xd8d4c8, 0xa89c88, 0x8a7a66] : m.night ? [0x6a665c] : [0xe8e0cc, 0xd9c79a, 0xbfb6a6, 0xc9b28a, 0x9fa6a0];
    const roofC = m.snow ? [0xf0f2f5] : [0x8a3b2a, 0x6e5a4a, 0x5d6a6e, 0x7b2f22];
    let tries = 0;
    while (list.length < m.houses && tries++ < 4000) {
      const r = this.roads[Math.floor(R() * this.roads.length)], s = R() * r.len, p = this.roadAt(r, s), side = R() < 0.5 ? -1 : 1, off = 16 + R() * 14;
      const x = p.x + Math.cos(p.yaw) * off * side, z = p.z - Math.sin(p.yaw) * off * side;
      if (Math.abs(x) > 760 || z > 600 || z < -780 || this.blocked(x, z, 8) || this.roadDist(x, z) < 11) continue;
      const y = this.groundH(x, z); if (m.water && y < 1.5) continue;
      const w = 7 + R() * 4, d = 6 + R() * 4, h = 3.2 + R() * 2.2;
      const b = {x0:x - w / 2, x1:x + w / 2, z0:z - d / 2, z1:z + d / 2, y:y - 1, h:h + 1, roofH:3.6, color:walls[Math.floor(R() * walls.length)]};
      list.push(b); roofs.push({x, y:y + h + 1.2, z, w:w * 0.62, h:2.4, d:d * 1.02, rot:0, color:roofC[Math.floor(R() * roofC.length)]});
    }
    this.addBuildings(list, roofs);
  },
  makeCity(){
    const m = this.map, R = this.rand, list = [];
    const cols = m.city === 2 ? [0x8d8c84, 0x6f7a7c, 0x9a8f7c, 0x7b6f63] : [0xb9b4a8, 0x9da3a6, 0xc7bfae, 0x8b9196, 0xa89f94, 0x7d8a8e];
    const step = m.city === 2 ? 70 : 42;
    for (let x = -740; x < 740; x += step) for (let z = -760; z < 380; z += step) {
      if (R() < 0.12) continue;
      const w = m.city === 2 ? 30 + R() * 30 : 18 + R() * 14, d = m.city === 2 ? 26 + R() * 28 : 18 + R() * 14;
      const cx = x + step / 2, cz = z + step / 2;
      if (this.roadDist(cx, cz) < Math.max(w, d) / 2 + 9) continue;
      const y = this.groundH(cx, cz) - 1;
      const h = m.city === 2 ? 8 + R() * 10 : 10 + Math.pow(R(), 1.6) * 55;
      list.push({x0:cx - w / 2, x1:cx + w / 2, z0:cz - d / 2, z1:cz + d / 2, y, h, color:cols[Math.floor(R() * cols.length)]});
      if (m.city === 2 && R() < 0.25) list.push({x0:cx - 1.5, x1:cx + 1.5, z0:cz - 1.5, z1:cz + 1.5, y, h:h + 25 + R() * 20, color:0x6b5f57});
    }
    this.addBuildings(list);
  },
  // ---------- trees ----------
  makeTrees(){
    const m = this.map, R = this.rand, n = m.trees; if (!n) return;
    const pine = m.treeKind === 'pine', pts = [];
    let tries = 0;
    while (pts.length < n && tries++ < n * 6) {
      // clustered: pick a cluster centre then scatter
      const cx = (R() * 2 - 1) * 1150, cz = (R() * 2 - 1) * 1150, k = 1 + Math.floor(R() * 12);
      for (let j = 0; j < k && pts.length < n; j++) {
        const x = cx + (R() - 0.5) * 70, z = cz + (R() - 0.5) * 70;
        if (this.roadDist(x, z) < 9 || Math.hypot(x, z - 700) < 45 || this.blocked(x, z, 3)) continue;
        const y = this.groundH(x, z); if (m.water && y < 1.5) continue; if (m.mountains && y > 70) continue;
        const h = pine ? 11 + R() * 8 : 7 + R() * 5, r = pine ? 2.6 + R() * 1.2 : 3 + R() * 1.5;
        pts.push({x, y, z, h, r, pine});
      }
    }
    const fg = pine ? new THREE.ConeGeometry(1, 1, 7) : new THREE.IcosahedronGeometry(1, 0);
    const fol = new THREE.InstancedMesh(fg, new THREE.MeshLambertMaterial(), pts.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 1, 5), new THREE.MeshLambertMaterial({color:0x4a3a2a}), pts.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    const base = m.snow ? [0.55, 0.62, 0.58] : m.night ? [0.12, 0.16, 0.1] : pine ? [0.13, 0.27, 0.14] : m.id === 'desert' ? [0.4, 0.42, 0.2] : [0.22, 0.38, 0.14];
    pts.forEach((t, i) => {
      if (t.pine) M.compose(new THREE.Vector3(t.x, t.y + 1.5 + (t.h - 1.5) / 2, t.z), q, new THREE.Vector3(t.r, t.h - 1.5, t.r));
      else M.compose(new THREE.Vector3(t.x, t.y + t.h * 0.62, t.z), q, new THREE.Vector3(t.r, t.h * 0.42, t.r));
      fol.setMatrixAt(i, M); const v = 0.8 + R() * 0.4; c.setRGB(base[0] * v, base[1] * v, base[2] * v); fol.setColorAt(i, c);
      M.compose(new THREE.Vector3(t.x, t.y + 1, t.z), q, new THREE.Vector3(1, t.pine ? 3 : t.h * 0.5, 1)); trunk.setMatrixAt(i, M);
      this.trees.push(t); this.addGrid(t, t.x - 4, t.x + 4, t.z - 4, t.z + 4, 't');
    });
    this.scene.add(fol, trunk);
  },
  makeBase(){
    const y = this.groundH(0, 700), g = new THREE.Group(), sand = mat(this.map.snow ? 0xbfb9a8 : 0x8a7d5c);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 1.4 + 0.8; part(g, box(2.2, 0.8, 1.2), sand, Math.cos(a) * 9, 0.4, Math.sin(a) * 9 + 4, 0, -a, 0); }
    part(g, box(3, 0.3, 3), mat(0x555a4a), 0, 0.15, 0);
    const pole = part(g, cyl(0.06, 0.06, 6, 5), mat(0x333333), 4, 3, 2);
    part(g, box(0.05, 0.9, 1.4), mat(0xd94a2a), 4, 5.5, 2.7);
    g.position.set(0, y, 700); this.scene.add(g);
  },
  makeSnow(){
    const n = 1400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = rnd(-60, 60); p[i * 3 + 1] = rnd(-30, 40); p[i * 3 + 2] = rnd(-60, 60); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.snow = new THREE.Points(g, new THREE.PointsMaterial({color:0xffffff, size:0.25, transparent:true, opacity:0.85}));
    this.snow.frustumCulled = false; this.scene.add(this.snow);
  },
  updateWeather(cam, dt){
    if (!this.map.snow || !this.snow) return;
    const p = this.snow.geometry.attributes.position, a = p.array;
    for (let i = 0; i < a.length; i += 3) { a[i + 1] -= dt * 3; a[i] += dt * 1.2; if (a[i + 1] < -30) a[i + 1] += 70; if (a[i] > 60) a[i] -= 120; }
    p.needsUpdate = true; this.snow.position.copy(cam.position);
  },
  // ---------- vehicles ----------
  makeVehicle(type, color, enemyDrone){
    const g = new THREE.Group(), body = mat(color), dark = mat(0x2a2b26), metal = mat(0x4a4c46);
    const heat = this.map && this.map.night ? mat(color, {emissive:0x777777}) : body;
    g.userData.parts = {};
    if (type === 'tank' || type === 'arty') {
      part(g, box(0.9, 1.0, 6.8), dark, -1.6, 0.5, 0); part(g, box(0.9, 1.0, 6.8), dark, 1.6, 0.5, 0);
      part(g, box(3.3, 1.0, 6.4), heat, 0, 1.2, 0); part(g, box(3.2, 0.5, 1.2), body, 0, 1.55, 2.9, -0.35);
      const tur = new THREE.Group(); tur.position.set(0, 1.7, type === 'arty' ? -0.8 : -0.2); g.add(tur);
      if (type === 'tank') { part(tur, cyl(1.3, 1.55, 0.85, 8), body, 0, 0.42, 0); part(tur, box(1.6, 0.5, 1.2), body, 0, 0.5, -1.4); }
      else part(tur, box(3.0, 1.7, 3.8), body, 0, 0.85, 0);
      const gun = new THREE.Group(); gun.position.set(0, type === 'tank' ? 0.45 : 1.0, type === 'tank' ? 1.0 : 1.8); tur.add(gun);
      const L = type === 'tank' ? 4.8 : 7; part(gun, cyl(0.09, 0.13, L, 6), metal, 0, 0, L / 2, Math.PI / 2);
      g.userData.parts = {tur, gun};
    } else if (type === 'apc') {
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) part(g, cyl(0.55, 0.55, 0.45, 8), dark, s * 1.45, 0.55, -2.1 + i * 1.4, 0, 0, Math.PI / 2);
      part(g, box(2.9, 1.5, 6.4), heat, 0, 1.45, 0); part(g, box(2.8, 0.8, 1.4), body, 0, 1.2, 3.3, -0.5);
      const tur = new THREE.Group(); tur.position.set(0, 2.2, 0.3); g.add(tur);
      part(tur, box(1.3, 0.55, 1.5), body, 0, 0.28, 0); const gun = new THREE.Group(); gun.position.set(0, 0.3, 0.7); tur.add(gun); part(gun, cyl(0.05, 0.06, 2.4, 5), metal, 0, 0, 1.2, Math.PI / 2);
      g.userData.parts = {tur, gun};
    } else if (type === 'truck') {
      for (const z of [-2, -0.7, 2.2]) for (const s of [-1, 1]) part(g, cyl(0.5, 0.5, 0.4, 8), dark, s * 1.1, 0.5, z, 0, 0, Math.PI / 2);
      part(g, box(2.3, 1.7, 1.9), heat, 0, 1.7, 2.4); part(g, box(2.4, 0.3, 6.4), dark, 0, 0.95, 0.2);
      part(g, box(2.5, 1.9, 4.2), mat(this.map && this.map.snow ? 0xbdbdb0 : 0x5d5a3c), 0, 2.1, -1);
    } else if (type === 'aa') {
      part(g, box(2.6, 0.5, 2.6), metal, 0, 0.5, 0); for (const s of [-1, 1]) part(g, box(0.15, 0.15, 2.4), metal, s * 1.3, 0.25, 0, 0, 0, 0);
      const tur = new THREE.Group(); tur.position.set(0, 0.9, 0); g.add(tur);
      part(tur, box(1.2, 0.8, 1.0), heat, 0, 0.4, 0); part(tur, box(0.5, 0.6, 0.1), metal, 0, 0.9, 0.2);
      const gun = new THREE.Group(); gun.position.set(0, 0.6, 0.2); tur.add(gun);
      for (const s of [-0.35, 0.35]) part(gun, cyl(0.05, 0.06, 2.6, 5), metal, s, 0, 1.3, Math.PI / 2);
      g.userData.parts = {tur, gun};
    } else if (type === 'ew') {
      part(g, box(2.2, 1.6, 4), heat, 0, 1.3, 0); for (const z of [-1.2, 1.2]) for (const s of [-1, 1]) part(g, cyl(0.45, 0.45, 0.35, 8), dark, s * 1.0, 0.45, z, 0, 0, Math.PI / 2);
      part(g, cyl(0.1, 0.14, 7, 5), metal, 0, 5.5, -1);
      for (let i = 0; i < 4; i++) part(g, box(0.12, 1.4, 0.5), mat(0xd8d8d0), Math.cos(i * 1.57) * 0.5, 8.3, -1 + Math.sin(i * 1.57) * 0.5, 0, i * 1.57, 0);
      part(g, cyl(0.9, 0.2, 0.3, 10), mat(0xcfcfc6), 0, 2.4, 1, 0.6, 0, 0);
    } else if (type === 'depot') {
      const crate = mat(0x55603a), crate2 = mat(0x6a5236);
      for (let i = 0; i < 10; i++) { const x = (i % 4) * 1.6 - 2.4, z = Math.floor(i / 4) * 1.4 - 1.4; part(g, box(1.4, 0.9, 1.2), i % 3 ? crate : crate2, x, 0.45 + (i % 2) * 0.9, z); }
      part(g, box(6.4, 0.15, 4.6), mat(this.map && this.map.snow ? 0xd0d0c8 : 0x4f5536), 0, 2.4, -0.3, 0.1);
    } else if (type === 'drone') {
      const f = mat(0x222222), arm = 0.35;
      part(g, box(0.25, 0.08, 0.35), f, 0, 0, 0);
      for (const a of [0.785, 2.356, -0.785, -2.356]) { part(g, box(0.05, 0.04, 0.5), f, Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2, 0, a, 0); part(g, cyl(0.18, 0.18, 0.01, 10), mat(0x888888, {transparent:true, opacity:0.5}), Math.sin(a) * arm, 0.05, Math.cos(a) * arm); }
      part(g, box(0.08, 0.08, 0.3), mat(0x7a6a3a), 0, -0.08, 0.15);
      const led = part(g, box(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({color:0xff2200}), 0, 0.06, -0.15); g.userData.led = led;
      g.scale.setScalar(2.2);
    }
    return g;
  },
  spawnTargets(counts, camo, zone){
    const R = this.rand, m = this.map, list = [];
    const zMin = zone ? zone[0] : -690, zMax = zone ? zone[1] : 250;
    const okPos = (x, z) => Math.abs(x) < 720 && z > zMin && z < zMax && !this.blocked(x, z, 6) && !(m.water && this.groundH(x, z) < 1.2);
    for (const type of Object.keys(counts)) for (let k = 0; k < counts[type]; k++) {
      const def = VEH[type]; let v = null;
      for (let tries = 0; tries < 300 && !v; tries++) {
        if (def.speed > 0) {
          const roadCands = this.roads.filter(r => r.pts.some(p => p[1] > zMin && p[1] < zMax));
          const r = roadCands[Math.floor(R() * roadCands.length)] || this.roads[0], s = R() * r.len, p = this.roadAt(r, s);
          if (!okPos(p.x, p.z)) continue;
          const moving = R() < 0.6;
          v = {type, def, road:r, s, dir:R() < 0.5 ? 1 : -1, speed:moving ? def.speed * (0.7 + R() * 0.5) : 0, x:p.x, z:p.z, yaw:p.yaw};
          if (!moving) { const side = R() < 0.5 ? 1 : -1; v.x += Math.cos(p.yaw) * 9 * side; v.z -= Math.sin(p.yaw) * 9 * side; v.road = null; if (!okPos(v.x, v.z)) v = null; }
        } else {
          const x = (R() * 2 - 1) * 600, z = zMin + 40 + R() * (zMax - zMin - 80);
          if (!okPos(x, z) || this.roadDist(x, z) < 10) continue;
          if (list.some(o => Math.hypot(o.x - x, o.z - z) < 20)) continue;
          v = {type, def, speed:0, x, z, yaw:R() * 6.28};
        }
      }
      if (!v) continue;
      v.hp = v.maxHp = def.hp; v.alive = true; v.burn = 0; v.cool = rnd(1, 3);
      v.g = this.makeVehicle(type, camo); this.scene.add(v.g);
      this.placeVehicle(v); list.push(v); this.vehicles.push(v);
    }
    return list;
  },
  placeVehicle(v){
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const hf = this.surfaceH(v.x + fx * 2.5, v.z + fz * 2.5), hb = this.surfaceH(v.x - fx * 2.5, v.z - fz * 2.5);
    const hl = this.surfaceH(v.x + fz * 1.4, v.z - fx * 1.4), hr = this.surfaceH(v.x - fz * 1.4, v.z + fx * 1.4);
    v.y = (hf + hb + hl + hr) / 4;
    v.g.position.set(v.x, v.y, v.z); v.g.rotation.set(Math.atan2(hb - hf, 5), v.yaw, Math.atan2(hl - hr, 2.8) * 0.8, 'YXZ');
  },
  updateVehicles(dt){
    for (const v of this.vehicles) {
      if (!v.alive || !v.road || !v.speed) continue;
      v.s += v.dir * v.speed * dt;
      if (v.s < 2 || v.s > v.road.len - 2) v.dir *= -1;
      const p = this.roadAt(v.road, v.s);
      if (p.z < -760 || p.z > 380 || Math.abs(p.x) > 760) { v.dir *= -1; v.s += v.dir * v.speed * dt * 2; continue; }
      v.x = p.x; v.z = p.z; v.yaw = p.yaw + (v.dir < 0 ? Math.PI : 0); this.placeVehicle(v);
    }
  },
  killVehicle(v){
    v.alive = false; v.hp = 0; v.burn = 40;
    const burnt = mat(0x1d1c1a);
    v.g.traverse(o => { if (o.isMesh && !(o.material && o.material.isMeshBasicMaterial)) o.material = burnt; });
    const p = v.g.userData.parts; if (p && p.tur) { p.tur.rotation.z = rnd(-0.6, 0.6); p.tur.position.y += 0.4; p.tur.rotation.y += rnd(-1, 1); }
  },
  // ---------- collisions ----------
  collide(p, r){
    const gh = this.groundH(p.x, p.z);
    if (this.map.water && gh < 0 && p.y < 0.3) return {kind:'water'};
    if (p.y - r < gh) return {kind:'ground'};
    if (Math.abs(p.x) > 1190 || Math.abs(p.z) > 1190) return {kind:'ground'};
    for (const v of this.vehicles) {
      const dx = p.x - v.x, dz = p.z - v.z; if (dx * dx + dz * dz > 100) continue;
      if (Math.sqrt(dx * dx + dz * dz) < v.def.r * 0.85 + r && p.y < v.y + v.def.h + r && p.y > v.y - 1) return {kind:'veh', veh:v};
    }
    const c = this.cell(p.x, p.z);
    if (c) {
      for (const b of c.b) if (p.x > b.x0 - r && p.x < b.x1 + r && p.z > b.z0 - r && p.z < b.z1 + r && p.y < b.top + r + (b.roofH || 0)) return {kind:'building'};
      for (const t of c.t) {
        const dx = p.x - t.x, dz = p.z - t.z, hd = Math.sqrt(dx * dx + dz * dz); if (hd > t.r + r) continue;
        const ly = p.y - t.y; if (ly < 0 || ly > t.h) continue;
        let rr;
        if (ly < 1.5) rr = 0.45; else if (t.pine) rr = t.r * (1 - (ly - 1.5) / (t.h - 1.5)); else { const cy = t.h * 0.62, dy = (ly - cy) / (t.h * 0.42); rr = Math.abs(dy) < 1 ? t.r * Math.sqrt(1 - dy * dy) : 0.45; }
        if (hd < rr * 0.85 + r) return {kind:'tree'};
      }
    }
    return null;
  },
  raycast(o, d, maxD, step){
    step = step || 3; const p = new THREE.Vector3();
    for (let t = step; t < maxD; t += step) {
      p.copy(o).addScaledVector(d, t); const h = this.collide(p, 0);
      if (h) { // refine
        let a = t - step, b = t; for (let i = 0; i < 6; i++) { const m = (a + b) / 2; p.copy(o).addScaledVector(d, m); if (this.collide(p, 0)) b = m; else a = m; }
        p.copy(o).addScaledVector(d, b); return {dist:b, point:p.clone(), hit:this.collide(p, 0.05) || h};
      }
    }
    return {dist:maxD, point:o.clone().addScaledVector(d, maxD), hit:null};
  },
};
