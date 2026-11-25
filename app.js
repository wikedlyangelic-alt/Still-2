/* Still 2 — the app. Everything is saved on the phone first, then backed up to Supabase. */
(function () {
  'use strict';

  var SUPA = { url: 'https://icovzdxbbvbdbhcvdbrv.supabase.co', key: 'sb_publishable_rGazt0U4ycF564bSIBcBew_gO9RfORw' };
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function iconSvg(name) {
    var d = (window.STILL_ICONS || {})[name];
    return d ? '<svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="' + d + '"></path></svg>' : '';
  }
  function setIcon(el, name) { if (el && el.getAttribute('data-icon') !== name) { el.setAttribute('data-icon', name); el.innerHTML = iconSvg(name); } }
  Array.prototype.forEach.call(document.querySelectorAll('.msr'), function (el) { setIcon(el, el.textContent.trim()); });
  function uid() {
    try { if (window.crypto && crypto.randomUUID) { return crypto.randomUUID(); } } catch (e) {}
    var b = new Uint8Array(16);
    try { crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 16; i++) { b[i] = Math.floor(Math.random() * 256); } }
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = []; for (var j = 0; j < 16; j++) { h.push((b[j] + 256).toString(16).slice(1)); }
    return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' + h.slice(10).join('');
  }
  function ms(v) { var n = Date.parse(v); return isNaN(n) ? 0 : n; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function timeLabel(d) { try { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); } }
  function plural(n, one) { return n + ' ' + (n === 1 ? one : one + 's'); }
  function dayInfo(d, count, noun) {
    var today = startOfDay(new Date());
    var diff = Math.round((today - startOfDay(d)) / 86400000);
    var md = MONTHS[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== today.getFullYear() ? ', ' + d.getFullYear() : '');
    var title = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : WEEKDAYS[d.getDay()];
    var sub = (diff <= 1 ? WEEKDAYS[d.getDay()] + ', ' : '') + md + ' · ' + plural(count, noun);
    return { num: d.getDate(), title: title, sub: sub, label: WEEKDAYS[d.getDay()] + ', ' + md + ' · ' + plural(count, noun) };
  }

  var toastTimer = null;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------- your data, kept on this phone first ---------- */
  var KEY = 'still2-data-v1';
  var DB = { v: 1, moments: [], mind: [], importedV1: false };
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && Array.isArray(raw.moments)) { DB = raw; if (!Array.isArray(DB.mind)) { DB.mind = []; } }
  } catch (e) {}
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); }
    catch (e) { toast('Could not save on this phone. Is storage full?'); }
  }
  if (!DB.importedV1) {
    // Bring over anything the first Still app has on this phone that has not been backed up yet.
    try {
      var old = JSON.parse(localStorage.getItem('still-data-v1') || 'null');
      if (old && Array.isArray(old.moments)) {
        old.moments.forEach(function (m) {
          if (!m || !m.id || !m.text) { return; }
          if (DB.moments.some(function (x) { return x.id === m.id; })) { return; }
          DB.moments.push({ id: m.id, text: m.text, at: m.at, updated_at: m.updated_at || m.at, source: m.source === 'typed' ? 'typed' : 'voice', synced: m.synced !== false });
        });
      }
    } catch (e) {}
    DB.importedV1 = true;
    persist();
  }
  var askedPersist = false;
  function keepStorage() {
    if (askedPersist) { return; }
    askedPersist = true;
    try { if (navigator.storage && navigator.storage.persist) { navigator.storage.persist(); } } catch (e) {}
  }
  function live(list) { return list.filter(function (x) { return !x.deleted_at; }); }
  function addMoment(text, source) {
    var now = new Date().toISOString();
    DB.moments.unshift({ id: uid(), text: text, at: now, updated_at: now, source: source === 'voice' ? 'voice' : 'typed', synced: false });
    persist(); keepStorage(); dirtyAll(); syncSoon(400);
  }
  function addMind(kind, text) {
    var now = new Date().toISOString();
    DB.mind.unshift({ id: uid(), kind: kind, text: text, at: now, updated_at: now, synced: false });
    persist(); keepStorage(); dirtyAll(); syncSoon(400);
  }

  /* ---------- backup and sync with Supabase ---------- */
  // Push everything not yet sent, then pull everything the server received since this phone last asked.
  var TABLES = {
    moments: {
      list: function () { return DB.moments; },
      cols: 'id,text,at,source,updated_at,deleted_at,server_updated_at',
      toRow: function (m) { return { id: m.id, text: m.text, at: m.at, source: m.source === 'voice' ? 'voice' : 'typed', updated_at: m.updated_at || m.at, deleted_at: m.deleted_at || null }; },
      fromRow: function (r) { return { id: r.id, text: r.text, at: r.at, source: r.source, updated_at: r.updated_at, synced: true }; }
    },
    mind_entries: {
      list: function () { return DB.mind; },
      cols: 'id,kind,text,at,updated_at,deleted_at,server_updated_at',
      toRow: function (m) { return { id: m.id, kind: m.kind, text: m.text, at: m.at, updated_at: m.updated_at || m.at, deleted_at: m.deleted_at || null }; },
      fromRow: function (r) { return { id: r.id, kind: r.kind, text: r.text, at: r.at, updated_at: r.updated_at, synced: true }; }
    }
  };
  var CURSORS = 'still2-cursors';
  var AUTH_HASH = '';
  if (/(^|[#&])(access_token|error_description)=/.test(location.hash)) {
    AUTH_HASH = location.hash.slice(1);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
  var sb = null;
  try {
    if (window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(SUPA.url, SUPA.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'still-auth' } });
    }
  } catch (e) { sb = null; }
  var SYNC = { user: null, busy: false, again: false, state: 'off', last: null, msg: '' };
  try { var lastIso = localStorage.getItem('still2-sync-last'); if (lastIso) { SYNC.last = new Date(lastIso); } } catch (e) {}

  function readCursors() { try { return JSON.parse(localStorage.getItem(CURSORS) || '{}') || {}; } catch (e) { return {}; } }
  function writeCursor(table, userId, v) {
    var c = readCursors(); c[table] = c[table] || {}; c[table][userId] = v;
    try { localStorage.setItem(CURSORS, JSON.stringify(c)); } catch (e) {}
  }
  function errText(err) {
    var code = (err && (err.code || err.error_code)) || '';
    var m = String((err && (err.message || err.error_description || err.msg)) || err || '');
    if (code === 'email_address_not_authorized' || /not authorized/i.test(m)) { return 'For now, sign-in emails only go to the address on your Supabase account. Use that one.'; }
    if (code === 'over_email_send_rate_limit' || /rate limit/i.test(m)) { return 'Too many emails in the last hour. Try again a little later.'; }
    if (code === 'otp_expired' || /expired|invalid|token/i.test(m)) { return 'That link or code has expired. Send yourself a new one.'; }
    if (navigator.onLine === false || /fetch|network|load failed/i.test(m)) { return 'No connection right now. Your entries are safe on this phone.'; }
    return m || 'Something went wrong. Your entries are safe on this phone.';
  }
  function mergeRow(table, row) {
    var T = TABLES[table], list = T.list();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== row.id) { continue; }
      if (row.deleted_at) { list.splice(i, 1); return; }
      if (list[i].synced === false && ms(list[i].updated_at) > ms(row.updated_at)) { return; }
      list[i] = T.fromRow(row);
      return;
    }
    if (!row.deleted_at) { list.push(T.fromRow(row)); }
  }
  function pull(table, userId, depth) {
    var cur = (readCursors()[table] || {})[userId] || '1970-01-01T00:00:00Z';
    return sb.from(table).select(TABLES[table].cols).gte('server_updated_at', cur).order('server_updated_at', { ascending: true }).limit(1000)
      .then(function (res) {
        if (res.error) { throw res.error; }
        var rows = res.data || [];
        rows.forEach(function (r) { mergeRow(table, r); });
        if (rows.length) {
          var last = rows[rows.length - 1].server_updated_at;
          writeCursor(table, userId, last);
          if (rows.length === 1000 && last !== cur && (depth || 0) < 20) { return pull(table, userId, (depth || 0) + 1); }
        }
      });
  }
  function push(table) {
    var T = TABLES[table];
    var pending = T.list().filter(function (m) { return m.synced === false; });
    if (!pending.length) { return Promise.resolve(); }
    var stamps = pending.map(function (m) { return m.updated_at; });
    return sb.from(table).upsert(pending.map(T.toRow), { onConflict: 'id' }).then(function (res) {
      if (res.error) { throw res.error; }
      pending.forEach(function (m, i) { if (m.updated_at === stamps[i]) { m.synced = true; } });
    });
  }
  function setSync(state, msg) { SYNC.state = state; if (msg !== undefined) { SYNC.msg = msg; } paintCloud(); paintAccount(); }
  function syncNow() {
    if (!sb || !SYNC.user) { return Promise.resolve(false); }
    if (SYNC.busy) { SYNC.again = true; return Promise.resolve(false); }
    if (navigator.onLine === false) { setSync('error', 'No connection right now. Your entries are safe on this phone.'); return Promise.resolve(false); }
    SYNC.busy = true;
    setSync('busy', '');
    var userId = SYNC.user.id;
    return push('moments').then(function () { return push('mind_entries'); })
      .then(function () { return pull('moments', userId); })
      .then(function () { return pull('mind_entries', userId); })
      .then(function () {
        DB.moments.sort(function (a, b) { return ms(b.at) - ms(a.at); });
        DB.mind.sort(function (a, b) { return ms(b.at) - ms(a.at); });
        persist();
        SYNC.last = new Date();
        try { localStorage.setItem('still2-sync-last', SYNC.last.toISOString()); } catch (e) {}
        SYNC.busy = false;
        setSync('ok', '');
        dirtyAll();
        renderCurrent();
        if (SYNC.again) { SYNC.again = false; return syncNow(); }
        return true;
      }).catch(function (err) {
        persist();
        SYNC.busy = false; SYNC.again = false;
        setSync('error', errText(err));
        return false;
      });
  }
  var syncTimer = null;
  function syncSoon(delay) {
    if (!sb || !SYNC.user) { return; }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, delay || 600);
  }
  function setUser(u) {
    var was = SYNC.user ? SYNC.user.id : null;
    SYNC.user = u || null;
    if (!SYNC.user) { SYNC.state = 'off'; paintCloud(); paintAccount(); return; }
    if (SYNC.state === 'off') { SYNC.state = 'busy'; }
    paintCloud(); paintAccount();
    if (was !== SYNC.user.id) { syncSoon(50); }
  }
  window.addEventListener('online', function () { syncSoon(300); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { syncSoon(300); dirtyAll(); renderCurrent(); }
  });

  /* ---------- account sheet ---------- */
  var pendingEmail = '';
  try { pendingEmail = localStorage.getItem('still-auth-email') || ''; } catch (e) {}
  function ago(d) {
    var s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
    if (s < 60) { return 'just now'; }
    var m = Math.round(s / 60); if (m < 60) { return plural(m, 'minute') + ' ago'; }
    var h = Math.round(m / 60); if (h < 24) { return plural(h, 'hour') + ' ago'; }
    return plural(Math.round(h / 24), 'day') + ' ago';
  }
  function paintCloud() {
    var icon = $('w-cloud-icon');
    if (!SYNC.user) { setIcon(icon, 'cloud_off'); $('w-cloud').setAttribute('aria-label', 'Back up your moments'); return; }
    setIcon(icon, SYNC.state === 'ok' ? 'cloud_done' : 'cloud');
    $('w-cloud').setAttribute('aria-label', SYNC.state === 'ok' ? 'Backed up' : 'Backing up');
  }
  function paintAccount() {
    var inn = !!SYNC.user;
    $('a-in').hidden = !inn; $('a-out').hidden = inn;
    $('acct-title').textContent = inn ? 'Backed up' : 'Back up your moments';
    if (inn) {
      $('a-status').textContent = 'Signed in as ' + (SYNC.user.email || 'you') + '. ' + (SYNC.state === 'busy' ? 'Backing up now.' : SYNC.last ? 'Last backed up ' + ago(SYNC.last) + '.' : 'Not backed up yet.');
      $('a-sync').disabled = SYNC.busy;
      $('a-sync').textContent = SYNC.busy ? 'Backing up…' : 'Back up now';
    } else {
      $('a-status').textContent = sb ? 'Everything you write is saved on this phone. Sign in to keep a copy safe in the cloud and see it on other devices.' : 'Backup is not available right now. Everything is still saved on this phone.';
    }
    $('a-msg').textContent = SYNC.msg || '';
  }
  function sendLink() {
    var email = String($('a-email').value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { SYNC.msg = 'Enter your email address.'; paintAccount(); return; }
    $('a-send').disabled = true; SYNC.msg = 'Sending…'; paintAccount();
    sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } }).then(function (res) {
      $('a-send').disabled = false;
      if (res.error) { SYNC.msg = errText(res.error); paintAccount(); return; }
      pendingEmail = email;
      try { localStorage.setItem('still-auth-email', email); } catch (e) {}
      $('a-codebox').hidden = false;
      SYNC.msg = 'Check your email and tap the link. It opens Still and signs you in.';
      paintAccount();
    }).catch(function (err) { $('a-send').disabled = false; SYNC.msg = errText(err); paintAccount(); });
  }
  function verifyCode() {
    var code = String($('a-code').value || '').replace(/\D/g, '');
    if (code.length < 6) { SYNC.msg = 'Enter the code from the email.'; paintAccount(); return; }
    $('a-verify').disabled = true; SYNC.msg = 'Checking…'; paintAccount();
    sb.auth.verifyOtp({ email: pendingEmail, token: code, type: 'email' }).then(function (res) {
      if (res.error && !/rate limit|fetch|network/i.test(String(res.error.message || ''))) {
        return sb.auth.verifyOtp({ email: pendingEmail, token: code, type: 'signup' }).then(function (r2) { return r2.error ? res : r2; });
      }
      return res;
    }).then(function (res) {
      $('a-verify').disabled = false;
      if (res.error) { SYNC.msg = errText(res.error); paintAccount(); return; }
      var u = res.data && (res.data.user || (res.data.session && res.data.session.user));
      SYNC.msg = 'Signed in. Backing up now.';
      if (u) { setUser(u); }
      paintAccount();
    }).catch(function (err) { $('a-verify').disabled = false; SYNC.msg = errText(err); paintAccount(); });
  }
  if (sb) {
    $('a-send').addEventListener('click', sendLink);
    $('a-verify').addEventListener('click', verifyCode);
    $('a-sync').addEventListener('click', function () { syncNow(); });
    $('a-signout').addEventListener('click', function () { sb.auth.signOut().then(function () { SYNC.msg = 'Signed out. Your entries stay on this phone.'; setUser(null); }); });
    sb.auth.onAuthStateChange(function (event, session) { setUser(session ? session.user : null); });
    if (AUTH_HASH) {
      var hp = {};
      AUTH_HASH.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) { hp[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); } });
      if (hp.access_token && hp.refresh_token) {
        sb.auth.setSession({ access_token: hp.access_token, refresh_token: hp.refresh_token }).then(function (res) {
          if (res.error) { toast(errText(res.error)); return; }
          if (res.data && res.data.session) { setUser(res.data.session.user); toast('Signed in. Your entries are backing up.'); }
        });
      } else if (hp.error_description) {
        setTimeout(function () { toast(hp.error_description.replace(/\+/g, ' ')); }, 400);
      }
    } else {
      sb.auth.getSession().then(function (res) { if (res.data && res.data.session) { setUser(res.data.session.user); } });
    }
  }
  if (pendingEmail) { $('a-email').value = pendingEmail; }

  /* ---------- layers: sheets and the eclipse close with the phone's back gesture ---------- */
  var layers = [];
  var ignorePop = 0;
  function pushLayer(close) { layers.push(close); try { history.pushState({ still: layers.length }, ''); } catch (e) {} }
  function popLayer() { if (!layers.length) { return; } layers.pop(); ignorePop++; try { history.back(); } catch (e) { ignorePop--; } }
  window.addEventListener('popstate', function () {
    if (ignorePop) { ignorePop--; return; }
    var close = layers.pop();
    if (close) { close(true); }
  });

  function openSheet(id, focusId) {
    var s = $(id);
    s.classList.add('open'); s.setAttribute('aria-hidden', 'false');
    pushLayer(function () { closeSheet(id, true); });
    if (focusId) { setTimeout(function () { try { $(focusId).focus(); } catch (e) {} }, 380); }
  }
  function closeSheet(id, fromBack) {
    var s = $(id);
    if (!s.classList.contains('open')) { return; }
    s.classList.remove('open'); s.setAttribute('aria-hidden', 'true');
    try { if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); } } catch (e) {}
    if (!fromBack) { popLayer(); }
  }
  Array.prototype.forEach.call(document.querySelectorAll('.sheet [data-close]'), function (el) {
    el.addEventListener('click', function () { closeSheet(el.closest('.sheet').id); });
  });

  /* ---------- stars ---------- */
  function sprinkle(el, n, seed) {
    var s = seed, html = '';
    var rnd = function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    for (var i = 0; i < n; i++) {
      var r = rnd(), d = (0.8 + rnd() * 1.5).toFixed(2);
      html += '<span style="left:' + (rnd() * 100).toFixed(2) + '%;top:' + (rnd() * 100).toFixed(2) + '%;width:' + d + 'px;height:' + d + 'px;animation:' + (r < 0.7 ? 'twA' : 'twB') + ' ' + (3 + rnd() * 5).toFixed(1) + 's ease-in-out ' + (rnd() * 6).toFixed(1) + 's infinite"></span>';
    }
    el.innerHTML = html;
  }
  sprinkle($('stars'), 36, 20261207);
  sprinkle($('nav-stars'), 40, 20261214);

  /* ---------- the star line with travelling light ---------- */
  function Timeline(scrollEl, tlEl, currentEl, onMore) {
    var self = this;
    this.scroll = scrollEl; this.tl = tlEl; this.current = currentEl; this.nodes = []; this.first = 0; this.last = 0; this.ticking = false;
    scrollEl.addEventListener('scroll', function () {
      if (self.ticking) { return; }
      self.ticking = true;
      requestAnimationFrame(function () { self.ticking = false; self.update(); });
    }, { passive: true });
    tlEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-more]');
      if (b) { onMore(b.getAttribute('data-more')); }
    });
    if (window.ResizeObserver) { new ResizeObserver(function () { self.measure(); }).observe(tlEl); }
  }
  Timeline.prototype.render = function (html) {
    this.tl.innerHTML = '<span class="tl-track"></span><span class="tl-lit"></span><span class="tl-head"></span>' + html;
    this.measure();
  };
  Timeline.prototype.measure = function () {
    var els = this.tl.querySelectorAll('[data-node]'), nodes = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i], isDay = el.classList.contains('tl-day');
      var y = isDay ? el.offsetTop + el.querySelector('.tl-medal').offsetTop + 28 : el.offsetTop + 20;
      nodes.push({ el: el, y: y, day: isDay, label: el.getAttribute('data-label'), lit: null, near: null });
    }
    this.nodes = nodes;
    var track = this.tl.querySelector('.tl-track');
    if (!nodes.length) { this.first = this.last = 0; if (track) { track.style.height = '0px'; } this.update(); return; }
    this.first = nodes[0].y; this.last = nodes[nodes.length - 1].y;
    track.style.top = this.first + 'px';
    track.style.height = Math.max(0, this.last - this.first) + 'px';
    this.update();
  };
  Timeline.prototype.update = function () {
    var top = this.scroll.scrollTop, litY = top + this.scroll.clientHeight * 0.42, label = '';
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i], lit = n.y < litY, near = !n.day && lit && litY - n.y < 70;
      if (lit !== n.lit) { n.el.classList.toggle('lit', lit); n.lit = lit; }
      if (near !== n.near) { n.el.classList.toggle('near', near); n.near = near; }
      if (n.day && (n.y <= top + 70 || !label)) { label = n.label; }
    }
    var head = Math.min(litY, this.last);
    var litEl = this.tl.querySelector('.tl-lit'), headEl = this.tl.querySelector('.tl-head');
    if (litEl) { litEl.style.top = this.first + 'px'; litEl.style.height = Math.max(0, head - this.first) + 'px'; }
    if (headEl) { headEl.style.top = (head - 5) + 'px'; headEl.style.opacity = this.nodes.length && litY < this.last ? '1' : '0'; }
    if (this.current) { this.current.textContent = label; }
  };

  function groupByDay(list) {
    var groups = [], map = {};
    list.slice().sort(function (a, b) { return ms(b.at) - ms(a.at); }).forEach(function (m) {
      var d = new Date(m.at), k = dayKey(d);
      if (!map[k]) { map[k] = { key: k, date: d, items: [] }; groups.push(map[k]); }
      map[k].items.push(m);
    });
    return groups;
  }
  var SHOW = 6;

  /* ---------- pages ---------- */
  var current = 'write';
  var dirty = {};
  function dirtyAll() { dirty = { write: 1, gratitude: 1, mind: 1, patterns: 1 }; }
  dirtyAll();

  // Write
  function renderWrite() {
    var now = new Date();
    $('w-date').textContent = WEEKDAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()];
    var k = dayKey(now);
    var n = live(DB.moments).filter(function (m) { return dayKey(new Date(m.at)) === k; }).length;
    $('w-count').textContent = n ? plural(n, 'moment') + ' today' : 'No moments yet today';
  }
  var usedVoice = false;
  $('w-save').addEventListener('click', function () {
    var ta = $('w-text'), text = String(ta.value || '').trim();
    if (!text) { toast('Write something first, or tap the mic and say it.'); ta.focus(); return; }
    stopListening();
    addMoment(text, usedVoice ? 'voice' : 'typed');
    ta.value = ''; usedVoice = false;
    renderWrite();
    toast('Saved. ' + $('w-count').textContent + '.');
  });
  $('w-cloud').addEventListener('click', function () { paintAccount(); openSheet('sheet-account'); });

  // voice
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null, listening = false, baseText = '';
  function stopListening() { if (rec && listening) { try { rec.stop(); } catch (e) {} } }
  $('w-mic').addEventListener('click', function () {
    if (!Rec) { toast('Voice is not available in this browser. Try Chrome.'); return; }
    if (listening) { stopListening(); return; }
    rec = new Rec();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    baseText = String($('w-text').value || '').trim();
    rec.onresult = function (e) {
      var said = '';
      for (var i = 0; i < e.results.length; i++) { said += e.results[i][0].transcript; }
      said = said.trim();
      if (said) { usedVoice = true; $('w-text').value = (baseText ? baseText + ' ' : '') + said.charAt(0).toUpperCase() + said.slice(1); }
    };
    rec.onend = function () { listening = false; $('w-mic').setAttribute('aria-pressed', 'false'); };
    rec.onerror = function (e) { if (e.error === 'not-allowed') { toast('Allow the microphone to speak your moments.'); } };
    try { rec.start(); listening = true; $('w-mic').setAttribute('aria-pressed', 'true'); } catch (e) { toast('Could not start the microphone.'); }
  });

  // Gratitude
  var gOpen = {};
  var gTL = new Timeline($('g-scroll'), $('g-tl'), $('g-current'), function (key) { gOpen[key] = true; dirty.gratitude = 1; renderGratitude(); });
  $('g-tl').classList.add('gold');
  function renderGratitude() {
    var groups = groupByDay(live(DB.moments));
    if (!groups.length) {
      gTL.render('<div class="empty"><p>Your gratitude will show up here, one star at a time.</p><button type="button" class="pill-btn" data-go="write">Write your first one</button></div>');
      $('g-current').textContent = '';
      return;
    }
    var html = '';
    groups.forEach(function (g) {
      var info = dayInfo(g.date, g.items.length, 'moment');
      html += '<div class="tl-day" data-node data-label="' + esc(info.label) + '"><span class="tl-medal">' + info.num + '</span><div><h2>' + esc(info.title) + '</h2><p>' + esc(info.sub) + '</p></div></div>';
      var show = gOpen[g.key] ? g.items : g.items.slice(0, SHOW);
      show.forEach(function (m) {
        html += '<div class="tl-item" data-node><span class="tl-dot"></span><div class="tl-body"><span class="tl-meta">' + esc(timeLabel(new Date(m.at))) + '</span><p>' + esc(m.text) + '</p></div></div>';
      });
      if (show.length < g.items.length) {
        html += '<button type="button" class="tl-more" data-more="' + g.key + '">Show ' + (g.items.length - show.length) + ' more from ' + esc(info.title) + '</button>';
      }
    });
    gTL.render(html);
  }

  // Master your Mind
  var KINDS = {
    others: { label: 'Thinking of others', color: '#7DDBA8', ask: 'Who did you think of, and what did you do?' },
    angry: { label: 'Angry', color: '#FF8A7A', ask: 'Where did it land, and on whom?' },
    afraid: { label: 'Afraid', color: '#8AB6FF', ask: 'What were you protecting?' },
    selfish: { label: 'Selfish', color: '#FFB15C', ask: 'Who carried it instead of you?' },
    resentful: { label: 'Resentful', color: '#E89BEF', ask: 'What went unsaid?' }
  };
  var KIND_ORDER = ['others', 'angry', 'afraid', 'selfish', 'resentful'];
  var HARD = ['afraid', 'angry', 'selfish', 'resentful'];
  var mFilter = 'all', mOpen = {};
  var mTL = new Timeline($('m-scroll'), $('m-tl'), null, function (key) { mOpen[key] = true; dirty.mind = 1; renderMind(); });
  $('m-tl').classList.add('lav');
  function todayCounts() {
    var k = dayKey(new Date()), c = { gratitude: 0, others: 0, angry: 0, afraid: 0, selfish: 0, resentful: 0 };
    live(DB.moments).forEach(function (m) { if (dayKey(new Date(m.at)) === k) { c.gratitude++; } });
    live(DB.mind).forEach(function (m) { if (dayKey(new Date(m.at)) === k && c[m.kind] != null) { c[m.kind]++; } });
    return c;
  }
  function renderChips() {
    var html = '<button type="button" class="chip" style="--c:#C8BBFF" data-kind="all" aria-pressed="' + (mFilter === 'all') + '"><i></i>All</button>';
    KIND_ORDER.forEach(function (k) {
      html += '<button type="button" class="chip" style="--c:' + KINDS[k].color + '" data-kind="' + k + '" aria-pressed="' + (mFilter === k) + '"><i></i>' + KINDS[k].label + '</button>';
    });
    $('m-chips').innerHTML = html;
  }
  $('m-chips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-kind]');
    if (!b) { return; }
    mFilter = b.getAttribute('data-kind');
    renderMind();
  });
  function renderMind() {
    var c = todayCounts(), good = c.gratitude + c.others, hard = c.angry + c.afraid + c.selfish + c.resentful;
    var line;
    if (!good && !hard) { line = 'Nothing logged yet today.'; }
    else if (good > hard) { line = 'Good is winning today, <span class="g">' + good + '</span> to <span class="h">' + hard + '</span>.'; }
    else if (good === hard) { line = 'It is even today, <span class="g">' + good + '</span> to <span class="h">' + hard + '</span>.'; }
    else { line = 'The hard stuff is ahead today, <span class="h">' + hard + '</span> to <span class="g">' + good + '</span>.'; }
    $('m-line').innerHTML = line;
    var fill = $('m-good').parentNode;
    fill.classList.toggle('empty-bar', !good && !hard);
    $('m-good').style.flexGrow = good || (!hard ? 1 : 0.0001);
    $('m-hard').style.flexGrow = hard || (!good ? 1 : 0.0001);
    $('m-good-text').innerHTML = '<b class="g">' + good + ' good</b><br>Gratitude ' + c.gratitude + ' · Others ' + c.others;
    var hardParts = HARD.filter(function (k) { return c[k]; }).map(function (k) { return KINDS[k].label + ' ' + c[k]; });
    $('m-hard-text').innerHTML = '<b class="h">' + hard + ' hard</b><br>' + (hardParts.length ? esc(hardParts.join(' · ')) : 'None yet');
    renderChips();

    var list = live(DB.mind).filter(function (m) { return mFilter === 'all' || m.kind === mFilter; });
    var groups = groupByDay(list);
    if (!groups.length) {
      var msg = mFilter === 'all' ? 'When something pulls you off course, or you do something kind for someone, log it here.' : 'Nothing logged as ' + KINDS[mFilter].label.toLowerCase() + ' yet.';
      mTL.render('<div class="empty"><p>' + esc(msg) + '</p><button type="button" class="pill-btn" data-add="1">Add an entry</button></div>');
      return;
    }
    var html = '';
    groups.forEach(function (g) {
      var info = dayInfo(g.date, g.items.length, 'entry');
      info.sub = info.sub.replace('entrys', 'entries');
      html += '<div class="tl-day" data-node data-label=""><span class="tl-medal">' + info.num + '</span><div><h2>' + esc(info.title) + '</h2><p>' + esc(info.sub) + '</p></div></div>';
      var show = mOpen[g.key] ? g.items : g.items.slice(0, SHOW);
      show.forEach(function (m) {
        var k = KINDS[m.kind] || KINDS.others;
        html += '<div class="tl-item" data-node style="--c:' + k.color + '"><span class="tl-dot"></span><div class="tl-body"><span class="tl-meta"><b>' + esc(k.label) + '</b>· ' + esc(timeLabel(new Date(m.at))) + '</span><p>' + esc(m.text) + '</p></div></div>';
      });
      if (show.length < g.items.length) {
        html += '<button type="button" class="tl-more" data-more="' + g.key + '">Show ' + (g.items.length - show.length) + ' more from ' + esc(info.title) + '</button>';
      }
    });
    mTL.render(html);
  }
  var mindKind = 'others';
  function paintKinds() {
    var html = '';
    KIND_ORDER.forEach(function (k) {
      html += '<button type="button" class="chip" style="--c:' + KINDS[k].color + '" data-k="' + k + '" aria-pressed="' + (mindKind === k) + '"><i></i>' + KINDS[k].label + '</button>';
    });
    $('mind-kinds').innerHTML = html;
    $('mind-text').placeholder = KINDS[mindKind].ask;
  }
  function openMindSheet() {
    mindKind = mFilter !== 'all' ? mFilter : 'others';
    paintKinds();
    $('mind-text').value = '';
    openSheet('sheet-mind', 'mind-text');
  }
  $('mind-kinds').addEventListener('click', function (e) {
    var b = e.target.closest('[data-k]');
    if (b) { mindKind = b.getAttribute('data-k'); paintKinds(); }
  });
  $('mind-save').addEventListener('click', function () {
    var text = String($('mind-text').value || '').trim();
    if (!text) { toast('Write a few words about what happened.'); $('mind-text').focus(); return; }
    addMind(mindKind, text);
    closeSheet('sheet-mind');
    renderMind();
    toast('Saved as ' + KINDS[mindKind].label.toLowerCase() + '.');
  });
  $('m-add').addEventListener('click', openMindSheet);
  app.addEventListener('click', function (e) {
    var a = e.target.closest('[data-add]');
    if (a) { openMindSheet(); return; }
    var g = e.target.closest('[data-go]');
    if (g) { show(g.getAttribute('data-go')); }
  });

  // Meditate
  function blob(r0, amp, lobes) {
    var pts = [];
    for (var i = 0; i <= 240; i++) {
      var a = (i / 240) * Math.PI * 2, r = r0 + amp * Math.cos(lobes * a);
      pts.push((110 + r * Math.cos(a)).toFixed(2) + ' ' + (110 + r * Math.sin(a)).toFixed(2));
    }
    return 'M' + pts.join(' L') + 'Z';
  }
  $('d-burst').setAttribute('d', blob(102, 6, 12));
  $('d-burst2').setAttribute('d', blob(80, 4, 8));
  var MINS = [3, 5, 10, 20, 30], SOUNDS = ['Silence', 'Deep hum', 'Soft rain'];
  var med = { pick: 2, sound: 0, bell: true, running: false, end: 0, timer: null, lock: null };
  try { var ms0 = JSON.parse(localStorage.getItem('still2-meditate') || 'null'); if (ms0) { med.pick = ms0.pick; med.sound = ms0.sound; med.bell = ms0.bell !== false; } } catch (e) {}
  function saveMed() { try { localStorage.setItem('still2-meditate', JSON.stringify({ pick: med.pick, sound: med.sound, bell: med.bell })); } catch (e) {} }
  function paintMed() {
    $('d-mins').innerHTML = MINS.map(function (m, i) { return '<button type="button" data-i="' + i + '" aria-pressed="' + (i === med.pick) + '" aria-label="' + m + ' minutes"' + (med.running ? ' disabled' : '') + '>' + m + '</button>'; }).join('');
    $('d-sound-val').textContent = SOUNDS[med.sound];
    $('d-bell').setAttribute('aria-checked', String(med.bell));
    $('d-run').textContent = med.running ? 'End session' : 'Begin session';
    $('d-run').classList.toggle('running', med.running);
    $('d-shape').classList.toggle('breathing', med.running);
    if (!med.running) { $('d-clock').textContent = MINS[med.pick] + ':00'; }
  }
  $('d-mins').addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]');
    if (!b || med.running) { return; }
    med.pick = +b.getAttribute('data-i'); saveMed(); $('d-sub').textContent = 'minutes'; paintMed();
  });
  $('d-sound').addEventListener('click', function () { med.sound = (med.sound + 1) % SOUNDS.length; saveMed(); paintMed(); if (med.running) { startAmbient(SOUNDS[med.sound]); } });
  $('d-bell').addEventListener('click', function () { med.bell = !med.bell; saveMed(); paintMed(); });
  var AC = null, amb = null;
  function audio() {
    if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) { return null; } AC = new C(); }
    if (AC.state === 'suspended') { AC.resume(); }
    return AC;
  }
  function stopAmbient() {
    if (!amb || !AC) { return; }
    var a = amb; amb = null;
    try { a.master.gain.cancelScheduledValues(AC.currentTime); a.master.gain.setTargetAtTime(0, AC.currentTime, 0.4); } catch (e) {}
    setTimeout(function () { a.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} }); try { a.master.disconnect(); } catch (e) {} }, 2200);
  }
  function startAmbient(kind) {
    stopAmbient();
    var ac = audio();
    if (!ac || kind === 'Silence') { return; }
    var master = ac.createGain(), nodes = [];
    master.gain.setValueAtTime(0, ac.currentTime);
    master.gain.linearRampToValueAtTime(1, ac.currentTime + 2.5);
    master.connect(ac.destination);
    if (kind === 'Deep hum') {
      [[110, 0.05], [164.8, 0.022], [220, 0.01]].forEach(function (p) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = p[0]; g.gain.value = p[1];
        o.connect(g); g.connect(master); o.start(); nodes.push(o);
      });
    } else {
      var len = 2 * ac.sampleRate, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; }
      var src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g2 = ac.createGain();
      src.buffer = buf; src.loop = true; bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6; g2.gain.value = 0.06;
      src.connect(bp); bp.connect(g2); g2.connect(master); src.start(); nodes.push(src);
    }
    amb = { master: master, nodes: nodes };
  }
  function ring() {
    var ac = audio();
    if (!ac) { return; }
    [[528, 0.22], [1056, 0.07], [1584, 0.035]].forEach(function (p) {
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = 'sine'; o.frequency.value = p[0];
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p[1], t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 5.2);
    });
  }
  function tick() {
    var left = Math.max(0, Math.round((med.end - Date.now()) / 1000));
    $('d-clock').textContent = Math.floor(left / 60) + ':' + pad(left % 60);
    if (left <= 0) { finishMed(true); }
  }
  function finishMed(done) {
    clearInterval(med.timer); med.timer = null; med.running = false;
    stopAmbient();
    if (done && med.bell) { ring(); }
    try { if (med.lock) { med.lock.release(); } } catch (e) {}
    med.lock = null;
    paintMed();
    $('d-sub').textContent = done ? 'Done. Well sat.' : 'minutes';
    if (done) { $('d-clock').textContent = '0:00'; }
  }
  $('d-run').addEventListener('click', function () {
    if (med.running) { finishMed(false); return; }
    audio();
    med.running = true; med.end = Date.now() + MINS[med.pick] * 60000;
    $('d-sub').textContent = 'Breathe in, and out';
    startAmbient(SOUNDS[med.sound]);
    try { if (navigator.wakeLock) { navigator.wakeLock.request('screen').then(function (l) { med.lock = l; }).catch(function () {}); } } catch (e) {}
    med.timer = setInterval(tick, 250);
    paintMed(); tick();
  });

  // Patterns
  function renderPatterns() {
    var since = startOfDay(new Date()); since.setDate(since.getDate() - 6);
    var c = { gratitude: 0, others: 0, angry: 0, afraid: 0, selfish: 0, resentful: 0 }, days = {};
    function bump(k, at, val) { var key = dayKey(new Date(at)); days[key] = days[key] || { good: 0, hard: 0 }; days[key][val]++; }
    live(DB.moments).forEach(function (m) { if (new Date(m.at) >= since) { c.gratitude++; bump('gratitude', m.at, 'good'); } });
    live(DB.mind).forEach(function (m) { if (new Date(m.at) >= since && c[m.kind] != null) { c[m.kind]++; bump(m.kind, m.at, m.kind === 'others' ? 'good' : 'hard'); } });
    var rows = [['Gratitude', c.gratitude, '#EEC56C'], ['Thinking of others', c.others, '#7DDBA8']].concat(HARD.map(function (k) { return [KINDS[k].label, c[k], KINDS[k].color]; }));
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    var logged = Object.keys(days), won = logged.filter(function (k) { return days[k].good > days[k].hard; }).length;
    var html = '<section class="card"><h2>Good days</h2><p>' + (logged.length ? 'Good won on ' + won + ' of the ' + plural(logged.length, 'day') + ' you logged something this week.' : 'Log a few moments and this fills in.') + '</p></section>';
    html += '<section class="card"><h2>What you logged</h2>' + rows.map(function (r) {
      return '<div class="stat" style="--c:' + r[2] + '"><div class="stat-top"><span>' + esc(r[0]) + '</span><span>' + plural(r[1], 'time') + '</span></div><div class="stat-bar"><i style="width:' + Math.round(r[1] / max * 100) + '%"></i></div></div>';
    }).join('') + '</section>';
    html += '<section class="card"><span class="tag">Coming in the next build</span><h2>Talk it through</h2><p>A counsellor that reads what keeps showing up in your entries and helps you work through it. It will listen and reflect back; it will not replace a therapist.</p></section>';
    $('p-body').innerHTML = html;
  }

  var RENDER = { write: renderWrite, gratitude: renderGratitude, mind: renderMind, patterns: renderPatterns, meditate: paintMed };
  function renderCurrent() {
    if (dirty[current] && RENDER[current]) { dirty[current] = 0; RENDER[current](); }
    else if (current === 'gratitude') { gTL.measure(); }
    else if (current === 'mind') { mTL.measure(); }
  }
  function show(id) {
    current = id;
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (p) { p.classList.toggle('active', p.id === 'page-' + id); });
    if (RENDER[id]) { dirty[id] = 1; }
    renderCurrent();
    paintOrbLabels();
  }

  /* ---------- the eclipse and its moons ---------- */
  var PAGES = [
    { id: 'write', name: 'Write', icon: 'edit' },
    { id: 'gratitude', name: 'Gratitude', icon: 'auto_awesome' },
    { id: 'mind', name: 'Master your Mind', icon: 'psychology' },
    { id: 'meditate', name: 'Meditate', icon: 'self_improvement' },
    { id: 'affirm', name: 'Affirmations', icon: 'favorite' },
    { id: 'patterns', name: 'Patterns', icon: 'insights' }
  ];
  var ANGLES = [-90, -30, 30, 90, 150, 210];
  var orbsEl = $('orbs'), ecl = $('eclipse'), navOpen = false;
  orbsEl.innerHTML = PAGES.map(function (p, i) {
    return '<div class="orb" data-i="' + i + '" style="--delay:' + (140 + i * 40) + 'ms"><div class="orb-bob" style="--bob:' + (4.8 + (i * 0.9) % 2.4).toFixed(1) + 's;--bobd:' + (-i * 1.6).toFixed(1) + 's"><button type="button" class="moon" data-page="' + p.id + '" aria-label="Open ' + p.name + '" tabindex="-1"><span class="msr" aria-hidden="true">' + iconSvg(p.icon) + '</span></button><span class="orb-label" aria-hidden="true">' + p.name + '</span></div></div>';
  }).join('');
  var orbEls = orbsEl.querySelectorAll('.orb'), moonEls = orbsEl.querySelectorAll('.moon'), labelEls = orbsEl.querySelectorAll('.orb-label');
  var probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  var G = { cx: 0, cy: 0, R: 142, pos: [] };
  function layout() {
    var W = app.clientWidth, H = app.clientHeight, bottom = probe.offsetHeight || 0;
    G.cx = W / 2; G.cy = Math.round(H * 0.46); G.R = Math.min(142, W / 2 - 50);
    G.pos = ANGLES.map(function (deg, i) {
      var a = deg * Math.PI / 180, x = G.cx + G.R * Math.cos(a), y = G.cy + G.R * Math.sin(a);
      var el = orbEls[i];
      el.style.left = Math.round(x - 32) + 'px'; el.style.top = Math.round(y - 32) + 'px';
      el.style.setProperty('--dx', Math.round((G.cx - x) * 0.7) + 'px'); el.style.setProperty('--dy', Math.round((G.cy - y) * 0.7) + 'px');
      return { x: x, y: y };
    });
    ecl.style.left = (G.cx - 90) + 'px'; ecl.style.top = (G.cy - 90) + 'px';
    var mx = W - 20 - 32, my = H - 24 - bottom - 32;
    ecl.style.setProperty('--mx', Math.round(mx - G.cx) + 'px'); ecl.style.setProperty('--my', Math.round(my - G.cy) + 'px');
    $('nav-hint').style.top = Math.round(G.cy + G.R + 76) + 'px';
    if (navOpen || reduceMotion) { light(); }
  }
  window.addEventListener('resize', layout);
  function pageName(id) { for (var i = 0; i < PAGES.length; i++) { if (PAGES[i].id === id) { return PAGES[i].name; } } return ''; }
  function paintOrbLabels() {
    PAGES.forEach(function (p, i) { labelEls[i].style.fontWeight = p.id === current ? '600' : '500'; });
    $('nav-hint').textContent = 'Tap the eclipse to go back to ' + pageName(current);
    ecl.setAttribute('aria-label', navOpen ? 'Go back to ' + pageName(current) : 'Open the eclipse');
  }
  function openNav() {
    if (navOpen) { return; }
    stopListening();
    navOpen = true;
    app.classList.add('nav-open');
    $('nav').setAttribute('aria-hidden', 'false');
    Array.prototype.forEach.call(moonEls, function (m) { m.tabIndex = 0; });
    paintOrbLabels();
    pushLayer(function () { closeNav(true); });
    light();
  }
  function closeNav(fromBack) {
    if (!navOpen) { return; }
    navOpen = false;
    app.classList.remove('nav-open');
    $('nav').setAttribute('aria-hidden', 'true');
    Array.prototype.forEach.call(moonEls, function (m) { m.tabIndex = -1; });
    paintOrbLabels();
    if (!fromBack) { popLayer(); }
  }
  ecl.addEventListener('click', function () { if (navOpen) { closeNav(); } else { openNav(); } });
  orbsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.moon');
    if (!b || !navOpen) { return; }
    var r = b.getBoundingClientRect(), ar = app.getBoundingClientRect(), grow = $('grow');
    grow.style.left = (r.left - ar.left) + 'px'; grow.style.top = (r.top - ar.top) + 'px';
    grow.classList.remove('go'); void grow.offsetWidth; grow.classList.add('go');
    app.classList.add('via-orb');
    show(b.getAttribute('data-page'));
    closeNav();
    setTimeout(function () { app.classList.remove('via-orb'); }, 950);
  });

  // The bright point on the eclipse's edge is the sun. Circles near it light up; the far ones fall into shadow.
  var rot = 0, lastT = 0, rotEl = $('e-rot');
  function mix(a, b, k) { return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * k) + ',' + Math.round(a[1] + (b[1] - a[1]) * k) + ',' + Math.round(a[2] + (b[2] - a[2]) * k) + ')'; }
  function light() {
    var sa = (225 + rot) * Math.PI / 180, sx = G.cx + 64 * Math.cos(sa), sy = G.cy + 64 * Math.sin(sa);
    for (var i = 0; i < G.pos.length; i++) {
      var p = G.pos[i], vx = sx - p.x, vy = sy - p.y, d = Math.sqrt(vx * vx + vy * vy) || 1, ux = vx / d, uy = vy / d;
      var k = Math.pow(Math.max(0, Math.min(1, (G.R + 64 - d) / 128)), 1.6);
      var m = moonEls[i];
      m.style.background = 'radial-gradient(circle at ' + (50 + ux * 32).toFixed(0) + '% ' + (50 + uy * 32).toFixed(0) + '%, ' + mix([24, 21, 40], [74, 66, 118], k) + ' 0%, ' + mix([12, 11, 20], [24, 21, 42], k) + ' 55%, #08070E 85%)';
      m.style.boxShadow = 'inset ' + (-ux * (2 + k * 2)).toFixed(1) + 'px ' + (-uy * (2 + k * 2)).toFixed(1) + 'px ' + (3 + k * 3).toFixed(1) + 'px -2px rgba(240,235,255,' + (0.12 + k * 0.78).toFixed(2) + '), inset 0 0 0 1px rgba(210,200,255,' + (0.03 + k * 0.2).toFixed(2) + '), ' + (ux * 6).toFixed(1) + 'px ' + (uy * 6).toFixed(1) + 'px 18px -6px rgba(246,222,170,' + (0.04 + k * 0.42).toFixed(2) + '), 0 10px 22px rgba(0,0,0,.6)';
      m.style.color = 'rgba(237,232,255,' + (0.62 + k * 0.38).toFixed(2) + ')';
      labelEls[i].style.color = 'rgba(222,215,240,' + (0.6 + k * 0.4).toFixed(2) + ')';
    }
  }
  function frame(t) {
    if (!reduceMotion && t - lastT > 33) {
      rot = (rot + (lastT ? (t - lastT) : 0) / 1000 * 18) % 360;
      lastT = t;
      rotEl.setAttribute('transform', 'rotate(' + rot.toFixed(2) + ' 90 90)');
      if (navOpen) { light(); }
    } else if (!lastT) { lastT = t; }
    requestAnimationFrame(frame);
  }

  /* ---------- start ---------- */
  layout();
  paintCloud();
  paintAccount();
  paintMed();
  show('write');
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { layout(); if (current === 'gratitude') { gTL.measure(); } if (current === 'mind') { mTL.measure(); } }); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  window.Still2 = { data: function () { return JSON.parse(JSON.stringify(DB)); }, sync: syncNow, show: show };
})();
