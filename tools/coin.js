/* Quantum Coin — грани монеты в SVG.
   Рельеф (орёл, надписи, цифры) рисуется трижды: тень, блик и основной слой.
   Так получается эффект чеканки без тяжёлых SVG-фильтров, что важно для телефона. */
(function (global) {
  'use strict';

  let seq = 0;
  const r2 = n => Math.round(n * 100) / 100;
  const pt = (x, y) => r2(x) + ',' + r2(y);
  const FONT = "Cinzel, 'Trajan Pro', 'Times New Roman', serif";

  // Перо: от корня (x, y) под углом deg (0° — вправо, ось y вниз), длина len, полуширина w
  function feather(x, y, deg, len, w, mirror) {
    const a = deg * Math.PI / 180;
    const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    const tx = x + dx * len, ty = y + dy * len, m = len * 0.35;
    let P = [
      [x, y],
      [x + dx * m + nx * w, y + dy * m + ny * w],
      [tx + nx * w * 0.9, ty + ny * w * 0.9],
      [tx, ty],
      [tx - nx * w * 0.9, ty - ny * w * 0.9],
      [x + dx * m - nx * w, y + dy * m - ny * w]
    ];
    if (mirror) P = P.map(([px, py]) => [200 - px, py]);
    return `<path d="M${pt(...P[0])}C${pt(...P[1])} ${pt(...P[2])} ${pt(...P[3])}C${pt(...P[4])} ${pt(...P[5])} ${pt(...P[0])}Z"/>`;
  }

  function wing(mirror) {
    let s = '';
    const N = 10;
    // маховые перья: сверху вниз, чтобы нижние ложились поверх
    for (let k = N - 1; k >= 0; k--) {
      const u = k / (N - 1);
      s += feather(80 + u * 11, 101 - u * 16, 196 + u * 66, 40 + Math.sin(u * Math.PI) * 14 + u * 3, 3.9 + u * 0.6, mirror);
    }
    // кроющие перья — второй, короткий ряд
    for (let k = N - 2; k >= 0; k--) {
      const u = (k + 0.5) / (N - 1);
      s += feather(85 + u * 8, 100 - u * 13, 200 + u * 58, 20 + Math.sin(u * Math.PI) * 6, 3.6, mirror);
    }
    s += mirror
      ? '<path d="M107,85C120,80 126,94 119,104C113,109 106,104 104,96Z"/>'
      : '<path d="M93,85C80,80 74,94 81,104C87,109 94,104 96,96Z"/>';
    return s;
  }

  function tail() {
    let s = '';
    [62, 118, 74, 106, 90].forEach(deg => {
      s += feather(100, 121, deg, 27 - Math.abs(deg - 90) * 0.12, 3.6);
    });
    return s;
  }

  function star(cx, cy, R) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? R * 0.42 : R, a = -Math.PI / 2 + i * Math.PI / 5;
      d += (i ? 'L' : 'M') + pt(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    return `<path d="${d}Z"/>`;
  }

  // Зубчатый бортик по внутреннему краю гурта
  function denticles() {
    let d = '';
    const N = 96, r1 = 86.4, r3 = 90.8;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = a0 + (Math.PI * 2 / N) * 0.56;
      d += 'M' + pt(100 + r1 * Math.cos(a0), 100 + r1 * Math.sin(a0)) +
        'L' + pt(100 + r3 * Math.cos(a0), 100 + r3 * Math.sin(a0)) +
        'L' + pt(100 + r3 * Math.cos(a1), 100 + r3 * Math.sin(a1)) +
        'L' + pt(100 + r1 * Math.cos(a1), 100 + r1 * Math.sin(a1)) + 'Z';
    }
    return `<path d="${d}"/>`;
  }

  const legend = (href, text, size, spacing) =>
    `<text font-family="${FONT}" font-weight="700" font-size="${size}" letter-spacing="${spacing}" text-anchor="middle"><textPath href="#${href}" startOffset="50%">${text}</textPath></text>`;

  function eagle() {
    return wing(false) + wing(true) + tail() +
      // лапы
      '<path d="M93,117L87,131L84,135L89,134L91,137L93,133L97,121Z"/>' +
      '<path d="M107,117L113,131L116,135L111,134L109,137L107,133L103,121Z"/>' +
      // тело, шея, голова, клюв
      '<path d="M93,88C87,99 88,116 92,126C96,132 104,132 108,126C112,116 113,99 107,88C104,85 96,85 93,88Z"/>' +
      '<path d="M94.5,77C94.5,83 93,87 91.5,91L108.5,91C107,87 105.5,83 105.5,77Z"/>' +
      '<path d="M93.5,71C94,65.5 98,63 101.5,63.2C106,63.5 108,67.5 107.4,72.5C107,76 105,78.5 101,79C97,79.4 94,76.5 93.5,71Z"/>' +
      '<path d="M95,68.4C90,67.2 84.5,68.6 81.2,72.8C80.3,74 80.6,76.4 82,77.4C82.6,75.6 84,74.6 86,74.8C88.8,76 91.6,76.6 95,75.6Z"/>' +
      '<path fill="none" d="M95.5,68.2Q98.8,66.6 102.6,67.4"/>' +
      // перья на груди
      '<path fill="none" d="M94,98Q100,102 106,98M93,105Q100,109 107,105M93,112Q100,116 107,112M94.5,119Q100,123 105.5,119"/>';
  }

  function face(kind) {
    const id = 'qc' + (++seq);
    const isHeads = kind === 'heads';
    const art = isHeads
      ? eagle() +
        legend(id + '-top', 'UNITED STATES OF AMERICA', 10.2, 1.25) +
        legend(id + '-bot', 'ONE DOLLAR', 11, 3.2) +
        star(20.5, 100, 4.2) + star(179.5, 100, 4.2)
      : legend(id + '-top', 'LIBERTY', 12.5, 5) +
        legend(id + '-bot', 'IN GOD WE TRUST', 10.5, 2.2) +
        `<text x="101" y="124" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="76" letter-spacing="-3">1$</text>` +
        `<text x="100" y="152" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="9.5" letter-spacing="2.6">1971</text>` +
        '<path fill="none" stroke-width="1" d="M66,148.6H85M115,148.6H134"/>' +
        star(20.5, 100, 4.2) + star(179.5, 100, 4.2);
    const eye = isHeads ? '<circle cx="97.6" cy="70" r="1.3" fill="#4a3209"/>' : '';

    return `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${id}-field" cx="36%" cy="30%" r="82%">
      <stop offset="0" stop-color="#FFF0C4"/><stop offset=".32" stop-color="#EBC461"/>
      <stop offset=".72" stop-color="#B98B2E"/><stop offset="1" stop-color="#7E5918"/>
    </radialGradient>
    <radialGradient id="${id}-lathe" cx="50%" cy="50%" r="1.6%" spreadMethod="repeat">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFF3CC"/><stop offset=".42" stop-color="#DDAE45"/>
      <stop offset=".8" stop-color="#8E651D"/><stop offset="1" stop-color="#5E420F"/>
    </linearGradient>
    <linearGradient id="${id}-bevel" x1="1" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#FFE9A8"/><stop offset=".5" stop-color="#C7962F"/><stop offset="1" stop-color="#6B4B12"/>
    </linearGradient>
    <linearGradient id="${id}-relief" x1="0" y1="0" x2=".7" y2="1">
      <stop offset="0" stop-color="#FFF7DC"/><stop offset=".45" stop-color="#F1CC6C"/><stop offset="1" stop-color="#B4842A"/>
    </linearGradient>
    <path id="${id}-top" d="M26,100A74,74 0 0 1 174,100"/>
    <path id="${id}-bot" d="M18,100A82,82 0 0 0 182,100"/>
    <g id="${id}-art">${art}</g>
    <g id="${id}-dent">${denticles()}</g>
  </defs>
  <circle cx="100" cy="100" r="99.6" fill="url(#${id}-rim)"/>
  <circle cx="100" cy="100" r="93" fill="url(#${id}-bevel)"/>
  <circle cx="100" cy="100" r="91.2" fill="url(#${id}-field)"/>
  <circle cx="100" cy="100" r="91.2" fill="url(#${id}-lathe)"/>
  <use href="#${id}-dent" transform="translate(.5 .6)" fill="#4d3409" opacity=".5"/>
  <use href="#${id}-dent" fill="url(#${id}-relief)"/>
  <use href="#${id}-art" transform="translate(.9 1.1)" fill="#4d3409" stroke="#4d3409" stroke-width=".7" opacity=".55"/>
  <use href="#${id}-art" transform="translate(-.6 -.7)" fill="#FFF7DA" stroke="#FFF7DA" stroke-width=".7" opacity=".7"/>
  <use href="#${id}-art" fill="url(#${id}-relief)" stroke="#8A621E" stroke-width=".55"/>
  ${eye}
  <circle cx="100" cy="100" r="99.6" fill="none" stroke="#4f370c" stroke-width=".9"/>
</svg>`;
  }

  global.QuantumCoin = { face };
})(window);
