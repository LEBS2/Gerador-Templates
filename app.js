/* app.js - lógica da view (separado do inline para garantir escopo global limpo) */
/* Nota: script.js declara `let selectedOferta` no escopo global - usamos nomes diferentes aqui para evitar SyntaxError de redeclaração */
var _appOferta   = '';
var _appPrimeira = '';
var clientCount  = 0;

/* ── Toast ──────────────────────────────────────────────────────────────── */
function toast(msg, type) {
    type = type || 'info';
    var t = document.createElement('div');
    t.className = 'toast-item ' + type;
    t.textContent = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(function(){ t.remove(); }, 4000);
}

/* ── Progress bar ───────────────────────────────────────────────────────── */
function updateProgress(view) {
    var steps  = ['prog-1','prog-2','prog-3'];
    var lines  = ['prog-line-1','prog-line-2'];
    var active = view === 'home' ? 0 : view === 'report' ? 2 : -1;
    steps.forEach(function(id, i) {
        var el = document.getElementById(id);
        if (!el) return;
        el.className = 'prog-step' + (i < active ? ' done' : i === active ? ' active' : '');
        if (i < active) el.querySelector('.prog-num').innerHTML = '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
        else el.querySelector('.prog-num').textContent = i + 1;
    });
    lines.forEach(function(id, i) {
        var el = document.getElementById(id);
        if (el) el.className = 'prog-line' + (i < active ? ' done' : '');
    });
}

/* ── View ────────────────────────────────────────────────────────────────── */
function setView(view) {
    ['home','report','history'].forEach(function(v) {
        var el = document.getElementById('view-' + v);
        if (el) {
            el.style.display = v === view ? 'block' : 'none';
            if (v === view) { el.style.animation = 'none'; void el.offsetHeight; el.style.animation = 'fadeInUp .3s ease both'; }
        }
    });
    document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
    var navMap = { home: 'nav-home', report: 'nav-report', history: 'nav-history' };
    var el = document.getElementById(navMap[view]);
    if (el) el.classList.add('active');
    updateProgress(view);
    if (view === 'history' && typeof window._loadHistory === 'function') window._loadHistory();
}

/* ── Report flow ─────────────────────────────────────────────────────────── */
function startReport(tipo) {
    _appOferta   = tipo;
    _appPrimeira = '';
    ['home','report','history'].forEach(function(v) {
        var el = document.getElementById('view-' + v);
        if (el) el.style.display = v === 'home' ? 'block' : 'none';
    });
    document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
    var nh = document.getElementById('nav-home');
    if (nh) nh.classList.add('active');
    document.querySelectorAll('.cat-card').forEach(function(c){ c.classList.remove('selected'); });
    var cardMap = { fsp: 'cat-fsp', efsp: 'cat-efsp' };
    var card = document.getElementById(cardMap[tipo]);
    if (card) card.classList.add('selected');
    var area = document.getElementById('step2-area');
    if (!area) return;
    area.style.display = 'block';
    area.style.animation = 'none'; void area.offsetHeight; area.style.animation = 'fadeInUp .3s ease both';
    var nf = document.getElementById('notif-first');
    var nr = document.getElementById('notif-renot');
    if (nf) nf.classList.remove('selected');
    if (nr) nr.classList.remove('selected');
    var btn = document.getElementById('step2-continue');
    if (btn) { btn.disabled = true; btn.style.opacity = '.4'; }
    var prog2 = document.getElementById('prog-2');
    if (prog2) { prog2.className = 'prog-step active'; prog2.querySelector('.prog-num').textContent = '2'; }
    var line1 = document.getElementById('prog-line-1');
    if (line1) line1.className = 'prog-line done';
    /* rola imediatamente (sem smooth) para o passo 2 ficar visível */
    setTimeout(function(){
        area.scrollIntoView({ behavior: 'instant', block: 'nearest' });
        toast('Agora escolha o tipo de notificação abaixo ↓', 'info');
    }, 80);
}

function selectNotif(val) {
    _appPrimeira = val;
    var nf = document.getElementById('notif-first');
    var nr = document.getElementById('notif-renot');
    if (nf) nf.classList.toggle('selected', val === 'sim');
    if (nr) nr.classList.toggle('selected', val === 'nao');
    var btn = document.getElementById('step2-continue');
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
}

function goToReport() {
    if (!_appOferta || !_appPrimeira) return;
    var labels = { fsp: 'FSP', efsp: 'EFSP' };
    var badge = document.getElementById('offer-ind-badge');
    var txt   = document.getElementById('offer-ind-text');
    if (badge) { badge.textContent = labels[_appOferta] || _appOferta.toUpperCase(); badge.className = 'offer-badge'; }
    if (txt)   { txt.textContent = _appPrimeira === 'sim' ? 'Primeira notificação' : 'Renotificação'; }
    clientCount = 0;
    var cc = document.getElementById('clients-container');
    if (cc) cc.innerHTML = '';
    addClient();
    setView('report');
    if (typeof window._onOfertaSelected === 'function') {
        window._onOfertaSelected(_appOferta, _appPrimeira === 'sim');
    }
}

function showHowItWorks() {
    var m = document.getElementById('how-it-works-modal');
    if (m) m.style.display = 'flex';
}

function showNotifDiff() {
    var m = document.getElementById('notif-diff-modal');
    if (m) m.style.display = 'flex';
}

/* ── Client counter ──────────────────────────────────────────────────────── */
function addClient() {
    clientCount++;
    var n = clientCount;
    var container = document.getElementById('clients-container');
    if (!container) return;
    var sep = n > 1 ? '<div class="client-sep"></div>' : '';
    var div = document.createElement('div');
    div.id = 'client-group-' + n;
    div.innerHTML = sep +
        '<div class="client-header">Cliente ' + n +
        (n > 1 ? '<button class="remove-client-btn" onclick="removeClient(' + n + ')">✕ Remover</button>' : '') +
        '</div>' +
        '<div class="form-row"><div class="form-label">Nome da marca <span style="color:var(--error)">*</span></div>' +
        '<input type="text" id="client' + n + '" class="form-input" placeholder="Nome do cliente…"></div>' +
        '<div class="form-row"><div class="form-label">URL principal <span style="color:var(--error)">*</span></div>' +
        '<div><input type="url" class="client' + n + '-url form-input" placeholder="https://…">' +
        '<div id="extra-urls-' + n + '"></div>' +
        '<button type="button" class="add-url-link" onclick="addUrlField(' + n + ')">' +
        '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        ' Adicionar outra URL</button></div></div>';
    container.appendChild(div);
    if (typeof updatePreview === 'function') updatePreview();
}

function removeClient(n) {
    var el = document.getElementById('client-group-' + n);
    if (el) el.remove();
    if (typeof updatePreview === 'function') updatePreview();
}

function addUrlField(n) {
    var extra = document.getElementById('extra-urls-' + n);
    if (!extra) return;
    var inp = document.createElement('input');
    inp.type = 'url'; inp.placeholder = 'https://…';
    inp.className = 'client' + n + '-url form-input';
    inp.style.marginTop = '.4rem';
    extra.appendChild(inp);
    if (typeof updatePreview === 'function') updatePreview();
}

function resetTemplate() {
    if (typeof window._resetTemplate === 'function') window._resetTemplate();
}

/* ── Theme ───────────────────────────────────────────────────────────────── */
(function() {
    var html = document.documentElement;
    var btn  = document.getElementById('theme-btn');
    function apply(t) {
        html.setAttribute('data-theme', t);
        var moon = document.getElementById('th-moon');
        var sun  = document.getElementById('th-sun');
        if (moon) moon.style.display = t === 'light' ? 'none' : '';
        if (sun)  sun.style.display  = t === 'light' ? '' : 'none';
        try { localStorage.setItem('rg_theme', t); } catch(_){}
    }
    try { var s = localStorage.getItem('rg_theme'); if (s) apply(s); } catch(_){}
    if (btn) btn.addEventListener('click', function() {
        apply(html.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    });
})();

/* ── User pill → Minha Conta ─────────────────────────────────────────────── */
(function() {
    var pill = document.getElementById('user-pill');
    if (pill) pill.addEventListener('click', function() {
        var ov = document.getElementById('admin-overlay');
        if (ov) ov.style.display = 'flex';
        if (typeof load2faStatus === 'function') load2faStatus();
    });
})();
