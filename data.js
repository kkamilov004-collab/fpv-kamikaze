// ===== Game data: aircraft, warheads, maps, tanks, save =====
// type: quad (FPV-квадрокоптер), wing (барражирующий боеприпас), missile (управляемая ракета)
// speed m/s, agility 0..1, battery s (игровые), payload kg, ewResist 0..1, range m (дальность связи)
const DRONES = [
  {id:'osa5', name:'Оса 5"', type:'quad', price:0, speed:44, agility:1.0, battery:110, payload:0.7, ewResist:0.05, range:900, twr:4.2,
   desc:'Лёгкая пятидюймовая гоночная рама. Очень быстрая и вёрткая, но несёт мало и быстро садит батарею.'},
  {id:'shershen7', name:'Шершень 7"', type:'quad', price:0, speed:38, agility:0.82, battery:170, payload:1.6, ewResist:0.1, range:1100, twr:3.6,
   desc:'Рабочая лошадка фронта. Хороший баланс скорости, времени полёта и веса БЧ.'},
  {id:'barr8', name:'Барракуда 8"', type:'quad', price:350, speed:36, agility:0.74, battery:200, payload:2.3, ewResist:0.2, range:1250, twr:3.3,
   desc:'Восьмидюймовый дрон с антенной на 1.2 ГГц. Дальше летит и лучше держит связь.'},
  {id:'yastreb10', name:'Ястреб 10"', type:'quad', price:800, speed:33, agility:0.62, battery:240, payload:3.6, ewResist:0.32, range:1450, twr:3.0,
   desc:'Десятидюймовая рама для тяжёлых БЧ. Медленнее разгоняется, зато пробивает почти всё.'},
  {id:'molot13', name:'Молот 13"', type:'quad', price:1400, speed:29, agility:0.48, battery:260, payload:5.2, ewResist:0.4, range:1600, twr:2.7,
   desc:'Тяжёлый носитель. Тандемная БЧ и термобар — его стихия. Инерционный, требует плавного пилотирования.'},
  {id:'prizrak', name:'Призрак (оптоволокно)', type:'quad', price:2000, speed:31, agility:0.66, battery:230, payload:2.6, ewResist:1, range:1500, twr:3.0, fiber:true,
   desc:'Управление по оптоволоконной катушке. РЭБ на него не действует, картинка без помех. Дальность ограничена длиной кабеля.'},
  {id:'krylo', name:'Крыло-К', type:'wing', price:1600, speed:50, agility:0.55, battery:420, payload:3.0, ewResist:0.35, range:2200, twr:1,
   desc:'Барражирующий боеприпас самолётного типа. Долго висит в воздухе, атакует в пикировании. Не умеет зависать.'},
  {id:'albatros', name:'Альбатрос', type:'wing', price:2600, speed:44, agility:0.42, battery:520, payload:6.0, ewResist:0.5, range:2500, twr:1,
   desc:'Тяжёлое крыло с большой БЧ. Медленно поворачивает, но удар сносит всё вокруг.'},
  {id:'kopye', name:'ПТУР «Копьё»', type:'missile', price:1100, speed:85, agility:0.6, battery:22, payload:0, ewResist:1, range:2400, warhead:'tandem', wire:true,
   desc:'Противотанковая ракета с наведением по проводу. Летит быстро, РЭБ не страшен, но топлива на 22 секунды.'},
  {id:'strela', name:'Ракета «Стрела-ТВ»', type:'missile', price:1900, speed:95, agility:0.75, battery:28, payload:0, ewResist:0.6, range:2600, warhead:'he_big',
   desc:'Ракета с телевизионной головкой и радиоканалом. Манёвренная, мощная осколочно-фугасная БЧ.'},
  {id:'grom', name:'Крылатая «Гром»', type:'missile', price:3000, speed:70, agility:0.45, battery:45, payload:0, ewResist:0.7, range:3000, warhead:'heavy',
   desc:'Тяжёлая управляемая ракета. Медленнее, зато разрушает склады и колонны одним ударом.'},
];

// dmg — урон прямым попаданием, radius — радиус поражения, armor/soft — множители по бронированным/небронированным целям
const WARHEADS = [
  {id:'heat', name:'Кумулятивная ПГ-7', weight:0.6, dmg:85, radius:4, armor:1.0, soft:0.8, desc:'Прожигает броню. Лучше бить в крышу или корму.'},
  {id:'frag', name:'Осколочная', weight:0.5, dmg:45, radius:13, armor:0.3, soft:1.6, desc:'Против грузовиков, зениток и РЭБ. Танку почти не страшна.'},
  {id:'tandem', name:'Тандемная', weight:1.4, dmg:120, radius:4.5, armor:1.15, soft:0.9, desc:'Пробивает динамическую защиту. Тяжёлая.'},
  {id:'thermo', name:'Термобарическая', weight:1.8, dmg:90, radius:11, armor:0.6, soft:1.4, desc:'Большой радиус. Сносит склады и пушки.'},
  {id:'tm62', name:'Противотанковая мина', weight:3.3, dmg:180, radius:7, armor:1.3, soft:1.2, desc:'Огромный заряд для тяжёлых дронов. Уничтожает танк с любого ракурса.'},
  {id:'he_big', name:'ОФ БЧ ракеты', weight:0, dmg:130, radius:10, armor:1.0, soft:1.4, hidden:true},
  {id:'heavy', name:'Тяжёлая БЧ', weight:0, dmg:220, radius:18, armor:1.1, soft:1.5, hidden:true},
];

// counts: tank, apc (БМП), truck, arty (САУ), aa (зенитка), ew (станция РЭБ), depot (склад)
const MAPS = [
  {id:'field', name:'Поле', desc:'Летнее поле с лесополосами. Учебная карта: ни зениток, ни РЭБ.', diff:1,
   sky:0x9fc3dd, fog:0xb7cbd6, fogD:0.0011, g1:[0.36,0.48,0.2], g2:[0.55,0.52,0.28], amp:18, trees:500, treeKind:'leaf', houses:6, city:0,
   t:{tank:2, apc:1, truck:2, arty:0, aa:0, ew:0, depot:1}, sorties:6, camo:0x4f5a35},
  {id:'forest', name:'Лес', desc:'Густой сосновый лес. Техника прячется под деревьями, летай аккуратно.', diff:2,
   sky:0x93aec2, fog:0x9fb2b6, fogD:0.0017, g1:[0.2,0.33,0.14], g2:[0.33,0.36,0.2], amp:22, trees:1500, treeKind:'pine', houses:0, city:0,
   t:{tank:2, apc:2, truck:1, arty:1, aa:0, ew:1, depot:0}, sorties:6, camo:0x3f4a2c},
  {id:'village', name:'Деревня', desc:'Село вдоль дороги. Колонна идёт через деревню, на окраине стоит зенитка.', diff:2,
   sky:0xa8c4d8, fog:0xbfcfd8, fogD:0.0012, g1:[0.38,0.47,0.22], g2:[0.5,0.45,0.27], amp:14, trees:500, treeKind:'leaf', houses:45, city:0,
   t:{tank:2, apc:2, truck:2, arty:0, aa:1, ew:0, depot:1}, sorties:6, camo:0x4f5a35},
  {id:'city', name:'Город', desc:'Многоэтажки и узкие улицы. Между домами связь пропадает — держись выше.', diff:3,
   sky:0xa9b8c4, fog:0xaab3ba, fogD:0.0015, g1:[0.42,0.42,0.4], g2:[0.36,0.38,0.33], amp:3, trees:150, treeKind:'leaf', houses:0, city:1,
   t:{tank:3, apc:2, truck:1, arty:0, aa:1, ew:1, depot:0}, sorties:7, camo:0x55584a},
  {id:'winter', name:'Зима', desc:'Заснеженные холмы. Белые танки плохо видно на снегу.', diff:3,
   sky:0xc6d3de, fog:0xdde4ea, fogD:0.0016, g1:[0.88,0.9,0.93], g2:[0.74,0.78,0.82], amp:24, trees:700, treeKind:'pine', houses:10, city:0, snow:1,
   t:{tank:3, apc:1, truck:2, arty:1, aa:1, ew:0, depot:1}, sorties:7, camo:0xc9cdc7},
  {id:'desert', name:'Пустыня', desc:'Барханы и открытое небо. Зенитки видят далеко — заходи низко.', diff:3,
   sky:0xc9d8e4, fog:0xe0d2b0, fogD:0.001, g1:[0.82,0.68,0.44], g2:[0.72,0.56,0.34], amp:20, trees:0, treeKind:'leaf', houses:8, city:0,
   t:{tank:3, apc:2, truck:2, arty:1, aa:2, ew:0, depot:1}, sorties:7, camo:0xb59a68},
  {id:'night', name:'Ночь (тепловизор)', desc:'Ночная атака через тепловизор. Горячие моторы техники светятся белым.', diff:4,
   sky:0x0b0f18, fog:0x10141c, fogD:0.0018, g1:[0.2,0.25,0.15], g2:[0.25,0.24,0.18], amp:16, trees:600, treeKind:'leaf', houses:12, city:0, night:1,
   t:{tank:3, apc:2, truck:1, arty:1, aa:1, ew:1, depot:0}, sorties:7, camo:0x4f5a35},
  {id:'industrial', name:'Промзона', desc:'Заводские цеха и склады. Мощный РЭБ прикрывает технику.', diff:4,
   sky:0x9eabb5, fog:0xa3a69e, fogD:0.0016, g1:[0.4,0.4,0.36], g2:[0.36,0.34,0.3], amp:4, trees:120, treeKind:'leaf', houses:0, city:2,
   t:{tank:3, apc:2, truck:2, arty:1, aa:1, ew:2, depot:2}, sorties:8, camo:0x55584a},
  {id:'mountains', name:'Горы', desc:'Перевал среди скал. Дорога петляет по ущелью, связь пропадает за хребтами.', diff:5,
   sky:0x8fb0cf, fog:0xaebfcc, fogD:0.0011, g1:[0.42,0.44,0.36], g2:[0.5,0.48,0.44], amp:60, trees:600, treeKind:'pine', houses:4, city:0, mountains:1,
   t:{tank:3, apc:2, truck:2, arty:2, aa:2, ew:1, depot:0}, sorties:8, camo:0x5b5a48},
  {id:'coast', name:'Побережье', desc:'Порт и пляж у моря. Береговая оборона: много зениток и две станции РЭБ.', diff:5,
   sky:0x9cc5e6, fog:0xb8d1e2, fogD:0.0012, g1:[0.4,0.5,0.24], g2:[0.85,0.78,0.58], amp:12, trees:300, treeKind:'leaf', houses:20, city:0, water:1,
   t:{tank:4, apc:2, truck:2, arty:1, aa:2, ew:2, depot:1}, sorties:8, camo:0x5a5e44},
];

const TANKS = [
  {id:'rys', name:'Рысь (лёгкий)', price:0, speed:17, turn:0.9, hp:260, reload:3.0, ew:6, desc:'Быстрый лёгкий танк. Мало брони, зато уходит от снарядов.'},
  {id:'medved', name:'Медведь (средний)', price:900, speed:13, turn:0.7, hp:420, reload:3.8, ew:9, desc:'Основной боевой танк. Решётки от дронов и мощный РЭБ.'},
  {id:'mamont', name:'Мамонт (тяжёлый)', price:2200, speed:10, turn:0.5, hp:650, reload:4.8, ew:12, desc:'Тяжёлая броня и 125-мм пушка. Медленный, но держит удар.'},
];

const VEH = {
  tank:{name:'Танк', hp:100, armored:1, r:3.4, h:2.6, speed:4, reward:120},
  apc:{name:'БМП', hp:70, armored:1, r:3.2, h:2.4, speed:6.5, reward:90},
  truck:{name:'Грузовик', hp:35, armored:0, r:3.2, h:2.8, speed:8, reward:60},
  arty:{name:'САУ', hp:85, armored:1, r:3.6, h:2.8, speed:0, reward:110},
  aa:{name:'Зенитка', hp:45, armored:0, r:2.6, h:2.4, speed:0, reward:100},
  ew:{name:'Станция РЭБ', hp:40, armored:0, r:2.6, h:8, speed:0, reward:100},
  depot:{name:'Склад БК', hp:60, armored:0, r:5, h:3, speed:0, reward:80},
};

const Save = {
  d:{coins:300, owned:['osa5','shershen7'], tanks:['rys'], drone:'shershen7', warhead:'heat', tank:'rys', stars:{}, tstars:{},
     mode:'acro', sens:1, invert:false, sound:true, acroV2:true},
  load(){
    try{ const s = JSON.parse(localStorage.getItem('fpvk_save_v1')||'null'); if(s) Object.assign(this.d, s); }catch(e){}
    if (!this.d.acroV2) { this.d.mode = 'acro'; this.d.acroV2 = true; } // real FPV flight is now the default
  },
  save(){ try{ localStorage.setItem('fpvk_save_v1', JSON.stringify(this.d)); }catch(e){} },
};
Save.load();

const byId = (arr, id) => arr.find(x => x.id === id);
const $ = id => document.getElementById(id);
const G = 9.81;
// shared input state, filled by ui.js (touch sticks + keyboard)
const Input = {L:{x:0, y:0, keepY:false}, R:{x:0, y:0}, btn:{}};
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
