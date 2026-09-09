const elements = {
    form: document.getElementById('report-form'),
    previewText: document.getElementById('preview-text'),
    submitBtn: document.getElementById('submit-btn'),
    copyBtn: document.getElementById('copy-btn'),
    clientsContainer: document.getElementById('clients-container'),
    resetBtn: document.getElementById('reset-template-btn')
};

let isTemplateEdited = false;

// Oferta selecionada: 'fsp' | 'efsp'
let selectedOferta = null;
// Se é a primeira notificação: true | false | null
let selectedPrimeiraNotificacao = null;

// ─── Exposta para o inline do index.html ───────────────────────────────────────
window._onOfertaSelected = function(oferta, isPrimeira) {
    selectedOferta = oferta;
    selectedPrimeiraNotificacao = isPrimeira;
    isTemplateEdited = false;
    generateTemplate();
};

window.updatePreview = function() { generateTemplate(); };

window._resetTemplate = function() {
    isTemplateEdited = false;
    elements.previewText.classList.remove('edited-template');
    elements.resetBtn.style.display = 'none';
    generateTemplate();
};

// ─── Lê dados de um grupo de cliente pelo ID do grupo ──────────────────────────
function getClientData(index) {
    const clientNameInput = document.getElementById(`client${index}`);
    if (!clientNameInput) return null;

    const clientName = clientNameInput.value.trim();
    if (!clientName) return null;

    const urlInputs = document.querySelectorAll(`.client${index}-url`);
    const urls = [];
    urlInputs.forEach(input => {
        const val = input.value.trim();
        if (val) urls.push(val);
    });

    if (urls.length === 0) return null;

    return { client: clientName, urls: urls };
}

// ─── Gera o template com base nos inputs ──────────────────────────────────────
function generateTemplate() {
    const groups = document.querySelectorAll('[id^="client-group-"]');
    const clientsData = [];
    groups.forEach(group => {
        const idx = group.id.replace('client-group-', '');
        const data = getClientData(idx);
        if (data) clientsData.push(data);
    });

    if (!clientsData.length) {
        if (!isTemplateEdited) {
            elements.previewText.value = 'Preencha o Nome e a URL do cliente para gerar a mensagem.';
        }
        elements.submitBtn.disabled = true;
        elements.copyBtn.disabled = true;
        return;
    }

    if (isTemplateEdited) {
        elements.submitBtn.disabled = false;
        elements.copyBtn.disabled = false;
        return;
    }

    elements.previewText.value = buildTemplate(clientsData);
    elements.submitBtn.disabled = false;
    elements.copyBtn.disabled = false;
}

// ─── Construção do texto da denúncia ─────────────────────────────────────────
function getAdminTemplateText(key) {
    try {
        const raw = localStorage.getItem('rg_templates');
        if (!raw) return null;
        const tpls = JSON.parse(raw);
        return tpls[key] && tpls[key].trim() ? tpls[key] : null;
    } catch { return null; }
}

function buildTemplate(clientsData) {
    const clientNames = clientsData.map(c => c.client).join(', ');
    const isFirst = selectedPrimeiraNotificacao !== false;

    const totalUrls = clientsData.reduce((sum, c) => sum + c.urls.length, 0);
    const isSingular = totalUrls === 1;
    const profileWord = isSingular ? 'profile' : 'profiles';
    const isAre = isSingular ? 'is' : 'are';
    const thisTheseProfile = isSingular ? 'this profile' : 'these profiles';
    const itThem = isSingular ? 'it' : 'them';
    const bulletLines = clientsData.flatMap(c => c.urls.map(u => `- ${u}`)).join('\n');

    // Verificar template customizado do admin
    const adminKey = `${selectedOferta}_${isFirst ? 'first' : 'renot'}`;
    const adminTpl = getAdminTemplateText(adminKey);
    if (adminTpl) {
        return adminTpl
            .replace(/\{clientNames\}/g, clientNames)
            .replace(/\{bulletLines\}/g, bulletLines)
            .replace(/\{profileWord\}/g, profileWord)
            .replace(/\{isAre\}/g, isAre)
            .replace(/\{thisTheseProfile\}/g, thisTheseProfile)
            .replace(/\{itThem\}/g, itThem);
    }

    if (selectedOferta === 'fsp') {
        if (isFirst) {
            return `Hello Trust & Safety Team,\n\nWe are writing on behalf of ${clientNames} to report fake ${profileWord} that ${isAre} impersonating our client(s) without authorization.\n\nThese ${profileWord} ${isAre} violating the platform's Terms of Service by using protected brand names, logos, and identities to mislead users and cause reputational damage.\n\nInfringing ${profileWord}:\n${bulletLines}\n\nWe kindly request the immediate removal of ${thisTheseProfile} from the platform.\n\nThank you for your prompt attention to this matter.`;
        }
        return `Hello Trust & Safety Team,\n\nWe are following up on a previous report regarding fake ${profileWord} impersonating ${clientNames}.\n\nDespite our prior complaint, ${thisTheseProfile} ${isAre} still active on the platform and continue to harm our client(s) and mislead users.\n\nInfringing ${profileWord}:\n${bulletLines}\n\nWe urge you to take immediate action and remove ${thisTheseProfile} as soon as possible.\n\nThank you.`;
    }

    if (selectedOferta === 'efsp') {
        if (isFirst) {
            return `Dear Trust & Safety Team,\n\nWe are writing on behalf of our client to report fake executive ${profileWord} that ${isAre} fraudulently using the name and image of ${clientNames} to deceive and scam users.\n\nThese ${profileWord} ${isAre} actively conducting financial fraud and are in direct violation of the platform's Terms of Service.\n\nFraudulent ${profileWord}:\n${bulletLines}\n\nWe respectfully request the immediate suspension and removal of ${thisTheseProfile} from the platform. This matter is urgent, as users are being actively harmed.\n\nThank you for your swift action.`;
        }
        return `Dear Trust & Safety Team,\n\nThis is a follow-up to our previous report regarding fake executive ${profileWord} using the identity of ${clientNames} to commit fraud on your platform.\n\nDespite our prior report, ${thisTheseProfile} ${isAre} still operating and causing ongoing harm to victims.\n\nFraudulent ${profileWord}:\n${bulletLines}\n\nWe strongly urge immediate removal of ${thisTheseProfile}. Users continue to be scammed through these accounts.\n\nThank you.`;
    }

    // Fallback
    if (clientsData.length === 1) {
        return `Dear Trust & Safety Team,\n\nThe following ${profileWord} ${isAre} using the brand ${clientsData[0].client} to commit scams:\n\n${bulletLines}\n\nWe kindly request the removal of ${itThem} from the platform.\n\nThank you.`;
    }
    const listText = clientsData.map(item => `- ${item.client}:\n  ${item.urls.join('\n  ')}`).join('\n\n');
    return `Dear Trust & Safety Team,\n\nThe following ${profileWord} ${isAre} using our clients' brands to commit scams:\n\n${listText}\n\nWe kindly request the removal of ${itThem} from the platform.\n\nThank you.`;
}

// ─── Edição manual do template ────────────────────────────────────────────────
elements.previewText.addEventListener('input', () => {
    isTemplateEdited = true;
    elements.previewText.classList.add('edited-template');
    elements.resetBtn.style.display = 'inline-block';

    const groups = document.querySelectorAll('[id^="client-group-"]');
    let hasData = false;
    groups.forEach(group => {
        const idx = group.id.replace('client-group-', '');
        if (getClientData(idx)) hasData = true;
    });
    elements.submitBtn.disabled = !hasData;
    elements.copyBtn.disabled = !hasData;
});

elements.resetBtn.addEventListener('click', () => {
    window._resetTemplate();
});

// ─── Event delegation nos inputs de clientes ──────────────────────────────────
elements.clientsContainer.addEventListener('input', generateTemplate);

// ─── Envio do template ──────────────────────────────────────────────────────
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : '';

elements.submitBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    const groups = document.querySelectorAll('[id^="client-group-"]');
    let hasData = false;
    groups.forEach(group => {
        const idx = group.id.replace('client-group-', '');
        if (getClientData(idx)) hasData = true;
    });

    if (!hasData) {
        alert('Por favor, preencha o Nome e a URL principal de pelo menos um cliente.');
        return;
    }

    const message = elements.previewText.value;
    const originalText = elements.submitBtn.innerHTML;
    elements.submitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l-5.46-1.5"/></svg> Enviando…`;
    elements.submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/send-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ message, oferta: selectedOferta, isPrimeira: selectedPrimeiraNotificacao !== false })
        });
        const data = await response.json();

        if (data.success) {
            elements.submitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Enviado!`;
            elements.submitBtn.style.background = '#10B981';
            setTimeout(() => {
                elements.submitBtn.innerHTML = originalText;
                elements.submitBtn.style.background = '';
                elements.submitBtn.disabled = false;
            }, 3000);
        } else {
            throw new Error(data.error || 'Erro desconhecido');
        }
    } catch (error) {
        alert('Erro ao enviar: ' + error.message);
        elements.submitBtn.innerHTML = originalText;
        elements.submitBtn.disabled = false;
    }
});

// ─── Copiar mensagem ──────────────────────────────────────────────────────────
elements.copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const message = elements.previewText.value;
    if (!message) return;

    navigator.clipboard.writeText(message).then(() => {
        const orig = elements.copyBtn.innerHTML;
        elements.copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copiado!`;
        elements.copyBtn.style.color = '#10B981';
        elements.copyBtn.style.borderColor = '#10B981';
        setTimeout(() => {
            elements.copyBtn.innerHTML = orig;
            elements.copyBtn.style.color = '';
            elements.copyBtn.style.borderColor = '';
        }, 2000);
    }).catch(() => alert('Erro ao copiar. Seu navegador pode não suportar esta função.'));
});

// ─── Sessão via token assinado no servidor ────────────────────────────────────
const SESSION_TOKEN_KEY = 'gt_token';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function saveToken(token) { try { sessionStorage.setItem(SESSION_TOKEN_KEY, token); } catch {} }
function getToken() { try { return sessionStorage.getItem(SESSION_TOKEN_KEY) || null; } catch { return null; } }
function clearToken() {
    try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch {}
    try { localStorage.removeItem('gt_session'); } catch {}
}
function authHeaders() {
    const t = getToken();
    return t ? { 'x-session-token': t } : {};
}

// ─── Mostrar app após login ───────────────────────────────────────────────────
function onLoginSuccess(token, isAdmin, userEmail) {
    saveToken(token);
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('open-admin-btn').style.display = isAdmin ? 'flex' : 'none';
    if (userEmail) {
        const initials = userEmail.slice(0, 2).toUpperCase();
        document.getElementById('user-pill-avatar').textContent = initials;
        document.getElementById('user-pill-name').textContent = userEmail.split('@')[0];
    }
}

// ─── Login passo 1 / 2 ────────────────────────────────────────────────────────
let _pending2faToken = null;

function showLoginStep(step) {
    document.getElementById('login-step-1').style.display = step === 1 ? 'block' : 'none';
    document.getElementById('login-step-2').style.display = step === 2 ? 'block' : 'none';
    if (step === 2) {
        document.getElementById('login-2fa-code').value = '';
        document.getElementById('login-2fa-error').style.display = 'none';
        setTimeout(() => document.getElementById('login-2fa-code').focus(), 100);
    }
}

document.getElementById('login-btn').addEventListener('click', async () => {
    const userVal  = document.getElementById('login-username').value.trim();
    const passVal  = document.getElementById('login-password').value.trim();
    const errorMsg = document.getElementById('login-error');
    errorMsg.style.display = 'none';

    if (!userVal || !passVal) {
        errorMsg.textContent = 'Preencha usuário e senha.';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        const resp = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userVal, password: passVal })
        });
        const data = await resp.json();

        if (data.success && data.requires2fa) {
            _pending2faToken = data.tempToken;
            showLoginStep(2);
        } else if (data.success) {
            onLoginSuccess(data.token, data.isAdmin, userVal);
        } else {
            errorMsg.textContent = data.error || 'E-mail ou senha incorretos.';
            errorMsg.style.display = 'block';
        }
    } catch {
        errorMsg.textContent = 'Não foi possível conectar ao servidor.';
        errorMsg.style.display = 'block';
    }
});

document.getElementById('login-2fa-btn').addEventListener('click', async () => {
    const code  = document.getElementById('login-2fa-code').value.trim();
    const errEl = document.getElementById('login-2fa-error');
    errEl.style.display = 'none';

    if (!/^\d{6}$/.test(code)) {
        errEl.textContent = 'O código deve ter 6 dígitos numéricos.';
        errEl.style.display = 'block';
        return;
    }
    try {
        const resp = await fetch(`${API_BASE}/api/2fa/verify-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tempToken: _pending2faToken, code })
        });
        const data = await resp.json();
        if (data.success) {
            _pending2faToken = null;
            onLoginSuccess(data.token, data.isAdmin, '');
        } else {
            errEl.textContent = data.error || 'Código incorreto.';
            errEl.style.display = 'block';
        }
    } catch {
        errEl.textContent = 'Erro de conexão. Tente novamente.';
        errEl.style.display = 'block';
    }
});

document.getElementById('login-2fa-code').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('login-2fa-btn').click();
});

document.getElementById('login-2fa-back').addEventListener('click', (e) => {
    e.preventDefault();
    _pending2faToken = null;
    showLoginStep(1);
});

document.getElementById('login-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
});

// ─── Alternar login / cadastro ────────────────────────────────────────────────
document.getElementById('show-register-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('register-overlay').style.display = 'flex';
});

document.getElementById('show-login-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-overlay').style.display = 'none';
    document.getElementById('login-overlay').style.display = 'flex';
});

// ─── Cadastro ─────────────────────────────────────────────────────────────────
document.getElementById('register-btn').addEventListener('click', async () => {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    const msg = document.getElementById('register-message');

    const showMsg = (text, isError) => {
        msg.textContent = text;
        msg.style.color = isError ? 'var(--color-error)' : '#10B981';
        msg.style.display = 'block';
    };

    if (!email) { showMsg('Digite um e-mail ou usuário.', true); return; }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        showMsg('A senha deve ter no mínimo 8 caracteres, uma letra e um número.', true); return;
    }
    if (password !== passwordConfirm) { showMsg('As senhas não coincidem.', true); return; }

    try {
        const resp = await fetch(`${API_BASE}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await resp.json();
        if (data.success) {
            showMsg('Solicitação enviada! Aguarde a aprovação do administrador.', false);
            document.getElementById('register-email').value = '';
            document.getElementById('register-password').value = '';
            document.getElementById('register-password-confirm').value = '';
        } else {
            showMsg(data.error || 'Erro ao solicitar cadastro.', true);
        }
    } catch {
        showMsg('Não foi possível conectar ao servidor. Ele está rodando?', true);
    }
});

// ─── Modal Minha Conta ────────────────────────────────────────────────────────
// open-admin-btn navega diretamente para admin.html (tratado via onclick no HTML)
document.getElementById('close-admin-btn').addEventListener('click', () => {
    document.getElementById('admin-overlay').style.display = 'none';
});

// ─── Logout ───────────────────────────────────────────────────────────────────
window._doLogout = async function() {
    const token = getToken();
    if (token) {
        fetch(`${API_BASE}/api/session/logout`, { method: 'POST', headers: authHeaders() }).catch(() => {});
    }
    clearToken();
    location.reload();
};

// ─── Restore de sessão ────────────────────────────────────────────────────────
(async function restoreSessionOnLoad() {
    const token = getToken();
    if (!token) return;

    try {
        const resp = await fetch(`${API_BASE}/api/session/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-session-token': token }
        });
        const data = await resp.json();

        if (data.success) {
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('app-shell').style.display = 'flex';
            document.getElementById('open-admin-btn').style.display = data.isAdmin ? 'flex' : 'none';
            if (data.email) {
                const initials = data.email.slice(0, 2).toUpperCase();
                document.getElementById('user-pill-avatar').textContent = initials;
                document.getElementById('user-pill-name').textContent = data.email.split('@')[0];
            }
        } else {
            clearToken();
        }
    } catch {
        clearToken();
    }
})();

// ─── Minha Conta: carregar 2FA ao abrir o modal ───────────────────────────────
// load2faStatus é chamada pelo user-pill click (inline no HTML)

// ─── 2FA ─────────────────────────────────────────────────────────────────────
async function load2faStatus() {
    try {
        const r = await fetch(`${API_BASE}/api/2fa/status`, { headers: authHeaders() });
        const d = await r.json();
        render2faStatus(d.enabled, d.enabledAt);
    } catch {
        document.getElementById('twofa-current-status').textContent = 'Erro ao carregar status do 2FA.';
    }
}

function render2faStatus(enabled, enabledAt) {
    const statusEl  = document.getElementById('twofa-current-status');
    const toggleBtn = document.getElementById('twofa-toggle-btn');
    const setupSec  = document.getElementById('twofa-setup-section');
    const disableSec = document.getElementById('twofa-disable-section');
    setupSec.style.display = 'none';
    disableSec.style.display = 'none';

    if (enabled) {
        statusEl.innerHTML = `<span style="color:var(--color-success)">2FA ativo</span>${enabledAt ? ` <span style="font-size:.8rem;color:var(--color-text-light);">desde ${new Date(enabledAt).toLocaleDateString('pt-BR')}</span>` : ''}`;
        statusEl.style.borderColor = 'rgba(63,185,80,.4)';
        toggleBtn.textContent = 'Desativar 2FA';
        toggleBtn.style.background = 'var(--color-error)';
    } else {
        statusEl.innerHTML = `<span style="color:var(--color-text-light)">2FA desativado</span>`;
        statusEl.style.borderColor = 'rgba(227,162,26,.3)';
        toggleBtn.textContent = 'Ativar 2FA';
        toggleBtn.style.background = '';
    }
}

document.getElementById('twofa-toggle-btn')?.addEventListener('click', async () => {
    const r = await fetch(`${API_BASE}/api/2fa/status`, { headers: authHeaders() });
    const d = await r.json();
    if (d.enabled) {
        document.getElementById('twofa-status-section').style.display = 'none';
        document.getElementById('twofa-disable-section').style.display = 'block';
    } else {
        try {
            const sr = await fetch(`${API_BASE}/api/2fa/setup`, { method: 'POST', headers: authHeaders() });
            const sd = await sr.json();
            if (!sd.success) { alert(sd.error); return; }
            document.getElementById('twofa-status-section').style.display = 'none';
            document.getElementById('twofa-setup-section').style.display = 'block';
            document.getElementById('twofa-secret-display').textContent = sd.secret;
            document.getElementById('twofa-enable-code').value = '';
            document.getElementById('twofa-enable-msg').style.display = 'none';
            const qrDiv = document.getElementById('twofa-qr');
            qrDiv.innerHTML = '';
            if (typeof QRCode !== 'undefined') {
                new QRCode(qrDiv, { text: sd.uri, width: 180, height: 180, colorDark: '#E6EDF3', colorLight: '#161B22' });
            } else {
                qrDiv.textContent = 'QR Code indisponível. Use a chave manual.';
            }
        } catch { alert('Erro ao iniciar setup de 2FA.'); }
    }
});

document.getElementById('twofa-enable-btn')?.addEventListener('click', async () => {
    const code  = document.getElementById('twofa-enable-code').value.trim();
    const msgEl = document.getElementById('twofa-enable-msg');
    if (!/^\d{6}$/.test(code)) {
        msgEl.textContent = 'Digite 6 dígitos numéricos.';
        msgEl.style.color = 'var(--color-error)';
        msgEl.style.display = 'block';
        return;
    }
    const r = await fetch(`${API_BASE}/api/2fa/enable`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ code })
    });
    const d = await r.json();
    if (d.success) {
        document.getElementById('twofa-setup-section').style.display = 'none';
        document.getElementById('twofa-status-section').style.display = 'block';
        render2faStatus(true, new Date().toISOString());
    } else {
        msgEl.textContent = d.error || 'Código inválido.';
        msgEl.style.color = 'var(--color-error)';
        msgEl.style.display = 'block';
    }
});

document.getElementById('twofa-setup-cancel')?.addEventListener('click', () => {
    document.getElementById('twofa-setup-section').style.display = 'none';
    document.getElementById('twofa-status-section').style.display = 'block';
});

document.getElementById('twofa-disable-btn')?.addEventListener('click', async () => {
    const code  = document.getElementById('twofa-disable-code').value.trim();
    const msgEl = document.getElementById('twofa-disable-msg');
    if (!/^\d{6}$/.test(code)) {
        msgEl.textContent = 'Digite 6 dígitos numéricos.';
        msgEl.style.color = 'var(--color-error)';
        msgEl.style.display = 'block';
        return;
    }
    const r = await fetch(`${API_BASE}/api/2fa/disable`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ code })
    });
    const d = await r.json();
    if (d.success) {
        document.getElementById('twofa-disable-section').style.display = 'none';
        document.getElementById('twofa-status-section').style.display = 'block';
        render2faStatus(false, null);
    } else {
        msgEl.textContent = d.error || 'Código inválido.';
        msgEl.style.color = 'var(--color-error)';
        msgEl.style.display = 'block';
    }
});

document.getElementById('twofa-disable-cancel')?.addEventListener('click', () => {
    document.getElementById('twofa-disable-section').style.display = 'none';
    document.getElementById('twofa-status-section').style.display = 'block';
});

// Admin: logs e gerenciamento movidos para admin.html

// ─── Histórico de denúncias ───────────────────────────────────────────────────
window._loadHistory = async function() {
    const cont = document.getElementById('history-list');
    if (!cont) return;
    // skeleton
    cont.innerHTML = `<div style="display:flex;flex-direction:column;gap:.65rem;">
        <div class="skeleton" style="height:72px;"></div>
        <div class="skeleton" style="height:72px;opacity:.7;"></div>
        <div class="skeleton" style="height:72px;opacity:.4;"></div>
    </div>`;
    try {
        const resp = await fetch(`${API_BASE}/api/reports`, { headers: authHeaders() });
        const data = await resp.json();
        if (!data.success) {
            cont.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg width="22" height="22" fill="none" stroke="var(--color-error)" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="empty-title">Erro ao carregar</div><div class="empty-desc">${data.error}</div></div>`;
            return;
        }
        if (!data.reports.length) {
            cont.innerHTML = `<div class="empty-state">
                <div class="empty-icon"><svg width="22" height="22" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
                <div class="empty-title">Nenhuma denúncia ainda</div>
                <div class="empty-desc">Suas denúncias enviadas aparecerão aqui. Comece pela opção "Nova Denúncia".</div>
                <button class="chip" onclick="setView('home')" style="margin-top:.5rem;">Fazer primeira denúncia →</button>
            </div>`;
            return;
        }
        const ofertaLabel = { fsp: 'FSP', efsp: 'EFSP' };
        cont.innerHTML = data.reports.map((r, i) => `
            <div class="hist-card" style="animation-delay:${i * 0.05}s;">
                <div style="flex-shrink:0;padding-top:.1rem;">
                    <span class="hist-badge${r.isPrimeira ? '' : ' renot'}">${ofertaLabel[r.oferta] || r.oferta}</span>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;">
                        <span style="font-weight:700;font-size:.85rem;color:var(--color-text);">${r.isPrimeira ? 'Primeira notificação' : 'Renotificação'}</span>
                        <span class="hist-meta" style="white-space:nowrap;">${new Date(r.sentAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                    <div class="hist-preview">${r.preview || '-'}</div>
                </div>
            </div>`).join('');
    } catch { cont.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--color-error);">Erro de conexão</div><div class="empty-desc">Não foi possível carregar o histórico.</div></div>'; }
};

// ─── Export CSV de logs ───────────────────────────────────────────────────────
window._exportLogsCsv = async function() {
    try {
        const resp = await fetch(`${API_BASE}/api/admin/logs?limit=500`, { headers: authHeaders() });
        const data = await resp.json();
        if (!data.success) { alert(data.error || 'Erro ao exportar.'); return; }

        const header = ['Hora', 'IP', 'Método', 'Path', 'Status', 'ms', 'E-mail'];
        const rows = data.logs.map(l => [
            new Date(l.ts).toLocaleString('pt-BR'),
            l.ip || '', l.method, l.path, l.status, l.ms, l.email || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        const csv = [header.join(','), ...rows].join('\r\n');

        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `logs_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { alert('Erro ao exportar CSV.'); }
};
