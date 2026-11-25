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
  function timeLabel(d) { try { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); } catch (e) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); } }
  function plural(n, one) { return n + ' ' + (n === 1 ? one : one + 's'); }
  function dayInfo(d, count, noun) {
    var today = startOfDay(new Date());
    var diff = Math.round((today - startOfDay(d)) / 86400000);
    var md = MONTHS[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== today.getFullYear() ? ', ' + d.getFullYear() : '');
    var title = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : WEEKDAYS[d.getDay()];
    var sub = (diff <= 1 ? WEEKDAYS[d.getDay()] + ', ' : '') + md + ' · ' + plural(count, noun);
    return { num: d.getDate(), title: title, sub: sub, label: WEEKDAYS[d.getDay()] + ', ' + md + ' · ' + plural(count, noun) };
  }

  var toastTimer = null, toastAct = null;
  function toast(text, action) {
    var t = $('toast');
    t.innerHTML = '<span>' + esc(text) + '</span>' + (action ? '<button type="button" class="toast-act">' + esc(action.label) + '</button>' : '');
    toastAct = action ? action.run : null;
    t.classList.toggle('actionable', !!action);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); t.classList.remove('actionable'); toastAct = null; }, action ? 6000 : 2600);
  }
  document.getElementById('toast').addEventListener('click', function (e) {
    if (!e.target.closest('.toast-act') || !toastAct) { return; }
    var run = toastAct; toastAct = null; run();
  });

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
    var m = { id: uid(), text: text, at: now, updated_at: now, source: source === 'voice' ? 'voice' : 'typed', synced: false };
    DB.moments.unshift(m);
    persist(); keepStorage(); dirtyAll(); syncSoon(400);
    return m;
  }
  function addMind(kind, text) {
    var now = new Date().toISOString();
    var m = { id: uid(), kind: kind, text: text, at: now, updated_at: now, synced: false };
    DB.mind.unshift(m);
    persist(); keepStorage(); dirtyAll(); syncSoon(400);
    return m;
  }
  // Entries are always looked up by id: a sync can swap the object for a fresh copy.
  function listFor(table) { return table === 'moments' ? DB.moments : DB.mind; }
  function findEntry(table, id) { var l = listFor(table); for (var i = 0; i < l.length; i++) { if (l[i].id === id) { return l[i]; } } return null; }
  function touch(m) { m.updated_at = new Date().toISOString(); m.synced = false; persist(); dirtyAll(); syncSoon(400); }
  // Removing marks the entry, so the removal backs up like any other change.
  function removeEntry(table, id) {
    var m = findEntry(table, id);
    if (!m) { return null; }
    var snap = JSON.parse(JSON.stringify(m));
    m.deleted_at = new Date().toISOString(); touch(m);
    return snap;
  }
  function restoreEntry(table, snap) {
    var m = findEntry(table, snap.id);
    if (!m) { m = JSON.parse(JSON.stringify(snap)); listFor(table).push(m); listFor(table).sort(function (a, b) { return ms(b.at) - ms(a.at); }); }
    m.text = snap.text; if (snap.kind) { m.kind = snap.kind; }
    m.deleted_at = null; touch(m);
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
    clearTimeout(toastTimer); $('toast').classList.remove('show'); $('toast').classList.remove('actionable'); toastAct = null;
    pushLayer(function () { closeSheet(id, true); });
    if (focusId) { setTimeout(function () { try { $(focusId).focus({ preventScroll: true }); } catch (e) {} }, 380); }
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
  var SVGNS = 'http://www.w3.org/2000/svg';
  Timeline.prototype.render = function (html) {
    var gid = 'tlg-' + this.tl.id;
    this.tl.innerHTML = '<svg class="tl-svg" aria-hidden="true"><defs><linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="tl-stop-a"></stop><stop offset="1" class="tl-stop-b"></stop></linearGradient></defs><path class="tl-track-path"></path><path class="tl-lit-path" stroke="url(#' + gid + ')"></path></svg><span class="tl-head"></span>' + html;
    this.svg = this.tl.querySelector('.tl-svg'); this.grad = this.tl.querySelector('linearGradient');
    this.trackPath = this.tl.querySelector('.tl-track-path'); this.litPath = this.tl.querySelector('.tl-lit-path'); this.headEl = this.tl.querySelector('.tl-head');
    this.measure();
  };
  Timeline.prototype.measure = function () {
    var els = this.tl.querySelectorAll('[data-node]'), nodes = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i], isDay = el.classList.contains('tl-day');
      var y = isDay ? el.offsetTop + el.querySelector('.tl-medal').offsetTop + 28 : el.offsetTop + 20;
      var x = isDay ? 36 : (parseFloat(el.style.getPropertyValue('--x')) || 36);
      nodes.push({ el: el, x: x, y: y, day: isDay, label: el.getAttribute('data-label'), lit: null, near: null });
    }
    this.nodes = nodes;
    var len = [0], d = '';
    for (var j = 0; j < nodes.length; j++) {
      d += (j ? ' L' : 'M') + nodes[j].x + ' ' + nodes[j].y;
      if (j) { var dx = nodes[j].x - nodes[j - 1].x, dy = nodes[j].y - nodes[j - 1].y; len.push(len[j - 1] + Math.sqrt(dx * dx + dy * dy)); }
    }
    this.len = len; this.total = len[len.length - 1] || 0;
    if (this.svg) {
      this.svg.setAttribute('height', String(Math.max(1, this.tl.scrollHeight)));
      this.trackPath.setAttribute('d', nodes.length > 1 ? d : '');
      this.litPath.setAttribute('d', nodes.length > 1 ? d : '');
    }
    this.first = nodes.length ? nodes[0].y : 0; this.last = nodes.length ? nodes[nodes.length - 1].y : 0;
    this.update();
  };
  Timeline.prototype.update = function () {
    var top = this.scroll.scrollTop, litY = top + this.scroll.clientHeight * 0.42, label = '', nodes = this.nodes;
    var litLen = 0, hx = 36, hy = this.first;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], lit = n.y < litY, near = !n.day && lit && litY - n.y < 70;
      if (lit !== n.lit) { n.el.classList.toggle('lit', lit); n.lit = lit; }
      if (near !== n.near) { n.el.classList.toggle('near', near); n.near = near; }
      if (n.day && (n.y <= top + 70 || !label)) { label = n.label; }
      if (lit) {
        var nx = nodes[i + 1];
        if (nx && nx.y > litY) {
          var f = (litY - n.y) / Math.max(1, nx.y - n.y);
          litLen = this.len[i] + f * (this.len[i + 1] - this.len[i]); hx = n.x + f * (nx.x - n.x); hy = litY;
        } else if (!nx) { litLen = this.total; hx = n.x; hy = n.y; }
      }
    }
    if (this.litPath) {
      this.litPath.setAttribute('stroke-dasharray', litLen.toFixed(1) + ' ' + (this.total + 20).toFixed(1));
      this.grad.setAttribute('y1', String(this.first)); this.grad.setAttribute('y2', String(Math.max(this.first + 1, hy)));
    }
    if (this.headEl) {
      this.headEl.style.transform = 'translate(' + (hx - 5).toFixed(1) + 'px,' + (hy - 5).toFixed(1) + 'px)';
      this.headEl.style.opacity = nodes.length > 1 && litY > this.first && litY < this.last ? '1' : '0';
    }
    if (this.current) { this.current.textContent = label; }
  };
  // Stars sit left and right of the line in turn, so the line zigzags. The id keeps each star where it was.
  function zigX(j, id) {
    var h = 0, s = String(id || j);
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return 36 + (j % 2 === 0 ? 1 : -1) * (7 + h % 12);
  }

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

  // Gratitude and the five Master your Mind kinds, in the order the Write wheel shows them
  var KINDS = {
    gratitude: { label: 'Gratitude', short: 'gratitude', color: '#EEC56C', on: '#3F2D00', q: 'What are you grateful for?', ask: 'Write it down, or tap the mic and say it' },
    others: { label: 'Thinking of others', short: 'thinking of others', color: '#7DDBA8', on: '#0B3A22', q: 'Who did you think of today?', ask: 'Who did you think of, and what did you do?' },
    angry: { label: 'Angry', short: 'angry', color: '#FF8A7A', on: '#4A0F07', q: 'What made you angry?', ask: 'Where did it land, and on whom?' },
    afraid: { label: 'Afraid', short: 'afraid', color: '#8AB6FF', on: '#0B2A5E', q: 'What are you afraid of?', ask: 'What were you protecting?' },
    selfish: { label: 'Selfish', short: 'selfish', color: '#FFB15C', on: '#3E2200', q: 'Where were you selfish?', ask: 'Who carried it instead of you?' },
    resentful: { label: 'Resentful', short: 'resentful', color: '#E89BEF', on: '#3D0B44', q: 'What are you resentful about?', ask: 'What went unsaid?' }
  };
  var KIND_ORDER = ['others', 'angry', 'afraid', 'selfish', 'resentful'];
  var HARD = ['afraid', 'angry', 'selfish', 'resentful'];
  var WRITE_ORDER = ['gratitude'].concat(KIND_ORDER);
  function hexMix(a, b, k) {
    var pa = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); }), pb = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
    return '#' + pa.map(function (v, i) { return ('0' + Math.round(v + (pb[i] - v) * k).toString(16)).slice(-2); }).join('');
  }

  // Write
  function clockLabel(d) { try { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); } catch (e) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); } }
  function renderWrite() {
    var now = new Date();
    $('w-date').textContent = WEEKDAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()];
    $('w-clock').textContent = clockLabel(now);
  }
  // the clock under the date ticks every second while Write is open
  var clockTimer = null;
  function runClock() {
    clearTimeout(clockTimer);
    if (current !== 'write' || document.visibilityState === 'hidden') { return; }
    var now = new Date();
    $('w-clock').textContent = clockLabel(now);
    if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0) { renderWrite(); }
    clockTimer = setTimeout(runClock, 1000 - now.getMilliseconds() + 5);
  }
  document.addEventListener('visibilitychange', runClock);

  // the kind wheel: swipe up or down; when it stops, the one in the middle locks in and Write takes its colour
  var wKind = 'gratitude', kwEl = $('w-kinds'), kwTick = false, kwSettle = null, kwFirst = true;
  kwEl.innerHTML = '<div class="kw-row">' + WRITE_ORDER.map(function (k) {
    return '<button type="button" class="kw-item" data-k="' + k + '" style="--c:' + KINDS[k].color + '" aria-pressed="false" tabindex="-1"><i></i>' + esc(KINDS[k].label) + '</button>';
  }).join('') + '</div>';
  var kwItems = kwEl.querySelectorAll('.kw-item');
  function kwCenter(el) { return el.offsetTop + el.offsetHeight / 2; }
  function paintKindWheel() {
    var mid = kwEl.scrollTop + kwEl.clientHeight / 2;
    for (var i = 0; i < kwItems.length; i++) {
      var dy = kwCenter(kwItems[i]) - mid, d = Math.min(110, Math.abs(dy));
      kwItems[i].style.opacity = (1 - d / 110 * 0.72).toFixed(3);
      kwItems[i].style.transform = 'perspective(320px) rotateX(' + (-Math.max(-110, Math.min(110, dy)) / 110 * 38).toFixed(1) + 'deg) scale(' + (1 - d / 110 * 0.16).toFixed(3) + ')';
    }
  }
  function nearestKind() {
    var mid = kwEl.scrollTop + kwEl.clientHeight / 2, best = 0, bd = 1e9;
    for (var i = 0; i < kwItems.length; i++) { var d = Math.abs(kwCenter(kwItems[i]) - mid); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function scrollKindTo(i, smooth) {
    var top = kwCenter(kwItems[i]) - kwEl.clientHeight / 2;
    if (smooth && !reduceMotion && kwEl.scrollTo) { kwEl.scrollTo({ top: top, behavior: 'smooth' }); } else { kwEl.scrollTop = top; paintKindWheel(); lockKind(i, true); }
  }
  function lockKind(i, quiet) {
    var k = WRITE_ORDER[i], K = KINDS[k], changed = k !== wKind;
    for (var j = 0; j < kwItems.length; j++) {
      var on = j === i;
      kwItems[j].classList.toggle('on', on);
      kwItems[j].setAttribute('aria-pressed', String(on));
      kwItems[j].tabIndex = on ? 0 : -1;
    }
    wKind = k;
    var page = $('page-write');
    page.style.setProperty('--wk', K.color); page.style.setProperty('--wk-on', K.on);
    var label = k === 'gratitude' ? 'Save moment' : 'Save as ' + K.short;
    $('w-save').textContent = label; $('w-listen-save').textContent = label;
    $('w-text').placeholder = K.ask;
    $('w-text-label').textContent = k === 'gratitude' ? 'Your moment' : 'What happened';
    var ask = $('w-ask');
    if (changed && !quiet && !reduceMotion) {
      ask.classList.add('swap');
      setTimeout(function () { ask.textContent = K.q; ask.classList.remove('swap'); }, 160);
    } else { ask.textContent = K.q; }
    $('bf0').setAttribute('stop-color', k === 'gratitude' ? '#FFF4D6' : hexMix(K.color, '#FFFFFF', 0.72));
    $('bf1').setAttribute('stop-color', k === 'gratitude' ? '#F2CF7E' : K.color);
    $('bf2').setAttribute('stop-color', k === 'gratitude' ? '#C9A0E8' : hexMix(K.color, '#9D90E6', 0.55));
    $('w-glow').style.background = 'radial-gradient(circle, ' + hexMix(K.color, '#100E1B', 0.1) + '8C, rgba(157, 144, 230, .25) 55%, transparent 72%)';
    if (changed && !quiet) { try { if (navigator.vibrate) { navigator.vibrate(10); } } catch (e) {} }
  }
  kwEl.addEventListener('scroll', function () {
    if (!kwTick) { kwTick = true; requestAnimationFrame(function () { kwTick = false; paintKindWheel(); }); }
    for (var j = 0; j < kwItems.length; j++) { kwItems[j].classList.remove('on'); }
    clearTimeout(kwSettle);
    kwSettle = setTimeout(function () { lockKind(nearestKind()); }, 120);
  }, { passive: true });
  kwEl.addEventListener('click', function (e) {
    var b = e.target.closest('.kw-item');
    if (!b) { return; }
    scrollKindTo(WRITE_ORDER.indexOf(b.getAttribute('data-k')), true);
  });
  kwEl.addEventListener('keydown', function (e) {
    var step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) { return; }
    e.preventDefault();
    var i = Math.max(0, Math.min(WRITE_ORDER.length - 1, WRITE_ORDER.indexOf(wKind) + step));
    scrollKindTo(i, true);
    try { kwItems[i].focus({ preventScroll: true }); } catch (err) {}
  });
  function placeKindWheel() { if (current === 'write') { scrollKindTo(WRITE_ORDER.indexOf(wKind), false); } }
  window.addEventListener('resize', placeKindWheel);

  var usedVoice = false;
  function saveWritten(text) {
    stopListening(true);
    var k = wKind, m, table;
    if (k === 'gratitude') { m = addMoment(text, usedVoice ? 'voice' : 'typed'); table = 'moments'; }
    else { m = addMind(k, text); table = 'mind_entries'; }
    $('w-text').value = ''; usedVoice = false;
    toast(k === 'gratitude' ? 'Saved to gratitude.' : 'Saved as ' + KINDS[k].short + '.', { label: 'Undo', run: function () {
      removeEntry(table, m.id);
      toast('Removed.');
      if (!String($('w-text').value || '').trim()) { $('w-text').value = m.text; }
      renderCurrent();
    } });
  }
  $('w-save').addEventListener('click', function () {
    var ta = $('w-text'), text = String(ta.value || '').trim();
    if (!text) { toast(wKind === 'gratitude' ? 'Write something first, or tap the mic and say it.' : 'Write a few words about what happened.'); ta.focus({ preventScroll: true }); return; }
    saveWritten(text);
  });
  $('w-cloud').addEventListener('click', function () { paintAccount(); openSheet('sheet-account'); });

  // voice: a big moving blob listens, and your words appear underneath as you say them
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null, listening = false, listenOpen = false, baseText = '', finalText = '', interimText = '';
  var energy = 0, blobRaf = 0, blobT0 = 0;
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function joinText() { return [baseText, cap(finalText.trim())].filter(Boolean).join(' '); }
  function paintTranscript() {
    var main = joinText(), tail = interimText.trim();
    if (!main && tail) { tail = cap(tail); }
    if (!main && !tail) { $('w-transcript').innerHTML = '<span class="ghost">' + esc(KINDS[wKind].q) + '</span>'; return; }
    $('w-transcript').innerHTML = esc(main) + (tail ? ' <span class="interim">' + esc(tail) + '</span>' : '');
    var t = $('w-transcript'); t.scrollTop = t.scrollHeight;
  }
  function setListenState() {
    $('w-listen-state').textContent = listening ? 'Listening' : 'Paused. Tap the circle to keep talking.';
    $('w-blob').setAttribute('aria-label', listening ? 'Pause listening' : 'Keep talking');
    $('w-listen').classList.toggle('paused', !listening);
  }
  function startRec() {
    rec = new Rec();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    finalText = ''; interimText = '';
    baseText = String($('w-text').value || '').trim();
    rec.onresult = function (e) {
      var fin = '', mid = '';
      for (var i = 0; i < e.results.length; i++) { if (e.results[i].isFinal) { fin += e.results[i][0].transcript; } else { mid += e.results[i][0].transcript; } }
      var grew = (fin + mid).length - (finalText + interimText).length;
      finalText = fin; interimText = mid;
      if (fin || mid) { usedVoice = true; }
      energy = Math.min(1.6, energy + 0.25 + Math.max(0, grew) * 0.04);
      $('w-text').value = [joinText(), cap(interimText.trim())].filter(Boolean).join(' ');
      paintTranscript();
    };
    rec.onend = function () {
      listening = false;
      if (interimText) { finalText = (finalText + ' ' + interimText).trim(); interimText = ''; }
      $('w-text').value = joinText();
      if (listenOpen) { paintTranscript(); setListenState(); }
    };
    rec.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('Allow the microphone to speak your moments.'); closeListen(); }
      else if (e.error === 'network') { toast('Voice needs a connection. You can still type it.'); }
    };
    try { rec.start(); listening = true; } catch (err) { listening = false; toast('Could not start the microphone.'); }
    setListenState();
  }
  function stopListening(close) {
    if (rec && listening) { try { rec.stop(); } catch (e) {} }
    if (close) { closeListen(); }
  }
  function openListen() {
    if (!Rec) { toast('Voice is not available in this browser. Try Chrome.'); return; }
    listenOpen = true;
    app.classList.add('listening');
    $('w-listen').setAttribute('aria-hidden', 'false');
    pushLayer(function () { closeListen(true); });
    energy = 0.4;
    startRec();
    paintTranscript();
    if (!blobRaf) { blobT0 = 0; blobRaf = requestAnimationFrame(drawBlob); }
  }
  function closeListen(fromBack) {
    if (!listenOpen) { return; }
    listenOpen = false;
    if (rec && listening) { try { rec.stop(); } catch (e) {} }
    app.classList.remove('listening');
    $('w-listen').setAttribute('aria-hidden', 'true');
    if (!fromBack) { popLayer(); }
    try { $('w-mic').focus({ preventScroll: true }); } catch (e) {}
  }
  $('w-mic').addEventListener('click', openListen);
  $('w-blob').addEventListener('click', function () { if (listening) { stopListening(); } else { startRec(); } });
  $('w-listen-done').addEventListener('click', function () { closeListen(); });
  $('w-listen-save').addEventListener('click', function () {
    var text = joinText() || String($('w-text').value || '').trim();
    if (!text) { toast('Say something first, or tap Done to type it.'); return; }
    if (interimText.trim()) { text = [text, cap(interimText.trim())].join(' '); }
    saveWritten(text);
  });
  function blobPath(t, e, r0, k) {
    var pts = [], n = 72;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var w = 0.055 * Math.sin(3 * a + t * 0.9 * k) + 0.04 * Math.sin(5 * a - t * 1.3 * k + 1.1) + 0.028 * Math.sin(7 * a + t * 1.9 * k + 2.3) + 0.03 * Math.sin(2 * a - t * 0.5 * k + 0.4);
      var r = r0 * (1 + 0.025 * Math.sin(t * 0.8) + w * e);
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    var d = '';
    for (var j = 0; j < n; j++) {
      var p0 = pts[(j - 1 + n) % n], p1 = pts[j], p2 = pts[(j + 1) % n], p3 = pts[(j + 2) % n];
      if (!j) { d = 'M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1); }
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d + 'Z';
  }
  function drawBlob(ts) {
    if (!listenOpen) { blobRaf = 0; return; }
    if (!blobT0) { blobT0 = ts; }
    var t = (ts - blobT0) / 1000, rest = listening ? 0.55 : 0.18;
    energy += (rest - energy) * 0.035;
    var k = reduceMotion ? 0.25 : 1, e = reduceMotion ? Math.min(energy, 0.4) : energy;
    $('w-blob-path').setAttribute('d', blobPath(t, 1 + e * 1.6, 104 + e * 10, k));
    $('w-blob-inner').setAttribute('d', blobPath(t * 1.3 + 7, 1.4 + e * 2, 54 + e * 8, k));
    $('w-blob-inner').setAttribute('transform', 'translate(' + (-26 + 10 * Math.sin(t * 0.6 * k)).toFixed(1) + ' ' + (-30 + 8 * Math.cos(t * 0.5 * k)).toFixed(1) + ')');
    $('w-glow').style.transform = 'scale(' + (0.92 + e * 0.32).toFixed(3) + ')';
    $('w-glow').style.opacity = (0.35 + e * 0.4).toFixed(2);
    blobRaf = requestAnimationFrame(drawBlob);
  }

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
      show.forEach(function (m, j) {
        html += '<div class="tl-item" data-node data-t="moments" data-id="' + esc(m.id) + '" tabindex="0" aria-roledescription="moment. Hold to edit" style="--x:' + zigX(j, m.id) + 'px"><span class="tl-dot"></span><div class="tl-body"><span class="tl-meta">' + esc(timeLabel(new Date(m.at))) + '</span><p>' + esc(m.text) + '</p></div></div>';
      });
      if (show.length < g.items.length) {
        html += '<button type="button" class="tl-more" data-more="' + g.key + '">Show ' + (g.items.length - show.length) + ' more from ' + esc(info.title) + '</button>';
      }
    });
    gTL.render(html);
  }

  // Master your Mind
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
      show.forEach(function (m, j) {
        var k = KINDS[m.kind] || KINDS.others;
        html += '<div class="tl-item" data-node data-t="mind_entries" data-id="' + esc(m.id) + '" tabindex="0" aria-roledescription="entry. Hold to edit" style="--c:' + k.color + ';--x:' + zigX(j, m.id) + 'px"><span class="tl-dot"></span><div class="tl-body"><span class="tl-meta"><b>' + esc(k.label) + '</b>· ' + esc(timeLabel(new Date(m.at))) + '</span><p>' + esc(m.text) + '</p></div></div>';
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
    if (!text) { toast('Write a few words about what happened.'); $('mind-text').focus({ preventScroll: true }); return; }
    var m = addMind(mindKind, text);
    closeSheet('sheet-mind');
    renderMind();
    toast('Saved as ' + KINDS[mindKind].short + '.', { label: 'Undo', run: function () { removeEntry('mind_entries', m.id); toast('Removed.'); renderCurrent(); } });
  });
  $('m-add').addEventListener('click', openMindSheet);
  app.addEventListener('click', function (e) {
    var a = e.target.closest('[data-add]');
    if (a) { openMindSheet(); return; }
    var g = e.target.closest('[data-go]');
    if (g) { show(g.getAttribute('data-go')); }
  });


  // Hold an entry in Gratitude or Master your Mind to edit it
  var hold = null, editing = null, editKind = null;
  function cancelHold() { if (!hold) { return; } clearTimeout(hold.t1); clearTimeout(hold.t2); hold.el.classList.remove('holding'); hold = null; }
  function watchHolds(tlEl, scrollEl) {
    tlEl.addEventListener('pointerdown', function (e) {
      var el = e.target.closest('.tl-item[data-id]');
      if (!el || (e.pointerType === 'mouse' && e.button !== 0)) { return; }
      cancelHold();
      hold = { el: el, x: e.clientX, y: e.clientY };
      hold.t1 = setTimeout(function () { if (hold) { hold.el.classList.add('holding'); } }, 140);
      hold.t2 = setTimeout(function () {
        if (!hold) { return; }
        var h = hold; hold = null;
        try { if (navigator.vibrate) { navigator.vibrate(12); } } catch (err) {}
        openEdit(h.el.getAttribute('data-t'), h.el.getAttribute('data-id'), h.el);
        setTimeout(function () { h.el.classList.remove('holding'); }, 250);
      }, 520);
    });
    tlEl.addEventListener('pointermove', function (e) { if (hold && (Math.abs(e.clientX - hold.x) > 10 || Math.abs(e.clientY - hold.y) > 10)) { cancelHold(); } });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { tlEl.addEventListener(n, cancelHold); });
    scrollEl.addEventListener('scroll', cancelHold, { passive: true });
    tlEl.addEventListener('contextmenu', function (e) { if (e.target.closest('.tl-item[data-id]')) { e.preventDefault(); } });
    tlEl.addEventListener('keydown', function (e) {
      var el = e.target.closest && e.target.closest('.tl-item[data-id]');
      if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openEdit(el.getAttribute('data-t'), el.getAttribute('data-id'), el); }
    });
  }
  watchHolds($('g-tl'), $('g-scroll'));
  watchHolds($('m-tl'), $('m-scroll'));
  // the kind selector in the bubble: a small up-and-down wheel; tap it for the next kind
  var mwEl = $('edit-kinds'), mwSettle = null, mwQuiet = false;
  mwEl.innerHTML = '<div class="mw-row">' + KIND_ORDER.map(function (k) {
    return '<button type="button" class="mw-item" data-k="' + k + '" style="--k:' + KINDS[k].color + '" tabindex="-1"><i></i>' + esc(KINDS[k].label) + '</button>';
  }).join('') + '</div>';
  var mwItems = mwEl.querySelectorAll('.mw-item');
  function mwScrollTo(i, smooth) {
    var top = mwItems[i].offsetTop + mwItems[i].offsetHeight / 2 - mwEl.clientHeight / 2;
    if (smooth && !reduceMotion && mwEl.scrollTo) { mwEl.scrollTo({ top: top, behavior: 'smooth' }); } else { mwQuiet = true; mwEl.scrollTop = top; setTimeout(function () { mwQuiet = false; }, 60); }
  }
  function paintEditKinds() {
    var isG = editing && editing.table === 'moments', k = isG ? 'gratitude' : (editKind || 'others'), c = KINDS[k].color;
    $('sheet-edit').style.setProperty('--c', c);
    Array.prototype.forEach.call(mwItems, function (it) { var on = it.getAttribute('data-k') === k; it.classList.toggle('on', on); it.setAttribute('aria-pressed', String(on)); it.tabIndex = on ? 0 : -1; });
    var b = $('edit-when').querySelector('b');
    if (b) { b.textContent = KINDS[k].label; }
  }
  mwEl.addEventListener('scroll', function () {
    if (mwQuiet) { return; }
    clearTimeout(mwSettle);
    mwSettle = setTimeout(function () {
      var mid = mwEl.scrollTop + mwEl.clientHeight / 2, best = 0, bd = 1e9;
      for (var i = 0; i < mwItems.length; i++) { var d = Math.abs(mwItems[i].offsetTop + mwItems[i].offsetHeight / 2 - mid); if (d < bd) { bd = d; best = i; } }
      var k = KIND_ORDER[best];
      if (k !== editKind) { editKind = k; paintEditKinds(); try { if (navigator.vibrate) { navigator.vibrate(8); } } catch (e) {} }
    }, 110);
  }, { passive: true });
  mwEl.addEventListener('click', function () {
    var i = (KIND_ORDER.indexOf(editKind) + 1) % KIND_ORDER.length;
    mwScrollTo(i, true);
  });
  mwEl.addEventListener('keydown', function (e) {
    var step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) { return; }
    e.preventDefault();
    var i = Math.max(0, Math.min(KIND_ORDER.length - 1, KIND_ORDER.indexOf(editKind) + step));
    mwScrollTo(i, true);
    try { mwItems[i].focus({ preventScroll: true }); } catch (err) {}
  });
  function fitEditText() { var t = $('edit-text'); t.style.height = 'auto'; t.style.height = Math.min(168, Math.max(64, t.scrollHeight)) + 'px'; }
  $('edit-text').addEventListener('input', fitEditText);
  function openEdit(table, id, anchor) {
    var m = findEntry(table, id);
    if (!m || m.deleted_at) { return; }
    editing = { table: table, id: id };
    var isMind = table === 'mind_entries', d = new Date(m.at);
    editKind = isMind ? m.kind : null;
    var whenText = WEEKDAYS[d.getDay()].slice(0, 3) + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ', ' + timeLabel(d);
    $('edit-when').innerHTML = isMind ? esc(whenText) : '<b>Gratitude</b> · ' + esc(whenText);
    $('edit-kinds').hidden = !isMind;
    $('edit-text').value = m.text;
    paintEditKinds();
    if (isMind) { setTimeout(function () { mwScrollTo(KIND_ORDER.indexOf(editKind), false); }, 0); }
    // float the bubble up from the entry you held, kept high enough to clear the keyboard
    var bub = $('edit-bubble'), ar = app.getBoundingClientRect(), top = 96, ox = 40;
    if (anchor) {
      var r = anchor.getBoundingClientRect();
      top = Math.round(Math.max(64, Math.min(r.top - ar.top - 8, ar.height * 0.34)));
      ox = Math.round((parseFloat(anchor.style.getPropertyValue('--x')) || 36) - 14);
    }
    bub.style.top = top + 'px';
    bub.style.transformOrigin = ox + 'px 20px';
    openSheet('sheet-edit');
    fitEditText();
  }
  $('edit-save').addEventListener('click', function () {
    if (!editing) { return; }
    var m = findEntry(editing.table, editing.id), text = String($('edit-text').value || '').trim();
    if (!m) { closeSheet('sheet-edit'); return; }
    if (!text) { toast('Write something, or use Delete to remove it.'); return; }
    var table = editing.table, snap = JSON.parse(JSON.stringify(m));
    var kindChanged = table === 'mind_entries' && editKind && editKind !== m.kind;
    if (text === m.text && !kindChanged) { closeSheet('sheet-edit'); return; }
    m.text = text; if (kindChanged) { m.kind = editKind; }
    touch(m);
    closeSheet('sheet-edit');
    renderCurrent();
    toast('Changes saved.', { label: 'Undo', run: function () { restoreEntry(table, snap); toast('Changed back.'); renderCurrent(); } });
  });
  $('edit-delete').addEventListener('click', function () {
    if (!editing) { return; }
    var table = editing.table, snap = removeEntry(table, editing.id);
    closeSheet('sheet-edit');
    renderCurrent();
    if (snap) { toast(table === 'moments' ? 'Moment deleted.' : 'Entry deleted.', { label: 'Undo', run: function () { restoreEntry(table, snap); toast('Brought back.'); renderCurrent(); } }); }
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
  var MIN_OPTS = [];
  for (var mi = 1; mi <= 60; mi++) { MIN_OPTS.push(mi); }
  MIN_OPTS.push(75, 90, 120);
  var SOUNDS = ['Silence', 'Deep hum', 'Soft rain', 'Ocean waves', 'Night wind'];
  var BELLS = ['Singing bowl', 'Temple bell', 'Soft chimes', 'Deep gong', 'No bell'];
  var med = { mins: 10, sound: 'Silence', bell: 'Singing bowl', vol: 80, running: false, end: 0, timer: null, lock: null };
  try {
    var ms0 = JSON.parse(localStorage.getItem('still2-meditate') || 'null');
    if (ms0) {
      if (ms0.mins) { med.mins = ms0.mins; } else if (ms0.pick != null) { med.mins = [3, 5, 10, 20, 30][ms0.pick] || 10; }
      if (typeof ms0.sound === 'string' && SOUNDS.indexOf(ms0.sound) >= 0) { med.sound = ms0.sound; } else if (typeof ms0.sound === 'number') { med.sound = ['Silence', 'Deep hum', 'Soft rain'][ms0.sound] || 'Silence'; }
      if (typeof ms0.bell === 'string' && BELLS.indexOf(ms0.bell) >= 0) { med.bell = ms0.bell; } else if (ms0.bell === false) { med.bell = 'No bell'; }
      if (typeof ms0.vol === 'number') { med.vol = Math.max(0, Math.min(100, ms0.vol)); }
    }
  } catch (e) {}
  if (MIN_OPTS.indexOf(med.mins) < 0) { med.mins = 10; }
  function saveMed() { try { localStorage.setItem('still2-meditate', JSON.stringify({ mins: med.mins, sound: med.sound, bell: med.bell, vol: med.vol })); } catch (e) {} }

  // the minute wheel sits inside the circle: swipe up or down, the middle number is the one you get
  var wheel = $('d-wheel'), ITEM = 56, wheelIdx = MIN_OPTS.indexOf(med.mins), wheelSettle = null, wheelTick = false;
  wheel.innerHTML = '<div class="wheel-row">' + MIN_OPTS.map(function (m, i) { return '<button type="button" class="wheel-item" data-i="' + i + '" aria-label="' + plural(m, 'minute') + '" aria-pressed="false" tabindex="-1">' + m + '</button>'; }).join('') + '</div>';
  var wheelItems = wheel.querySelectorAll('.wheel-item');
  function paintWheel() {
    var c = wheel.scrollTop / ITEM;
    var lo = Math.max(0, Math.floor(c) - 3), hi = Math.min(wheelItems.length - 1, Math.ceil(c) + 3);
    for (var i = lo; i <= hi; i++) {
      var d = Math.min(1.6, Math.abs(i - c));
      wheelItems[i].style.transform = 'scale(' + (1 - d * 0.36).toFixed(3) + ')';
      wheelItems[i].style.opacity = Math.max(0.12, 1 - d * 0.62).toFixed(3);
    }
  }
  function setWheelIdx(i, quiet) {
    i = Math.max(0, Math.min(MIN_OPTS.length - 1, i));
    if (wheelItems[wheelIdx]) { wheelItems[wheelIdx].setAttribute('aria-pressed', 'false'); wheelItems[wheelIdx].tabIndex = -1; }
    wheelIdx = i;
    wheelItems[i].setAttribute('aria-pressed', 'true'); wheelItems[i].tabIndex = 0;
    if (med.mins !== MIN_OPTS[i]) { med.mins = MIN_OPTS[i]; saveMed(); }
    if (!med.running) { $('d-clock').textContent = med.mins + ':00'; if (!quiet) { $('d-sub').textContent = med.mins === 1 ? 'minute' : 'minutes'; } }
  }
  function scrollWheelTo(i, smooth) {
    var top = i * ITEM;
    if (smooth && !reduceMotion && wheel.scrollTo) { wheel.scrollTo({ top: top, behavior: 'smooth' }); } else { wheel.scrollTop = top; paintWheel(); }
  }
  wheel.addEventListener('scroll', function () {
    if (!wheelTick) { wheelTick = true; requestAnimationFrame(function () { wheelTick = false; paintWheel(); }); }
    clearTimeout(wheelSettle);
    wheelSettle = setTimeout(function () { setWheelIdx(Math.round(wheel.scrollTop / ITEM)); }, 110);
  }, { passive: true });
  wheel.addEventListener('click', function (e) {
    var b = e.target.closest('.wheel-item');
    if (!b || med.running) { return; }
    var i = +b.getAttribute('data-i'); setWheelIdx(i); scrollWheelTo(i, true);
  });
  wheel.addEventListener('keydown', function (e) {
    var step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step || med.running) { return; }
    e.preventDefault();
    setWheelIdx(wheelIdx + step); scrollWheelTo(wheelIdx, true);
    try { wheelItems[wheelIdx].focus({ preventScroll: true }); } catch (err) {}
  });

  function paintMed() {
    $('d-sound-val').textContent = med.sound;
    $('d-bell-val').textContent = med.bell;
    $('d-vol').value = med.vol;
    $('d-vol').style.setProperty('--v', med.vol + '%');
    $('d-run').textContent = med.running ? 'End' : 'Begin';
    $('d-run').classList.toggle('running', med.running);
    $('d-shape').classList.toggle('breathing', med.running);
    setWheelIdx(MIN_OPTS.indexOf(med.mins), true);
    if (current === 'meditate') { scrollWheelTo(wheelIdx, false); }
  }

  // sound: everything is made on the phone, so it works offline
  var AC = null, OUT = null, amb = null;
  function audio() {
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) { return null; }
      AC = new C();
      var comp = AC.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.4;
      OUT = AC.createGain();
      OUT.connect(comp); comp.connect(AC.destination);
      setVolume();
    }
    if (AC.state === 'suspended') { AC.resume(); }
    return AC;
  }
  function setVolume() { if (OUT) { var v = med.vol / 100; OUT.gain.setTargetAtTime(v * v * 2.2, AC.currentTime, 0.05); } }
  $('d-vol').addEventListener('input', function () { med.vol = +this.value; this.style.setProperty('--v', med.vol + '%'); setVolume(); });
  $('d-vol').addEventListener('change', saveMed);
  var NOISE = {};
  function noise(kind) {
    if (NOISE[kind]) { return NOISE[kind]; }
    var len = 4 * AC.sampleRate, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0), last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else { d[i] = w; }
    }
    var fade = Math.floor(AC.sampleRate * 0.05);
    for (var j = 0; j < fade; j++) { var k = j / fade; d[j] *= k; d[len - 1 - j] *= k; }
    NOISE[kind] = buf;
    return buf;
  }
  function stopAmbient(fast) {
    if (!amb || !AC) { return; }
    var a = amb; amb = null;
    try { a.master.gain.cancelScheduledValues(AC.currentTime); a.master.gain.setTargetAtTime(0, AC.currentTime, fast ? 0.08 : 0.5); } catch (e) {}
    setTimeout(function () { a.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} }); try { a.master.disconnect(); } catch (e) {} }, fast ? 600 : 2600);
  }
  function startAmbient(kind, fadeIn) {
    stopAmbient(true);
    var ac = audio();
    if (!ac || kind === 'Silence') { return; }
    var t = ac.currentTime, master = ac.createGain(), nodes = [];
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(1, t + (fadeIn || 2.5));
    master.connect(OUT);
    function osc(type, f, g, dest) { var o = ac.createOscillator(), gn = ac.createGain(); o.type = type; o.frequency.value = f; gn.gain.value = g; o.connect(gn); gn.connect(dest || master); o.start(); nodes.push(o); return gn; }
    function src(buf) { var s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); nodes.push(s); return s; }
    function lfo(rate, depth, param) { var o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); nodes.push(o); }
    if (kind === 'Deep hum') {
      var swell = ac.createGain(); swell.gain.value = 0.8; swell.connect(master);
      lfo(0.07, 0.18, swell.gain);
      osc('sine', 55, 0.16, swell); osc('sine', 110, 0.3, swell); osc('sine', 110.6, 0.16, swell); osc('sine', 165, 0.12, swell); osc('sine', 220, 0.06, swell); osc('triangle', 330, 0.02, swell);
    } else if (kind === 'Soft rain') {
      var hp = ac.createBiquadFilter(), lp = ac.createBiquadFilter(), g1 = ac.createGain();
      hp.type = 'highpass'; hp.frequency.value = 500; lp.type = 'lowpass'; lp.frequency.value = 7000; g1.gain.value = 0.32;
      src(noise('white')).connect(hp); hp.connect(lp); lp.connect(g1); g1.connect(master);
      var lp2 = ac.createBiquadFilter(), g2 = ac.createGain(); lp2.type = 'lowpass'; lp2.frequency.value = 900; g2.gain.value = 0.5;
      src(noise('brown')).connect(lp2); lp2.connect(g2); g2.connect(master);
    } else if (kind === 'Ocean waves') {
      var wl = ac.createBiquadFilter(), wg = ac.createGain();
      wl.type = 'lowpass'; wl.frequency.value = 650; wl.Q.value = 0.4; wg.gain.value = 0.5;
      src(noise('brown')).connect(wl); wl.connect(wg); wg.connect(master);
      lfo(0.09, 450, wl.frequency); lfo(0.09, 0.42, wg.gain);
      var foam = ac.createBiquadFilter(), fg = ac.createGain(); foam.type = 'bandpass'; foam.frequency.value = 2500; foam.Q.value = 0.5; fg.gain.value = 0.04;
      src(noise('white')).connect(foam); foam.connect(fg); fg.connect(master); lfo(0.09, 0.035, fg.gain);
    } else if (kind === 'Night wind') {
      var bp = ac.createBiquadFilter(), bg = ac.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 1.6; bg.gain.value = 0.7;
      src(noise('brown')).connect(bp); bp.connect(bg); bg.connect(master);
      lfo(0.045, 260, bp.frequency); lfo(0.031, 0.3, bg.gain);
    }
    amb = { master: master, nodes: nodes };
  }
  function strike(t, parts, decay, attack) {
    parts.forEach(function (p) {
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = 'sine'; o.frequency.value = p[0];
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p[1], t + (attack || 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t + decay * (p[2] || 1));
      o.connect(g); g.connect(OUT); o.start(t); o.stop(t + decay * (p[2] || 1) + 0.1);
    });
  }
  function ring(kind, once) {
    var ac = audio();
    if (!ac || kind === 'No bell') { return; }
    var t = ac.currentTime + 0.05, n = once ? 1 : 3, i;
    for (i = 0; i < n; i++) {
      var at = t + i * (kind === 'Soft chimes' ? 2.4 : 4.5), lvl = 1 - i * 0.18;
      if (kind === 'Singing bowl') {
        strike(at, [[216, 0.42 * lvl], [216.8, 0.2 * lvl], [586, 0.16 * lvl, 0.7], [587.4, 0.08 * lvl, 0.7], [1112, 0.06 * lvl, 0.45], [1780, 0.025 * lvl, 0.3]], 12, 0.02);
      } else if (kind === 'Temple bell') {
        strike(at, [[196, 0.22 * lvl], [392, 0.36 * lvl, 0.8], [466, 0.14 * lvl, 0.6], [588, 0.12 * lvl, 0.5], [784, 0.1 * lvl, 0.4], [1176, 0.04 * lvl, 0.25]], 9, 0.004);
      } else if (kind === 'Soft chimes') {
        [523.25, 659.25, 783.99, 1046.5].forEach(function (f, j) { strike(at + j * 0.32, [[f, 0.2 * lvl], [f * 2.01, 0.05 * lvl, 0.5]], 4.5, 0.004); });
      } else if (kind === 'Deep gong') {
        strike(at, [[73, 0.4 * lvl], [111, 0.24 * lvl, 0.9], [148, 0.16 * lvl, 0.8], [200, 0.1 * lvl, 0.6], [248, 0.07 * lvl, 0.5], [391, 0.03 * lvl, 0.35]], 16, 0.12);
      }
    }
  }

  // choosing a sound or bell: tap one to hear it
  var pick = null, previewTimer = null;
  function openPicker(kind) {
    pick = kind;
    var list = kind === 'sound' ? SOUNDS : BELLS, cur = kind === 'sound' ? med.sound : med.bell;
    $('pick-title').textContent = kind === 'sound' ? 'Sound while you sit' : 'Bell at the end';
    $('pick-list').innerHTML = list.map(function (name) {
      var on = name === cur;
      return '<button type="button" class="pick-row" role="radio" aria-checked="' + on + '" data-name="' + esc(name) + '"><span>' + esc(name) + '</span><span class="msr pick-check" aria-hidden="true">' + iconSvg('check') + '</span></button>';
    }).join('');
    openSheet('sheet-pick');
  }
  function stopPreview() { clearTimeout(previewTimer); if (!med.running) { stopAmbient(true); } }
  $('pick-list').addEventListener('click', function (e) {
    var b = e.target.closest('.pick-row');
    if (!b) { return; }
    var name = b.getAttribute('data-name');
    Array.prototype.forEach.call($('pick-list').children, function (r) { r.setAttribute('aria-checked', String(r === b)); });
    if (pick === 'sound') {
      med.sound = name;
      if (med.running) { startAmbient(name, 1.2); }
      else { startAmbient(name, 0.6); clearTimeout(previewTimer); previewTimer = setTimeout(function () { if (!med.running) { stopAmbient(); } }, 5000); }
    } else {
      med.bell = name; ring(name, true);
    }
    saveMed(); paintMed();
  });
  Array.prototype.forEach.call(document.querySelectorAll('#sheet-pick [data-close]'), function (el) { el.addEventListener('click', stopPreview); });
  $('d-sound').addEventListener('click', function () { audio(); openPicker('sound'); });
  $('d-bell').addEventListener('click', function () { audio(); openPicker('bell'); });

  // a session: everything else fades away, just the circle and the countdown
  function focusShift() {
    var s = $('d-shape'), page = $('page-meditate');
    s.style.removeProperty('--fy');
    var sr = s.getBoundingClientRect(), pr = page.getBoundingClientRect();
    s.style.setProperty('--fy', Math.round((pr.top + pr.height * 0.45) - (sr.top + sr.height / 2)) + 'px');
  }
  function keepAwake() {
    try {
      if (!navigator.wakeLock) { return; }
      navigator.wakeLock.request('screen').then(function (l) {
        med.lock = l;
        l.addEventListener('release', function () { if (med.lock === l) { med.lock = null; } });
      }).catch(function () {});
    } catch (e) {}
  }
  function tick() {
    var left = Math.max(0, Math.round((med.end - Date.now()) / 1000));
    $('d-clock').textContent = Math.floor(left / 60) + ':' + pad(left % 60);
    if (left <= 0) { finishMed(true); }
  }
  function finishMed(done, fromBack) {
    if (!med.running) { return; }
    clearInterval(med.timer); med.timer = null; med.running = false;
    stopAmbient();
    if (done) { ring(med.bell); }
    try { if (med.lock) { med.lock.release(); } } catch (e) {}
    med.lock = null;
    app.classList.remove('focus');
    if (!fromBack) { popLayer(); }
    paintMed();
    $('d-sub').textContent = done ? 'Done. Well sat.' : (med.mins === 1 ? 'minute' : 'minutes');
    $('d-clock').textContent = done ? '0:00' : med.mins + ':00';
  }
  $('d-run').addEventListener('click', function () {
    if (med.running) { finishMed(false); return; }
    audio();
    focusShift();
    med.running = true; med.end = Date.now() + med.mins * 60000;
    app.classList.add('focus');
    pushLayer(function () { finishMed(false, true); });
    $('d-sub').textContent = 'Breathe in, and out';
    startAmbient(med.sound);
    keepAwake();
    med.timer = setInterval(tick, 250);
    paintMed(); tick();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && med.running && !med.lock) { keepAwake(); }
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
    runClock();
    if (id === 'write') { placeKindWheel(); }
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
    stopListening(true);
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

  app.addEventListener('scroll', function () { if (app.scrollTop || app.scrollLeft) { app.scrollTop = 0; app.scrollLeft = 0; } });
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
