(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const holder = $('coinHolder'), coin = $('coin'), shadowEl = $('coinShadow');
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

  /* ================= Монета ================= */
  const faces = { heads: coin.querySelector('.face.heads'), tails: coin.querySelector('.face.tails') };
  faces.heads.insertAdjacentHTML('afterbegin', QuantumCoin.face('heads'));
  faces.tails.insertAdjacentHTML('afterbegin', QuantumCoin.face('tails'));
  const sheen = { heads: faces.heads.querySelector('.sheen'), tails: faces.tails.querySelector('.sheen') };
  const shade = { heads: faces.heads.querySelector('.shade'), tails: faces.tails.querySelector('.shade') };

  // Гурт: стопка тонких дисков между гранями даёт толщину и насечку при взгляде с ребра
  const EDGE_LAYERS = 14;
  for (let i = 0; i < EDGE_LAYERS; i++) {
    const e = document.createElement('div');
    e.className = 'edge';
    e.style.transform = `translateZ(calc(var(--thick) * ${((i + 0.5) / EDGE_LAYERS - 0.5).toFixed(3)}))`;
    coin.insertBefore(e, coin.firstChild);
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
        if (u >= hit && !toss.thud) { toss.thud = true; if (navigator.vibrate) navigator.vibrate(8); }
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
    const s = 1 + 0.36 * lift;
    coin.style.transform =
      `translate3d(0,${(-lift * sizePx * 0.22).toFixed(2)}px,0) scale(${s.toFixed(4)}) rotateX(${ax.toFixed(2)}deg) rotateY(${ay.toFixed(2)}deg)`;

    const rad = ax * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad);
    const k = 1 - 0.4 * lift;
    shadowEl.style.transform =
      `translate3d(${(lift * sizePx * 0.06).toFixed(1)}px,${(sizePx * (0.07 + lift * 0.3)).toFixed(1)}px,0) scale(${k.toFixed(3)},${(k * (0.12 + 0.88 * Math.abs(c))).toFixed(3)})`;
    shadowEl.style.opacity = (0.9 - 0.5 * lift).toFixed(3);

    const sh = ((1 - Math.abs(c)) * 0.6).toFixed(3);
    shade.heads.style.opacity = sh;
    shade.tails.style.opacity = sh;
    sheen.heads.style.opacity = (Math.max(0, sn) * 0.9 + (idle ? 0.12 + 0.1 * Math.sin(t * 0.8) : 0)).toFixed(3);
    sheen.tails.style.opacity = (Math.max(0, -sn) * 0.9 + (idle ? 0.12 + 0.1 * Math.sin(t * 0.8) : 0)).toFixed(3);
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

  /* ================= Бросок ================= */
  let busy = false;

  async function flip() {
    if (busy) return;
    busy = true;
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizePx = holder.offsetWidth;
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
  }
})();
