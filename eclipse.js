/* The eclipse, drawn in warm light. Builds two SVGs: the small one for the corner, the large one for the open eclipse. */
(function () {
  function rng(seed) { var s = seed; return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
  function f2(n) { return n.toFixed(2); }
  function arc(cx, cy, r, a0, a1) { return 'M' + f2(cx + r * Math.cos(a0)) + ' ' + f2(cy + r * Math.sin(a0)) + ' A' + r + ' ' + r + ' 0 0 1 ' + f2(cx + r * Math.cos(a1)) + ' ' + f2(cy + r * Math.sin(a1)); }
  var C = 150, SUN = 225 * Math.PI / 180, EQ = 0.35;
  function sunGroup(scale, bold) {
    var a = SUN, bx = C + 63.4 * Math.cos(a), by = C + 63.4 * Math.sin(a), out = '';
    [0, 45, 90, 135].forEach(function (q, i) {
      var qa = (q + 225) * Math.PI / 180, l = (i % 2 ? 6 : 12) * scale;
      out += '<line x1="' + f2(bx - l * Math.cos(qa)) + '" y1="' + f2(by - l * Math.sin(qa)) + '" x2="' + f2(bx + l * Math.cos(qa)) + '" y2="' + f2(by + l * Math.sin(qa)) + '" stroke="#FFFBF0" stroke-width="' + (bold ? 5 : (i % 2 ? 0.6 : 0.9)) + '" stroke-linecap="round" opacity=".92"/>';
    });
    if (!bold) { out += '<circle class="e-bead-ring" cx="' + f2(bx) + '" cy="' + f2(by) + '" r="6.4" fill="none" stroke="#F6D58A" stroke-width=".8" opacity=".7"/>'; }
    out += '<circle cx="' + f2(bx) + '" cy="' + f2(by) + '" r="' + (bold ? 12 : 3.2) + '" fill="#FFFEF8"/>';
    return out;
  }
  function rimGroup(bold) {
    var a = SUN, out = '<path d="' + arc(C, C, 63.6, a - 0.9, a + 0.9) + '" fill="none" stroke="#FFF8EA" stroke-width="' + (bold ? 8 : 2.2) + '" stroke-linecap="round" opacity=".82"/>';
    [[0.3, 0.22], [0.17, 0.48], [0.07, 0.85]].forEach(function (sp) { out += '<path d="' + arc(C, C, 62.9, a - sp[0], a + sp[0]) + '" fill="none" stroke="#FF6E57" stroke-width="' + (bold ? 7 : 1.6) + '" stroke-linecap="round" opacity="' + sp[1] + '"/>'; });
    return out;
  }
  // the small eclipse in the corner: kept exactly as it was approved
  function small() {
    var r = rng(7), out = '';
    for (var i = 0; i < 150; i++) {
      var a = (i / 150) * Math.PI * 2 + (r() - 0.5) * 0.04, eq = Math.pow(Math.abs(Math.cos(a - EQ)), 3);
      var L = (2 + Math.pow(r(), 2.2) * 9 + eq * Math.pow(r(), 1.6) * 15) * 2.4, w = (0.35 + r() * 0.6) * 2.6, d = w / 126.4, r0 = 63.2;
      var op = 0.22 + r() * 0.36 + eq * 0.16;
      out += '<path class="fl" style="--fd:' + f2(2.2 + r() * 3.5) + 's;--fo:' + f2(-r() * 5) + 's" d="M' + f2(C + r0 * Math.cos(a - d)) + ' ' + f2(C + r0 * Math.sin(a - d)) + ' L' + f2(C + (r0 + L) * Math.cos(a)) + ' ' + f2(C + (r0 + L) * Math.sin(a)) + ' L' + f2(C + r0 * Math.cos(a + d)) + ' ' + f2(C + r0 * Math.sin(a + d)) + 'Z" fill="#FFF1D6" fill-opacity="' + f2(op) + '"/>';
    }
    return '<svg class="ecl-small" viewBox="0 0 300 300" aria-hidden="true" focusable="false">' + out +
      '<circle cx="150" cy="150" r="64" fill="none" stroke="#FFF4E0" stroke-width="5" opacity=".8"/>' +
      '<g class="e-rot">' + rimGroup(true) + '</g>' +
      '<circle cx="150" cy="150" r="61" fill="#040306"/>' +
      '<g class="e-rot">' + sunGroup(2.4, true) + '</g></svg>';
  }
  // the large eclipse: light that fades smoothly outward, the way a corona photographs
  function big() {
    var r = rng(11), defs = '', out = '';
    defs += '<radialGradient id="cfade" gradientUnits="userSpaceOnUse" cx="150" cy="150" r="150">' +
      '<stop offset="0.41" stop-color="#FFF3DC" stop-opacity="1"/><stop offset="0.45" stop-color="#FFF1D6" stop-opacity=".85"/><stop offset="0.52" stop-color="#FFEFD0" stop-opacity=".42"/>' +
      '<stop offset="0.62" stop-color="#FFEBC8" stop-opacity=".17"/><stop offset="0.78" stop-color="#FFE8C2" stop-opacity=".05"/><stop offset="1" stop-color="#FFE8C2" stop-opacity="0"/></radialGradient>';
    defs += '<radialGradient id="cinner" gradientUnits="userSpaceOnUse" cx="150" cy="150" r="82">' +
      '<stop offset="0.74" stop-color="#FFF4E0" stop-opacity="0"/><stop offset="0.78" stop-color="#FFF4E0" stop-opacity=".5"/><stop offset="0.84" stop-color="#FFF1D6" stop-opacity=".16"/><stop offset="1" stop-color="#FFF1D6" stop-opacity="0"/></radialGradient>';
    defs += '<filter id="psoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter>';
    // a tight inner corona, smooth, hugging the rim
    out += '<circle cx="150" cy="150" r="82" fill="url(#cinner)"/>';
    var pet = '';
    // a few broad streamers, longest along the sun's equator, that fade to nothing
    var petals = [[EQ, 74, 0.26], [EQ + Math.PI, 70, 0.24], [EQ + 0.55, 46, 0.16], [EQ - 0.6, 50, 0.15], [EQ + Math.PI + 0.62, 44, 0.15], [EQ + Math.PI - 0.5, 52, 0.17], [EQ + Math.PI / 2, 22, 0.1], [EQ - Math.PI / 2, 20, 0.1]];
    petals.forEach(function (p, i) {
      var a = p[0], L = p[1], hw = p[2], bend = (r() - 0.5) * 0.18, r0 = 63;
      var b1x = C + r0 * Math.cos(a - hw), b1y = C + r0 * Math.sin(a - hw), b2x = C + r0 * Math.cos(a + hw), b2y = C + r0 * Math.sin(a + hw);
      var tx = C + (r0 + L) * Math.cos(a + bend), ty = C + (r0 + L) * Math.sin(a + bend);
      var c1x = C + (r0 + L * 0.45) * Math.cos(a - hw * 0.7 + bend * 0.5), c1y = C + (r0 + L * 0.45) * Math.sin(a - hw * 0.7 + bend * 0.5);
      var c2x = C + (r0 + L * 0.45) * Math.cos(a + hw * 0.7 + bend * 0.5), c2y = C + (r0 + L * 0.45) * Math.sin(a + hw * 0.7 + bend * 0.5);
      pet += '<path d="M' + f2(b1x) + ' ' + f2(b1y) + ' Q' + f2(c1x) + ' ' + f2(c1y) + ' ' + f2(tx) + ' ' + f2(ty) + ' Q' + f2(c2x) + ' ' + f2(c2y) + ' ' + f2(b2x) + ' ' + f2(b2y) + 'Z" fill="url(#cfade)" fill-opacity="' + f2(0.32 + r() * 0.16) + '"/>';
    });
    out += '<g filter="url(#psoft)">' + pet + '</g>';
    // fine filaments: hair-thin, fading out along their length, never a hard tip
    for (var i = 0; i < 200; i++) {
      var a = (i / 200) * Math.PI * 2 + (r() - 0.5) * 0.05, eq = Math.pow(Math.abs(Math.cos(a - EQ)), 2.4);
      var L = 5 + Math.pow(r(), 1.8) * 16 + eq * (6 + Math.pow(r(), 1.4) * 46), r0 = 63.4, cv = (r() - 0.5) * 0.06 + (Math.sin(2 * (a - EQ)) * 0.05);
      var ex = C + (r0 + L) * Math.cos(a + cv), ey = C + (r0 + L) * Math.sin(a + cv), mx = C + (r0 + L * 0.5) * Math.cos(a + cv * 0.35), my = C + (r0 + L * 0.5) * Math.sin(a + cv * 0.35);
      out += '<path class="fl" style="--fd:' + f2(1.6 + r() * 3.4) + 's;--fo:' + f2(-r() * 5) + 's" d="M' + f2(C + r0 * Math.cos(a)) + ' ' + f2(C + r0 * Math.sin(a)) + ' Q' + f2(mx) + ' ' + f2(my) + ' ' + f2(ex) + ' ' + f2(ey) + '" fill="none" stroke="url(#cfade)" stroke-width="' + f2(0.3 + r() * 0.45 + eq * 0.2) + '" stroke-opacity="' + f2(0.36 + r() * 0.42) + '" stroke-linecap="round"/>';
    }
    return '<svg class="ecl-big" viewBox="0 0 300 300" aria-hidden="true" focusable="false"><defs>' + defs + '</defs>' + out +
      '<circle cx="150" cy="150" r="64.6" fill="none" stroke="#FFF4E0" stroke-width=".5" opacity=".35"/>' +
      '<circle cx="150" cy="150" r="63.6" fill="none" stroke="#FFF6E6" stroke-width="1.3" opacity=".92"/>' +
      '<g class="e-rot">' + rimGroup(false) + '</g>' +
      '<circle cx="150" cy="150" r="62.8" fill="#050409"/>' +
      '<g class="e-rot">' + sunGroup(1, false) + '</g></svg>';
  }
  window.STILL_ECLIPSE = { small: small, big: big };
})();
