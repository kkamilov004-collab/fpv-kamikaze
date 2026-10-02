// ===== UI: renderer, loop, menus, touch controls, HUD =====
const renderer = new THREE.WebGLRenderer({canvas:$('gl'), antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
const CAM = new THREE.PerspectiveCamera(70, 1, 0.15, 5000);
function resize(){ renderer.setSize(innerWidth, innerHeight, false); CAM.aspect = innerWidth / innerHeight; CAM.updateProjectionMatrix(); UI.checkRot(); }
const hex = n => '#' + n.toString(16).padStart(6, '0');
const rgb = a => `rgb(${a.map(v => Math.round(v * 255)).join(',')})`;

const UI = {
  mode:null, running:false, paused:false, noise:0, bigT:0, warnT:0, hudT:0, sel:{tab:'quad', mapMode:'drone'},
  screens:['scrMenu', 'scrHangar', 'scrMaps', 'scrSettings', 'scrPause', 'scrResult'],
  show(id){ for (const s of this.screens) $(s).hidden = s !== id; this.checkRot(); },
  fmtT(s){ s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); },
  coins(){ return `<span class="coins">◈ ${Save.d.coins}</span>`; },
  // ---------- main menu ----------
  menu(){
    this.endGame();
    const sm = Object.values(Save.d.stars).reduce((a, b) => a + b, 0), st = Object.values(Save.d.tstars).reduce((a, b) => a + b, 0);
    $('scrMenu').innerHTML = `<div class="wrap">
      <div class="top"><h2></h2>${this.coins()}</div>
      <div class="title-block"><h1 class="logo"><span>5.8 ГГц · 25 мВт → 1.6 Вт</span>FPV<br>КАМИКАДЗЕ</h1>
      <p class="tag">Выбери дрон или ракету, подвесь боевую часть и пройди РЭБ и зенитки до цели. 10 карт, 11 аппаратов и режим танка.</p></div>
      <div class="menu-grid">
        <button class="mbtn main" id="mDrone"><b>Миссии на дронах</b><small>Звёзд: ${sm} из 30 · ${byId(DRONES, Save.d.drone).name}</small></button>
        <button class="mbtn" id="mTank"><b>Режим танка</b><small>Звёзд: ${st} из 30 · отбейся от FPV</small></button>
        <button class="mbtn" id="mHangar"><b>Ангар</b><small>Дроны, ракеты, БЧ и танки</small></button>
        <button class="mbtn" id="mSet"><b>Настройки</b><small>Режим полёта: ${Save.d.mode === 'acro' ? 'Акро' : 'Стабилизация'}</small></button>
      </div>
      <p class="note">Управление: левый стик — газ и поворот, правый — наклон дрона (или прицел танка). На компьютере: WASD + стрелки, пробел — огонь, F — пулемёт, E — РЭБ, Esc — пауза.</p>
    </div>`;
    $('mDrone').onclick = () => { Snd.init(); this.maps('drone'); };
    $('mTank').onclick = () => { Snd.init(); this.maps('tank'); };
    $('mHangar').onclick = () => { Snd.init(); this.hangar(); };
    $('mSet').onclick = () => this.settings('scrMenu');
    $('scrMenu').style.background = 'linear-gradient(90deg,rgba(15,18,13,.94) 0%,rgba(15,18,13,.72) 55%,rgba(15,18,13,.35) 100%)';
    this.show('scrMenu');
  },
  // ---------- hangar ----------
  statRow(label, frac, val){ return `<div class="stat"><span>${label}</span><span class="bar"><i style="width:${Math.round(clamp(frac, 0.03, 1) * 100)}%"></i></span><span class="v">${val}</span></div>`; },
  droneStats(d){
    const m = d.type === 'missile', wh = m ? byId(WARHEADS, d.warhead) : null;
    return this.statRow('Скорость', d.speed / 95, Math.round(d.speed * 3.6) + ' км/ч')
      + this.statRow('Манёвренность', d.agility, Math.round(d.agility * 100))
      + this.statRow(m ? 'Топливо' : 'Время полёта', m ? d.battery / 45 : d.battery / 520, m ? d.battery + ' с' : (d.battery / 20).toFixed(1) + ' мин')
      + (m ? this.statRow('Мощность БЧ', wh.dmg / 220, wh.dmg) : this.statRow('Грузоподъёмн.', d.payload / 6, d.payload + ' кг'))
      + this.statRow('Защита от РЭБ', d.ewResist, d.fiber ? 'кабель' : d.wire ? 'провод' : Math.round(d.ewResist * 100) + '%')
      + this.statRow('Дальность', d.range / 3000, (d.range / 1000).toFixed(1) + ' км');
  },
  hangar(back){
    this.hangarBack = back || this.hangarBack || 'menu';
    const tab = this.sel.tab, D = Save.d;
    const kinds = {quad:'FPV-дроны', wing:'Крылья', missile:'Ракеты', tank:'Танки'};
    let cards = '';
    if (tab === 'tank') cards = TANKS.map(t => {
      const own = D.tanks.includes(t.id), sel = D.tank === t.id;
      return `<div class="card ${sel ? 'sel' : ''}"><span class="kind">танк</span><h3>${t.name}</h3><p>${t.desc}</p>
        ${this.statRow('Скорость', t.speed / 17, Math.round(t.speed * 3.6) + ' км/ч') + this.statRow('Броня', t.hp / 650, t.hp) + this.statRow('Перезарядка', 3 / t.reload, t.reload + ' с') + this.statRow('РЭБ', t.ew / 12, t.ew + ' с')}
        <div class="row">${own ? `<button class="btn ${sel ? 'primary' : ''}" data-tsel="${t.id}">${sel ? 'Выбран' : 'Выбрать'}</button>` : `<button class="btn" data-tbuy="${t.id}" ${D.coins < t.price ? 'disabled' : ''}>Купить ◈ ${t.price}</button>`}</div></div>`;
    }).join('');
    else cards = DRONES.filter(d => d.type === tab).map(d => {
      const own = D.owned.includes(d.id), sel = D.drone === d.id;
      return `<div class="card ${sel ? 'sel' : ''}"><span class="kind">${kinds[d.type]}${d.fiber ? ' · оптоволокно' : ''}</span><h3>${d.name}</h3><p>${d.desc}</p>${this.droneStats(d)}
        <div class="row">${own ? `<button class="btn ${sel ? 'primary' : ''}" data-sel="${d.id}">${sel ? 'Выбран' : 'Выбрать'}</button>` : `<button class="btn" data-buy="${d.id}" ${D.coins < d.price ? 'disabled' : ''}>Купить ◈ ${d.price}</button>`}</div></div>`;
    }).join('');
    const cur = byId(DRONES, D.drone);
    let whHtml = '';
    if (tab !== 'tank' && cur.type !== 'missile') {
      whHtml = `<div class="section-h">Боевая часть для «${cur.name}» · до ${cur.payload} кг</div><div class="row">` + WARHEADS.filter(w => !w.hidden).map(w =>
        `<button class="chip ${D.warhead === w.id ? 'on' : ''}" data-wh="${w.id}" ${w.weight > cur.payload ? 'disabled' : ''} title="${w.desc}">${w.name} · ${w.weight} кг</button>`).join('') + `</div>
        <p class="note">${byId(WARHEADS, D.warhead).desc} Чем тяжелее БЧ, тем медленнее дрон и быстрее садится батарея.</p>`;
    }
    $('scrHangar').innerHTML = `<div class="wrap">
      <div class="top"><button class="btn ghost" id="hBack">← Назад</button><h2>Ангар</h2>${this.coins()}</div>
      <div class="row">${Object.keys(kinds).map(k => `<button class="chip ${tab === k ? 'on' : ''}" data-tab="${k}">${kinds[k]}</button>`).join('')}</div>
      ${whHtml}<div class="cards">${cards}</div></div>`;
    const h = $('scrHangar');
    h.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { this.sel.tab = b.dataset.tab; this.hangar(); });
    h.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { D.drone = b.dataset.sel; this.fixWarhead(); Save.save(); this.hangar(); });
    h.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { const d = byId(DRONES, b.dataset.buy); if (D.coins >= d.price) { D.coins -= d.price; D.owned.push(d.id); D.drone = d.id; this.fixWarhead(); Save.save(); Snd.click(); this.hangar(); } });
    h.querySelectorAll('[data-tsel]').forEach(b => b.onclick = () => { D.tank = b.dataset.tsel; Save.save(); this.hangar(); });
    h.querySelectorAll('[data-tbuy]').forEach(b => b.onclick = () => { const t = byId(TANKS, b.dataset.tbuy); if (D.coins >= t.price) { D.coins -= t.price; D.tanks.push(t.id); D.tank = t.id; Save.save(); Snd.click(); this.hangar(); } });
    h.querySelectorAll('[data-wh]').forEach(b => b.onclick = () => { D.warhead = b.dataset.wh; Save.save(); this.hangar(); });
    $('hBack').onclick = () => this.hangarBack === 'maps' ? this.maps(this.sel.mapMode) : this.menu();
    this.show('scrHangar');
  },
  fixWarhead(){ const d = byId(DRONES, Save.d.drone); if (d.type !== 'missile' && byId(WARHEADS, Save.d.warhead).weight > d.payload) Save.d.warhead = WARHEADS.filter(w => !w.hidden && w.weight <= d.payload).sort((a, b) => b.dmg - a.dmg)[0].id; },
  // ---------- maps ----------
  maps(mode){
    this.sel.mapMode = mode; const D = Save.d, tank = mode === 'tank';
    const cur = tank ? byId(TANKS, D.tank) : byId(DRONES, D.drone), wh = !tank && cur.type !== 'missile' ? byId(WARHEADS, D.warhead) : null;
    const stars = tank ? D.tstars : D.stars;
    $('scrMaps').innerHTML = `<div class="wrap">
      <div class="top"><button class="btn ghost" id="pBack">← Меню</button><h2>${tank ? 'Режим танка' : 'Миссии на дронах'}</h2>${this.coins()}</div>
      <div class="card" style="flex-direction:row;align-items:center;flex-wrap:wrap;gap:12px"><div style="flex:1;min-width:180px"><span class="kind">${tank ? 'танк' : 'аппарат'}</span><h3>${cur.name}</h3><p>${wh ? 'БЧ: ' + wh.name + ' · ' + wh.weight + ' кг' : tank ? 'Броня ' + cur.hp + ' · РЭБ ' + cur.ew + ' с' : 'Встроенная БЧ'}</p></div>
      <button class="btn" id="pChange">Сменить</button></div>
      <div class="section-h">Выбери карту</div>
      <div class="cards">${MAPS.map(m => `<button class="card" data-map="${m.id}">
        <div class="mapthumb" style="background:linear-gradient(180deg,${hex(m.sky)} 0%,${hex(m.fog)} 48%,${rgb(m.g2)} 50%,${rgb(m.g1)} 100%)"></div>
        <div class="row" style="justify-content:space-between"><h3>${m.name}</h3><span class="diff">${'★'.repeat(stars[m.id] || 0)}${'☆'.repeat(3 - (stars[m.id] || 0))}</span></div>
        <p>${m.desc}</p><span class="diff">Сложность ${'▮'.repeat(m.diff)}${'▯'.repeat(5 - m.diff)}${tank ? '' : ' · вылетов: ' + m.sorties}</span></button>`).join('')}</div></div>`;
    $('pBack').onclick = () => this.menu();
    $('pChange').onclick = () => { this.sel.tab = tank ? 'tank' : byId(DRONES, D.drone).type; this.hangar('maps'); };
    $('scrMaps').querySelectorAll('[data-map]').forEach(b => b.onclick = () => this.startGame(mode, byId(MAPS, b.dataset.map)));
    this.show('scrMaps');
  },
  // ---------- settings ----------
  settings(back){
    const D = Save.d;
    $('scrSettings').innerHTML = `<div class="wrap">
      <div class="top"><button class="btn ghost" id="sBack">← Назад</button><h2>Настройки</h2></div>
      <div class="section-h">Режим полёта квадрокоптера</div>
      <div class="row"><button class="chip ${D.mode === 'angle' ? 'on' : ''}" data-m="angle">Стабилизация (Angle)</button><button class="chip ${D.mode === 'acro' ? 'on' : ''}" data-m="acro">Акро (как у пилотов)</button></div>
      <p class="note">Стабилизация: отпустил стик — дрон выравнивается и висит. Акро: дрон держит угол, газ не возвращается в центр, камера наклонена на 25°. Так летают настоящие FPV-пилоты.</p>
      <div class="section-h">Чувствительность стиков: <span id="sensV">${D.sens.toFixed(1)}</span></div>
      <input type="range" id="sens" min="0.5" max="1.6" step="0.1" value="${D.sens}" style="width:100%;max-width:420px">
      <div class="section-h">Ракеты и крылья</div>
      <div class="row"><button class="chip ${!D.invert ? 'on' : ''}" data-i="0">Стик вверх — летит вверх</button><button class="chip ${D.invert ? 'on' : ''}" data-i="1">Стик вверх — нос вниз (как у пилотов)</button></div>
      <div class="section-h">Звук</div>
      <div class="row"><button class="chip ${D.sound ? 'on' : ''}" data-s="1">Вкл</button><button class="chip ${!D.sound ? 'on' : ''}" data-s="0">Выкл</button></div>
      <div class="section-h">Прогресс</div>
      <div class="row"><button class="btn" id="sReset">Сбросить прогресс</button><span class="note" id="sResetNote"></span></div></div>`;
    const s = $('scrSettings');
    s.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { D.mode = b.dataset.m; Save.save(); this.settings(back); });
    s.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { D.invert = b.dataset.i === '1'; Save.save(); this.settings(back); });
    s.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { D.sound = b.dataset.s === '1'; Snd.setVol(D.sound); Save.save(); this.settings(back); });
    $('sens').oninput = e => { D.sens = +e.target.value; $('sensV').textContent = D.sens.toFixed(1); Save.save(); };
    let armed = false;
    $('sReset').onclick = () => { if (!armed) { armed = true; $('sReset').textContent = 'Точно сбросить?'; $('sResetNote').textContent = 'Монеты, покупки и звёзды удалятся'; return; }
      Object.assign(D, {coins:300, owned:['osa5', 'shershen7'], tanks:['rys'], drone:'shershen7', warhead:'heat', tank:'rys', stars:{}, tstars:{}}); Save.save(); this.menu(); };
    $('sBack').onclick = () => back === 'scrPause' ? this.pause() : this.menu();
    this.show('scrSettings');
  },
  // ---------- game start / end ----------
  startGame(mode, map){
    Snd.init(); this.lastStart = {mode, map}; resetSticks();
    $('loading').hidden = false; $('loading').textContent = 'ПОДГОТОВКА КАРТЫ «' + map.name.toUpperCase() + '»…';
    setTimeout(() => {
      this.show(null); this.mode = mode; this.running = true; this.paused = false;
      if (mode === 'tank') Tank.start(map, byId(TANKS, Save.d.tank));
      else { this.fixWarhead(); Flight.start(map, byId(DRONES, Save.d.drone), byId(WARHEADS, Save.d.warhead)); }
      const fl = mode !== 'tank';
      $('hud').hidden = false; $('ctrls').hidden = false; $('noise').hidden = !fl; $('scan').hidden = !fl; $('vign').hidden = false; $('cross').hidden = false;
      this.tankButtons(!fl); $('loading').hidden = true; this.checkRot();
      $('cross').style.left = $('cross').style.top = ''; $('vign').style.background = '';
      try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
    }, 30);
  },
  endGame(){
    this.mode = null; this.running = false; this.paused = false;
    for (const id of ['hud', 'ctrls', 'noise', 'scan', 'vign']) $(id).hidden = true;
    this.setFilter(''); $('gl').style.transform = '';
    Snd.setMotor(false, 0); Snd.setStatic(0); Snd.setEngine(false, 0);
    if (!W.scene) { W.build(MAPS[0], 'menu'); FX.init(W.scene); W.spawnTargets({tank:2, truck:1, apc:1}, MAPS[0].camo); }
  },
  pause(){
    if (!this.mode) return; this.paused = true; resetSticks(); Snd.setMotor(false, 0); Snd.setStatic(0); Snd.setEngine(false, 0);
    $('scrPause').innerHTML = `<div class="wrap" style="max-width:420px;padding-top:6vh"><h2 class="res-big">Пауза</h2>
      <button class="btn primary" id="zGo">Продолжить</button><button class="btn" id="zRe">Начать заново</button><button class="btn" id="zSet">Настройки</button><button class="btn ghost" id="zOut">Выйти в меню</button></div>`;
    $('zGo').onclick = () => { this.paused = false; this.show(null); };
    $('zRe').onclick = () => this.startGame(this.lastStart.mode, this.lastStart.map);
    $('zSet').onclick = () => this.settings('scrPause');
    $('zOut').onclick = () => this.menu();
    this.show('scrPause');
  },
  showResult(r){
    this.running = false; $('hud').hidden = true; $('ctrls').hidden = true; $('noise').hidden = true; this.setFilter('');
    $('scrResult').innerHTML = `<div class="wrap" style="max-width:520px;padding-top:4vh">
      <p class="section-h">${r.win ? 'Победа' : 'Поражение'}</p><h2 class="res-big">${r.title}</h2>
      <div class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div>
      <div class="kv">${r.rows.map(x => `<span>${x[0]}</span><b>${x[1]}</b>`).join('')}</div>
      <div class="row"><button class="btn primary" id="rRe">Ещё раз</button><button class="btn" id="rMaps">Карты</button><button class="btn" id="rHangar">Ангар</button><button class="btn ghost" id="rMenu">Меню</button></div></div>`;
    $('rRe').onclick = () => this.startGame(this.lastStart.mode, this.lastStart.map);
    $('rMaps').onclick = () => { this.endGame(); this.maps(this.lastStart.mode); };
    $('rHangar').onclick = () => { this.endGame(); this.sel.tab = this.lastStart.mode === 'tank' ? 'tank' : byId(DRONES, Save.d.drone).type; this.hangar('maps'); };
    $('rMenu').onclick = () => this.menu();
    this.show('scrResult');
  },
  checkRot(){ $('rot').hidden = !(this.mode && this.running && innerHeight > innerWidth); },
  // ---------- HUD helpers ----------
  setFilter(k){
    const f = k === 'thermal' ? 'grayscale(1) contrast(1.45) brightness(1.2)' : k === 'obs' ? 'grayscale(1) contrast(1.2) brightness(1.08)' : (this.mode && this.mode !== 'tank' ? 'saturate(0.8) contrast(1.1)' : '');
    $('gl').style.filter = f; this.filter = k;
  },
  big(t, s, dur){ $('big').textContent = t; $('sub').textContent = s || ''; this.bigT = dur || 2; },
  warn(t, dur){ $('warn').textContent = t; this.warnT = dur || 1; this.warnLock = true; },
  buildMarks(list){
    const box = $('marks'); box.innerHTML = '';
    this.markEls = list.map(v => { const e = document.createElement('div'); e.className = 'mk' + (v.type === 'ew' ? ' ew' : ''); e.innerHTML = '<i></i><span></span>'; box.appendChild(e); return e; });
    this.markList = list;
  },
  buildMiniBase(){
    const c = document.createElement('canvas'); c.width = c.height = 140; const x = c.getContext('2d'), s = 140 / 1700;
    x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(0, 0, 140, 140);
    if (W.map.water) { x.fillStyle = 'rgba(60,120,170,0.55)'; x.fillRect(70 + 330 * s, 0, 140, 140); }
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1.5;
    for (const r of W.roads) { x.beginPath(); r.pts.forEach((p, i) => i ? x.lineTo(70 + p[0] * s, 70 + p[1] * s) : x.moveTo(70 + p[0] * s, 70 + p[1] * s)); x.stroke(); }
    x.fillStyle = '#7fd05a'; x.fillRect(70 - 3, 70 + 700 * s - 3, 6, 6);
    this.miniBase = c;
  },
  drawMini(px, pz, heading, list, extra){
    const c = $('mini'), x = c.getContext('2d'), s = 140 / 1700;
    x.clearRect(0, 0, 140, 140); x.drawImage(this.miniBase, 0, 0);
    for (const v of list) {
      const mx = 70 + v.x * s, my = 70 + v.z * s;
      if (v.type === 'ew' && v.alive) { x.strokeStyle = 'rgba(197,139,255,0.8)'; x.beginPath(); x.arc(mx, my, 260 * s, 0, 7); x.stroke(); }
      if (v.type === 'aa' && v.alive) { x.strokeStyle = 'rgba(255,170,60,0.6)'; x.beginPath(); x.arc(mx, my, 430 * s, 0, 7); x.stroke(); }
      x.fillStyle = v.alive ? (v.type === 'ew' ? '#c58bff' : v.type === 'aa' ? '#ffaa3c' : '#ff4d3a') : '#777';
      x.fillRect(mx - 2.5, my - 2.5, 5, 5);
    }
    if (extra) { x.fillStyle = '#ff4d3a'; for (const d of extra) if (d.alive) { x.beginPath(); x.arc(70 + d.pos.x * s, 70 + d.pos.z * s, 2, 0, 7); x.fill(); } }
    x.save(); x.translate(70 + px * s, 70 + pz * s); x.rotate(heading); x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(0, -6); x.lineTo(4, 5); x.lineTo(-4, 5); x.closePath(); x.fill(); x.restore();
  },
  updateMarks(maxD, from){
    const v3 = new THREE.Vector3(), w = innerWidth, h = innerHeight;
    this.markList.forEach((v, i) => {
      const e = this.markEls[i], d = Math.hypot(v.x - from.x, v.z - from.z);
      v3.set(v.x, v.y + v.def.h * 0.6, v.z).project(CAM);
      if (v3.z > 1 || d > maxD || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) { e.style.display = 'none'; return; }
      e.style.display = ''; e.style.left = ((v3.x + 1) / 2 * w) + 'px'; e.style.top = ((1 - v3.y) / 2 * h) + 'px';
      e.classList.toggle('dead', !v.alive);
      e.lastChild.textContent = (v.alive ? (d < 450 ? v.def.name + ' ' : '') : '✕ ') + Math.round(d) + 'м';
    });
  },
  compass(heading, bearings){
    let html = ''; const deg = heading * 180 / Math.PI, W2 = $('compass').clientWidth / 2;
    for (let a = Math.ceil((deg - 60) / 15) * 15; a <= deg + 60; a += 15) {
      const n = ((a % 360) + 360) % 360, lbl = {0:'С', 90:'В', 180:'Ю', 270:'З'}[n] || (n % 45 === 0 ? n : '·');
      html += `<span style="left:${W2 + (a - deg) / 60 * W2}px">${lbl}</span>`;
    }
    for (const b of bearings) { let r = ((b * 180 / Math.PI - deg + 540) % 360) - 180; r = clamp(r, -60, 60); html += `<span class="tg" style="left:${W2 + r / 60 * W2}px;top:10px">▼</span>`; }
    $('compass').innerHTML = html;
  },
  flightHud(F){
    this.hudT -= 1; if (this.hudT > 0) return; this.hudT = 3;
    const def = F.def, pos = F.pos || CAM.position, agl = pos.y - W.surfaceH(pos.x, pos.z), home = Math.hypot(pos.x - BASE.x, pos.z - BASE.z);
    const spd = F.vel ? F.vel.length() * 3.6 : 0, missile = def.type === 'missile';
    const volt = 6 * (3.3 + 0.9 * F.battery) - (F.thr || 0) * 0.9;
    const lq = Math.round((1 - F.noise) * 100), rssi = Math.round(40 + F.noise * 60);
    $('oTL').innerHTML = missile ? `ТОПЛИВО ${Math.max(0, F.battery * def.battery).toFixed(1)}с<br>РАКЕТА` :
      `<span class="${F.battery < 0.2 ? 'lowbat' : ''}">${volt.toFixed(1)}V ${Math.round(F.battery * 100)}%</span><br>${Math.round(F.mah)} mAh<br>${def.type === 'wing' ? 'КРЫЛО' : F.acro ? 'ACRO' : 'ANGLE'}`;
    $('oTR').innerHTML = def.fiber ? `ВОЛОКНО ${Math.round(F.cable || 0)}/${def.range}м` : def.wire ? `ПРОВОД ${Math.round(F.cable || 0)}м` : `LQ ${lq}%<br>RSSI -${rssi}dBm`;
    $('oBL').innerHTML = `ALT ${Math.round(agl)}м<br>THR ${Math.round((F.thr || 0) * 100)}%`;
    $('oBR').innerHTML = `${Math.round(spd)} км/ч`;
    $('oBC').innerHTML = `⌂ ${Math.round(home)}м · ${this.fmtT(F.t || 0)}`;
    const heading = -(F.yaw || 0);
    const alive = F.targets.filter(v => v.alive).map(v => ({v, d:Math.hypot(v.x - pos.x, v.z - pos.z)})).sort((a, b) => a.d - b.d);
    this.compass(heading, alive.slice(0, 1).map(a => Math.atan2(a.v.x - pos.x, -(a.v.z - pos.z))));
    $('oTC').innerHTML = alive.length ? `ЦЕЛЬ: ${alive[0].v.def.name} ${Math.round(alive[0].d)}м · осталось ${alive.length}<br>ВЫЛЕТ ${F.used}/${F.sorties}` : '';
    const w = [];
    if (F.ewNear > 0.15 && !def.fiber && !def.wire) w.push('РЭБ!');
    if (F.aaWarn) w.push('ЗЕНИТКА! НИЖЕ!');
    if (F.battery < 0.15) w.push(missile ? 'МАЛО ТОПЛИВА' : 'LOW BATTERY');
    if (F.noise > 0.6 && F.phase === 'fly') w.push('СЛАБЫЙ СИГНАЛ');
    if (!this.warnLock) $('warn').innerHTML = w.join('<br>');
    this.updateMarks(1100, pos);
    this.drawMini(pos.x, pos.z, heading, F.targets);
  },
  tankHud(T){
    this.hudT -= 1; if (this.hudT > 0) return; this.hudT = 2;
    const p = T.p, d = T.def;
    $('oTL').innerHTML = `БРОНЯ ${Math.max(0, Math.round(p.hp))}/${d.hp}<div class="tbar"><i style="width:${clamp(p.hp / d.hp, 0, 1) * 100}%;background:${p.hp / d.hp < 0.3 ? 'var(--danger)' : 'var(--ok)'}"></i></div>
      ПУШКА ${T.reload > 0 ? 'ЗАРЯЖАЕТСЯ' : 'ГОТОВА'}<div class="tbar"><i style="width:${(1 - T.reload / d.reload) * 100}%;background:var(--accent)"></i></div>
      РЭБ ${T.ewOn ? 'ВКЛ' : 'выкл'}<div class="tbar"><i style="width:${T.ewE / d.ew * 100}%;background:#c58bff"></i></div>`;
    const left = T.enemies.filter(v => v.alive).length;
    $('oTR').innerHTML = `ВРАГИ ${left}/${T.enemies.length}<br>ДРОНЫ СБИТО ${T.dkills}`;
    $('oBL').innerHTML = ''; $('oBR').innerHTML = `${Math.round(Math.abs(p.speed) * 3.6)} км/ч`; $('oBC').innerHTML = this.fmtT(T.time);
    const heading = Math.PI - p.ty;
    this.compass(heading, T.enemies.filter(v => v.alive).slice(0, 3).map(v => Math.atan2(v.x - p.x, -(v.z - p.z))));
    $('oTC').innerHTML = '';
    if (!this.warnLock) $('warn').innerHTML = T.nearestDrone < 250 ? `FPV-ДРОН! ${Math.round(T.nearestDrone)}м${T.ewOn ? '' : '<br>включи РЭБ или стреляй'}` : '';
    this.updateMarks(1500, p);
    if (T.aimPoint) { const a = T.aimPoint.clone().project(CAM); $('cross').style.left = ((a.x + 1) / 2 * innerWidth) + 'px'; $('cross').style.top = ((1 - a.y) / 2 * innerHeight) + 'px'; }
    this.drawMini(p.x, p.z, heading, T.enemies, T.drones);
    // direction arrows for incoming drones
    const box = $('arrows'); let html = '';
    for (const dr of T.drones) {
      if (!dr.alive) continue; const dd = Math.hypot(dr.pos.x - p.x, dr.pos.z - p.z); if (dd > 320) continue;
      const v3 = dr.pos.clone().project(CAM); if (v3.z < 1 && Math.abs(v3.x) < 0.9 && Math.abs(v3.y) < 0.9) { html += `<div class="mk" style="left:${(v3.x + 1) / 2 * innerWidth}px;top:${(1 - v3.y) / 2 * innerHeight}px"><i style="width:12px;height:12px"></i>${Math.round(dd)}м</div>`; continue; }
      const b = Math.atan2(dr.pos.x - p.x, -(dr.pos.z - p.z)) - heading;
      html += `<div class="arr" style="transform:rotate(${b}rad) translateY(-${Math.min(innerWidth, innerHeight) * 0.3}px)"></div>`;
    }
    box.innerHTML = html;
    $('vign').style.background = T.hitFlash > 0 ? `radial-gradient(ellipse at center,transparent 40%,rgba(255,40,20,${T.hitFlash}) 100%)` : '';
  },
  tankButtons(on){
    const b = $('tbtns'); b.innerHTML = ''; if (!on) return;
    const mk = (id, txt, css, cls) => { const e = document.createElement('button'); e.className = 'hbtn ' + (cls || ''); e.id = id; e.innerHTML = txt; e.style.cssText = css; b.appendChild(e); return e; };
    const R = 'env(safe-area-inset-right,0px)', B = 'env(safe-area-inset-bottom,0px)';
    const fire = mk('bFire', 'ОГОНЬ', `right:calc(${R} + 20px);bottom:calc(${B} + 96px);width:88px;height:88px;font-size:14px`, 'fire');
    const mg = mk('bMg', 'ПУЛЕ-<br>МЁТ', `right:calc(${R} + 120px);bottom:calc(${B} + 34px);width:70px;height:70px`);
    const ew = mk('bEw', 'РЭБ', `right:calc(${R} + 28px);bottom:calc(${B} + 200px);width:66px;height:66px`);
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    fire.addEventListener('pointerdown', e => { stop(e); Input.btn.fire = true; });
    mg.addEventListener('pointerdown', e => { stop(e); Input.btn.mg = true; mg.classList.add('on'); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) mg.addEventListener(ev, () => { Input.btn.mg = false; mg.classList.remove('on'); });
    ew.addEventListener('pointerdown', e => { stop(e); Input.btn.ewToggle = true; });
  },
  drawNoise(){
    const c = $('noise'); if (c.hidden) return;
    const n = clamp(this.noise, 0, 1); c.style.opacity = Math.min(0.95, n * 1.05);
    if (n < 0.03) return;
    const x = c.getContext('2d'), img = this.noiseImg || (this.noiseImg = x.createImageData(160, 90)), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    if (n > 0.3) for (let k = 0; k < 4; k++) { const row = Math.floor(Math.random() * 90), off = row * 160 * 4; for (let i = 0; i < 160 * 4; i += 4) { d[off + i] = d[off + i + 1] = d[off + i + 2] = 240; } }
    x.putImageData(img, 0, 0);
    $('gl').style.transform = n > 0.45 ? `translateX(${rnd(-1, 1) * n * 10}px)` : '';
  },
};

// ---------- touch sticks ----------
const Sticks = {act:{}};
function stickDown(e){
  if (!UI.running || UI.paused || e.target.closest('button')) return;
  const side = e.clientX < innerWidth / 2 ? 'L' : 'R';
  if (Object.values(Sticks.act).some(s => s.side === side)) return;
  Sticks.act[e.pointerId] = {side, x0:e.clientX, y0:e.clientY, base:side === 'L' && Input.L.keepY ? Input.L.y : 0};
  const el = $(side === 'L' ? 'stL' : 'stR'); el.hidden = false; el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; el.firstChild.style.transform = '';
  stickMove(e);
}
function stickMove(e){
  const s = Sticks.act[e.pointerId]; if (!s) return; e.preventDefault();
  if (e.pointerType === 'mouse' && e.buttons === 0) return stickUp(e);
  const R = 55; let dx = (e.clientX - s.x0) / R, dy = -(e.clientY - s.y0) / R;
  const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  const st = Input[s.side]; st.x = dx;
  if (s.side === 'L' && Input.L.keepY) { st.y = clamp(s.base + dy, -1, 1); } else st.y = dy;
  // small dead-zone + expo for fine control
  st.x = Math.sign(st.x) * Math.max(0, Math.abs(st.x) - 0.06) / 0.94; if (!(s.side === 'L' && Input.L.keepY)) st.y = Math.sign(st.y) * Math.max(0, Math.abs(st.y) - 0.06) / 0.94;
  $(s.side === 'L' ? 'stL' : 'stR').firstChild.style.transform = `translate(${dx * R}px,${-dy * R}px)`;
}
function stickUp(e){
  const s = Sticks.act[e.pointerId]; if (!s) return; delete Sticks.act[e.pointerId];
  const st = Input[s.side]; st.x = 0; if (!(s.side === 'L' && Input.L.keepY)) st.y = 0;
  $(s.side === 'L' ? 'stL' : 'stR').hidden = true;
}
function resetSticks(){
  Sticks.act = {}; Input.R.x = Input.R.y = 0; Input.L.x = 0; if (!Input.L.keepY) Input.L.y = 0;
  Input.btn = {}; $('stL').hidden = $('stR').hidden = true;
}
addEventListener('blur', resetSticks);
addEventListener('pointerdown', stickDown, {passive:false});
addEventListener('pointermove', stickMove, {passive:false});
addEventListener('pointerup', stickUp); addEventListener('pointercancel', stickUp);
document.addEventListener('touchmove', e => { if (UI.running) e.preventDefault(); }, {passive:false});
document.addEventListener('gesturestart', e => e.preventDefault());

// ---------- keyboard ----------
const Keys = {};
addEventListener('keydown', e => {
  Keys[e.code] = true;
  if (UI.running && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Space') Input.btn.fire = true;
  if (e.code === 'KeyE') Input.btn.ewToggle = true;
  if ((e.code === 'Escape' || e.code === 'KeyP') && UI.running) UI.paused ? (UI.paused = false, UI.show(null)) : UI.pause();
});
addEventListener('keyup', e => { Keys[e.code] = false; });
function applyKeys(dt){
  const ax = (a, b) => (Keys[b] ? 1 : 0) - (Keys[a] ? 1 : 0);
  const lx = ax('KeyA', 'KeyD'), ly = ax('KeyS', 'KeyW'), rx = ax('ArrowLeft', 'ArrowRight'), ry = ax('ArrowDown', 'ArrowUp');
  if (Sticks.kb || lx || ly || rx || ry) {
    Sticks.kb = !!(lx || ly || rx || ry);
    const sm = (cur, t) => cur + (t - cur) * Math.min(1, dt * 6);
    if (!Object.values(Sticks.act).some(s => s.side === 'L')) { Input.L.x = sm(Input.L.x, lx); if (Input.L.keepY) Input.L.y = clamp(Input.L.y + ly * dt * 0.8, -1, 1); else Input.L.y = sm(Input.L.y, ly); }
    if (!Object.values(Sticks.act).some(s => s.side === 'R')) { Input.R.x = sm(Input.R.x, rx); Input.R.y = sm(Input.R.y, ry); }
  }
  Input.btn.mg = Keys.KeyF || ($('bMg') && $('bMg').classList.contains('on'));
}

// ---------- main loop ----------
$('pauseBtn').onclick = () => UI.pause();
let last = performance.now(), menuT = 0;
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (UI.mode && UI.running && !UI.paused) {
    applyKeys(dt);
    if (UI.mode === 'tank') Tank.update(dt); else Flight.update(dt);
    if (UI.bigT > 0) { UI.bigT -= dt; if (UI.bigT <= 0) { $('big').textContent = ''; $('sub').textContent = ''; } }
    if (UI.warnT > 0) { UI.warnT -= dt; if (UI.warnT <= 0) { UI.warnLock = false; $('warn').textContent = ''; } }
    $('cross').hidden = UI.mode !== 'tank' && Flight.phase !== 'fly';
    $('hud').classList.toggle('obs', UI.mode !== 'tank' && Flight.phase === 'obs');
    UI.drawNoise();
  } else if (!UI.mode && W.scene) {
    menuT += dt; const a = menuT * 0.04;
    CAM.position.set(Math.cos(a) * 420, W.groundH(Math.cos(a) * 420, Math.sin(a) * 420 - 150) + 90, Math.sin(a) * 420 - 150);
    CAM.lookAt(0, 10, -150); if (CAM.fov !== 55) { CAM.fov = 55; CAM.updateProjectionMatrix(); }
    W.updateVehicles(dt); FX.update(dt, CAM);
  }
  if (W.scene) renderer.render(W.scene, CAM);
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => { if (document.hidden && UI.running && !UI.paused) UI.pause(); });
resize();
UI.menu();
$('loading').hidden = true;
requestAnimationFrame(loop);
