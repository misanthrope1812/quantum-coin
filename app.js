(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const holder = $('coinHolder'), coinCanvas = $('coinCanvas');
  const result = $('result'), hashEl = $('hash');
  const sourceTag = $('sourceTag'), sourceDot = $('sourceDot'), sourceLabel = $('sourceLabel');
  const hint = $('hint'), historyEl = $('history'), ratioEl = $('ratio');
  const cO = $('cO'), cR = $('cR'), cN = $('cN'), resetBtn = $('resetBtn');
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // localStorage может быть недоступен (приватный режим) — тогда просто работаем без памяти
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* нет места или запрещено */ } }
  };

  /* ================= Квантовая энтропия =================
     ANU QRNG измеряет квантовые флуктуации вакуума и отдаёт случайные байты.
     Бесплатный API пускает не чаще 1 запроса в минуту, поэтому берём сразу 1024 байта
     про запас и тратим по одному на бросок. Нет запаса и сети — честный крипто-ГСЧ браузера. */
  const QRNG_URL = 'https://qrng.anu.edu.au/API/jsonI.php?length=1024&type=uint8';
  const QRNG_COOLDOWN = 61000;
  let pool = store.get('qc.pool', []);
  let lastFetch = store.get('qc.lastFetch', 0);
  let refilling = null;
  if (!Array.isArray(pool)) pool = [];

  function refill() {
    if (refilling) return refilling;
    if (Date.now() - lastFetch < QRNG_COOLDOWN || navigator.onLine === false) return Promise.resolve(false);
    lastFetch = Date.now();
    store.set('qc.lastFetch', lastFetch);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    refilling = fetch(QRNG_URL, { signal: ctrl.signal, cache: 'no-store' })
      .then(res => { if (!res.ok) throw new Error('bad response'); return res.json(); })
      .then(data => {
        if (!(data && data.success && Array.isArray(data.data))) throw new Error('malformed');
        const bytes = data.data.filter(b => Number.isInteger(b) && b >= 0 && b < 256);
        if (!bytes.length) throw new Error('empty');
        pool = pool.concat(bytes);
        store.set('qc.pool', pool);
        return true;
      })
      .catch(() => false) // лимит API отвечает текстом, а не JSON — тоже сюда
      .finally(() => { clearTimeout(timer); refilling = null; });
    return refilling;
  }

  async function getQuantumByte() {
    if (!pool.length) {
      // ждём сеть не дольше 2.5 с; запрос продолжит идти и пополнит запас на следующий бросок
      await Promise.race([refill(), new Promise(r => setTimeout(r, 2500))]);
    }
    if (pool.length) {
      const byte = pool.shift();
      store.set('qc.pool', pool);
      if (pool.length < 64) refill();
      return { byte, source: 'live' };
    }
    const arr = new Uint8Array(1);
    crypto.getRandomValues(arr);
    return { byte: arr[0], source: 'local' };
  }

  /* ================= Монета =================
     Рисуется на одном <canvas>, а не стопкой CSS-3D слоёв: iPhone растрировал эти слои заново
     при каждом повороте и масштабе, и бросок превращался в слайд-шоу.
     Монета вращается вокруг горизонтальной оси, поэтому хватает плоской проекции:
     грань — круг, сжатый по вертикали на |cos|, гурт — полоса между эллипсами двух граней.
     Всё тяжёлое (грани под нужный размер, тень, блик, насечка гурта) рисуется заранее в спрайты,
     а в кадре остаётся пять drawImage. */
  const cctx = coinCanvas.getContext('2d');
  const faceImg = { heads: new Image(), tails: new Image() };
  let sprites = null;
  let cw = 0, ch = 0, cdpr = 1;   // размер холста монеты в CSS-пикселях и его плотность

  Object.keys(faceImg).forEach(k => {
    faceImg[k].onload = buildSprites;
    faceImg[k].src = 'img/' + k + '.webp';
  });

  const sprite = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  };

  function buildSprites() {
    const S = sizePx;
    if (!S || !Object.values(faceImg).every(i => i.complete && i.naturalWidth)) return;
    // грани — с запасом на подъём (в полёте монета крупнее в 1.36 раза)
    const fpx = S * 1.2 * cdpr;
    const face = {};
    for (const k in faceImg) {
      face[k] = sprite(fpx, fpx);
      const g = face[k].getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(faceImg[k], 0, 0, fpx, fpx);
    }

    // блик: косая светлая полоса внутри круга (как linear-gradient 165deg)
    const sheen = sprite(fpx, fpx), sg = sheen.getContext('2d');
    const dx = Math.sin(165 * Math.PI / 180), dy = -Math.cos(165 * Math.PI / 180), half = fpx * (Math.abs(dx) + Math.abs(dy)) / 2;
    const lg = sg.createLinearGradient(fpx / 2 - dx * half, fpx / 2 - dy * half, fpx / 2 + dx * half, fpx / 2 + dy * half);
    lg.addColorStop(0.28, 'rgba(255,250,232,0)');
    lg.addColorStop(0.47, 'rgba(255,250,232,.6)');
    lg.addColorStop(0.64, 'rgba(255,250,232,0)');
    sg.beginPath(); sg.arc(fpx / 2, fpx / 2, fpx / 2, 0, Math.PI * 2); sg.fillStyle = lg; sg.fill();

    // тень: мягкое пятно из градиента
    const spx = S * 0.98 * cdpr, shadow = sprite(spx, spx), shg = shadow.getContext('2d');
    const rg = shg.createRadialGradient(spx / 2, spx / 2, 0, spx / 2, spx / 2, spx / 2);
    rg.addColorStop(0, 'rgba(0,0,0,.78)');
    rg.addColorStop(0.45, 'rgba(0,0,0,.45)');
    rg.addColorStop(0.78, 'rgba(0,0,0,.14)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    shg.fillStyle = rg; shg.fillRect(0, 0, spx, spx);

    // гурт: насечка 1.4px тёмная / 1.4px светлая, сверху объём — темнее к краям, блик посередине
    const epx = S * 1.36 * cdpr, edge = sprite(epx, 4), eg = edge.getContext('2d');
    const step = 1.4 * cdpr * (epx / (S * cdpr));
    for (let x = 0; x < epx; x += step * 2) {
      eg.fillStyle = '#7a5418'; eg.fillRect(x, 0, step, 4);
      eg.fillStyle = '#d6a743'; eg.fillRect(x + step, 0, step, 4);
    }
    const vg = eg.createLinearGradient(0, 0, epx, 0);
    vg.addColorStop(0, 'rgba(0,0,0,.6)'); vg.addColorStop(0.26, 'rgba(0,0,0,0)');
    vg.addColorStop(0.5, 'rgba(255,240,200,.38)');
    vg.addColorStop(0.74, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
    eg.fillStyle = vg; eg.fillRect(0, 0, epx, 4);

    sprites = { face, sheen, shadow, edge };
  }

  function layoutCoin() {
    sizePx = holder.offsetWidth;
    // плотность 2 хватает и на iPhone с ретиной 3x: монета в движении, а пикселей втрое меньше
    cdpr = Math.min(2, window.devicePixelRatio || 1);
    cw = coinCanvas.offsetWidth; ch = coinCanvas.offsetHeight;
    coinCanvas.width = Math.round(cw * cdpr);
    coinCanvas.height = Math.round(ch * cdpr);
    cctx.setTransform(cdpr, 0, 0, cdpr, 0, 0);
    buildSprites();
  }

  const OMEGA = 1280;   // скорость вращения в воздухе, °/с
  const MIN_AIR = 650;  // минимум полёта до начала приземления, мс
  let angle = 0, lift = 0, tilt = 0, sizePx = holder.offsetWidth;
  let toss = null;

  const easeOut3 = u => 1 - Math.pow(1 - u, 3);

  function startToss() {
    toss = {
      phase: 'rise', t0: performance.now(), a0: angle, result: null,
      wob: (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10)
    };
    return new Promise(res => { toss.done = res; });
  }

  function step(now) {
    if (toss) {
      const el = now - toss.t0;
      if (toss.phase === 'rise') {
        angle = toss.a0 + OMEGA * el / 1000;
        lift = easeOut3(Math.min(1, el / 520));
        if (toss.result && el >= MIN_AIR) {
          // ближайший угол, на котором сверху окажется нужная грань, но не меньше чем через ~пол-оборота
          const want = toss.result === 'heads' ? 0 : 180;
          const target = want + 360 * Math.ceil((angle + 300 - want) / 360);
          toss.phase = 'fall';
          toss.f0 = now; toss.fa = angle; toss.delta = target - angle; toss.fl = lift;
          // длительность подобрана так, чтобы скорость не прыгала при переходе к торможению
          toss.T = Math.min(1300, Math.max(750, 3 * toss.delta / OMEGA * 1000));
        }
      }
      if (toss.phase === 'fall') {
        const u = Math.min(1, (now - toss.f0) / toss.T), hit = 0.7;
        angle = toss.fa + toss.delta * easeOut3(u);
        lift = u < hit ? toss.fl * (1 - Math.pow(u / hit, 2)) : 0.06 * Math.sin(Math.PI * (u - hit) / (1 - hit));
        if (u >= hit && !toss.thud) { toss.thud = true; sfx.play('land', 0.9); if (navigator.vibrate) navigator.vibrate(8); }
        if (u >= 1) {
          angle = toss.result === 'heads' ? 0 : 180;
          lift = 0;
          const done = toss.done;
          toss = null;
          done();
        }
      }
      tilt = toss ? toss.wob * lift : 0;
    }
    render(now / 1000);
    requestAnimationFrame(step);
  }

  function render(t) {
    const idle = !toss && !reduceMotion;
    const ax = angle + (idle ? 4 * Math.sin(t * 1.1) : 0);
    const ay = tilt + (idle ? 5 * Math.sin(t * 0.7) : 0);
    const g = cctx;
    g.clearRect(0, 0, cw, ch);
    if (!sprites) return;

    const S = sizePx, s = 1 + 0.36 * lift;
    const rad = ax * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad), ac = Math.abs(c);
    const sx = Math.cos(ay * Math.PI / 180);   // наклон вбок лишь сужает монету
    const cx = cw / 2, cy = ch / 2 - lift * S * 0.22;
    const R = S / 2 * s;

    // тень на «столе»: в полёте меньше, бледнее и сдвинута; плоская, когда монета стоит на ребре
    const k = 1 - 0.4 * lift, sd = S * 0.98;
    const shW = sd * k, shH = sd * k * (0.12 + 0.88 * ac);
    g.globalAlpha = 0.9 - 0.5 * lift;
    g.drawImage(sprites.shadow, cw / 2 + lift * S * 0.06 - shW / 2, ch / 2 + S * (0.07 + lift * 0.3) - shH / 2, shW, shH);

    // гурт: две грани смещены на полтолщины по нормали, между ними — полоса с насечкой
    const e = S * 0.036 * s * sn, rx = R * 0.99 * sx, ry = R * 0.99 * ac;
    if (Math.abs(e) > 0.2) {
      g.globalAlpha = 1;
      g.save();
      g.beginPath();
      g.ellipse(cx, cy - e, rx, ry, 0, 0, Math.PI * 2);
      g.ellipse(cx, cy + e, rx, ry, 0, 0, Math.PI * 2);
      g.rect(cx - rx, cy - Math.abs(e), rx * 2, Math.abs(e) * 2);
      g.clip();
      g.drawImage(sprites.edge, cx - rx, cy - Math.abs(e) - ry, rx * 2, (Math.abs(e) + ry) * 2);
      g.restore();
    }

    // видимая грань: орёл, пока нормаль смотрит на нас, иначе решка (она развёрнута, поэтому не вверх ногами)
    if (ac > 0.002) {
      const side = c >= 0 ? 'heads' : 'tails';
      const fy = c >= 0 ? cy - e : cy + e;
      g.save();
      g.translate(cx, fy);
      g.scale(sx, ac);
      g.globalAlpha = 1;
      g.drawImage(sprites.face[side], -R, -R, R * 2, R * 2);
      const glint = (side === 'heads' ? Math.max(0, sn) : Math.max(0, -sn)) * 0.9 + (idle ? 0.12 + 0.1 * Math.sin(t * 0.8) : 0);
      if (glint > 0.01) { g.globalAlpha = Math.min(1, glint); g.drawImage(sprites.sheen, -R, -R, R * 2, R * 2); }
      const shade = (1 - ac) * 0.6;
      if (shade > 0.01) {
        g.globalAlpha = shade;
        g.fillStyle = '#140d03';
        g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
    g.globalAlpha = 1;
  }

  /* ================= Статистика ================= */
  let stats = store.get('qc.stats', null);
  if (!stats || !Array.isArray(stats.history)) stats = { o: 0, r: 0, n: 0, history: [] };

  function renderHistory(animateLast) {
    historyEl.innerHTML = '';
    const items = stats.history.slice(-24);
    items.forEach((h, i) => {
      const d = document.createElement('div');
      d.className = 'chip ' + (h === 'o' ? 'o' : 'r') + (animateLast && i === items.length - 1 ? ' new' : '');
      d.textContent = h === 'o' ? 'О' : 'Р';
      historyEl.appendChild(d);
    });
  }

  function renderStats(animateLast) {
    cO.textContent = stats.o;
    cR.textContent = stats.r;
    cN.textContent = stats.n;
    ratioEl.style.width = (stats.n ? stats.o / stats.n * 100 : 50) + '%';
    renderHistory(animateLast);
  }

  function setSourceTag(source) {
    sourceTag.classList.add('show');
    sourceDot.className = 'dot ' + (source === 'live' ? 'live' : 'local');
    sourceLabel.textContent = source === 'live'
      ? 'ANU QRNG · аппаратный квант'
      : 'CSPRNG · локальный крипто-ГСЧ';
  }

  function hideReadout() {
    result.classList.remove('show');
    hashEl.classList.remove('show');
    sourceTag.classList.remove('show');
  }

  /* ================= Звук =================
     Щелчок при подбросе и стук о стол при приземлении (звуки с Pixabay, см. README).
     Web Audio, а не <audio>: на iOS только он играет без задержки. Буферы декодируются сразу,
     а сам контекст браузер разрешает запустить только из касания — это делает resume() в flip(). */
  const sfx = {
    ctx: null, buf: {},
    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      ['flick', 'land'].forEach(name => fetch('sounds/' + name + '.mp3')
        .then(res => res.arrayBuffer())
        // старый Safari умеет decodeAudioData только с колбэками
        .then(data => new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail)))
        .then(b => { this.buf[name] = b; })
        .catch(() => { /* без звука — не беда */ }));
    },
    resume() {
      // на iOS контекст ещё и «interrupted» после сворачивания приложения
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    },
    play(name, volume) {
      const b = this.buf[name];
      if (!this.ctx || !b) return;
      const src = this.ctx.createBufferSource(), gain = this.ctx.createGain();
      src.buffer = b;
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(this.ctx.destination);
      src.start();
    }
  };
  sfx.init();

  /* ================= Бросок ================= */
  let busy = false;

  async function flip() {
    if (busy) return;
    busy = true;
    sfx.resume();
    sfx.play('flick', 0.8);
    hint.textContent = '';
    hideReadout();

    const landed = startToss();
    const qbit = await getQuantumByte();
    const isHeads = (qbit.byte % 2) === 0;
    // результат задаётся до приземления — монета не может лечь не той стороной
    toss.result = isHeads ? 'heads' : 'tails';
    await landed;

    result.textContent = isHeads ? 'ОРЁЛ' : 'РЕШКА';
    result.classList.toggle('r', !isHeads);
    result.classList.add('show');
    hashEl.textContent = 'энтропийный байт: 0x' + qbit.byte.toString(16).padStart(2, '0').toUpperCase();
    hashEl.classList.add('show');
    setSourceTag(qbit.source);

    stats.n++;
    if (isHeads) { stats.o++; stats.history.push('o'); } else { stats.r++; stats.history.push('r'); }
    stats.history = stats.history.slice(-60);
    store.set('qc.stats', stats);
    renderStats(true);
    hint.textContent = 'Коснитесь ещё раз';
    busy = false;
  }

  holder.addEventListener('click', flip);
  holder.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
  });
  resetBtn.addEventListener('click', e => {
    e.stopPropagation();
    stats = { o: 0, r: 0, n: 0, history: [] };
    store.set('qc.stats', stats);
    renderStats(false);
    hideReadout();
    hint.textContent = 'Коснитесь монеты, чтобы подбросить';
  });
  // на iOS долгое нажатие не должно открывать меню или выделение
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('selectstart', e => e.preventDefault());

  renderStats(false);
  if (pool.length < 64) refill();
  requestAnimationFrame(step);

  /* ================= Золотая пыль ================= */
  const canvas = $('particles');
  const ctx = canvas.getContext('2d');
  let particles = [];
  function resize() {
    // пылинки размыты и полупрозрачны — чёткость ретины им не нужна, а полноэкранный холст
    // в 4 раза меньше по пикселям заметно разгружает телефон
    const dpr = 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutCoin();
  }
  function initParticles() {
    particles = Array.from({ length: reduceMotion ? 0 : 30 }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      r: Math.random() * 1.5 + 0.4,
      vx: (Math.random() - 0.5) * 0.08,
      vy: -(Math.random() * 0.12 + 0.03),
      ph: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.7 ? '233,196,106' : '200,210,222',
      a: Math.random() * 0.45 + 0.15
    }));
  }
  function tick(now) {
    // во время броска пыль замирает: все силы — монете
    if (toss) { requestAnimationFrame(tick); return; }
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = innerWidth; if (p.x > innerWidth) p.x = 0;
      if (p.y < 0) p.y = innerHeight; if (p.y > innerHeight) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.hue},${(p.a * (0.6 + 0.4 * Math.sin(now / 900 + p.ph))).toFixed(3)})`;
      ctx.fill();
    });
    if (particles.length) requestAnimationFrame(tick);
  }
  resize(); initParticles(); requestAnimationFrame(tick);
  window.addEventListener('resize', () => { resize(); initParticles(); });

  /* ================= PWA ================= */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
    // пришла новая версия — сразу перезагружаемся в неё (но не при самой первой установке)
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded && !busy) { reloaded = true; location.reload(); }
    });
  }
})();
