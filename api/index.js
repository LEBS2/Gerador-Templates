require('dotenv').config();

const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const { sendTelegramNotification } = require('../lib/telegram');
// KV com fallback in-memory para desenvolvimento local sem Vercel KV
let kv;
const KV_AVAILABLE = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
if (KV_AVAILABLE) {
    kv = require('@vercel/kv').kv;
} else {
    // Fallback in-memory (nao persiste entre restarts, apenas para testes locais)
    console.warn('[kv] KV_REST_API_URL/TOKEN nao definidos - usando armazenamento em memoria (apenas dev)');
    const _store = new Map();
    kv = {
        get: async (k) => { const r = _store.get(k); if (!r) return null; if (r.exp && Date.now() > r.exp) { _store.delete(k); return null; } return r.v; },
        set: async (k, v, opts) => { _store.set(k, { v, exp: opts?.ex ? Date.now() + opts.ex * 1000 : null }); },
        del: async (k) => { _store.delete(k); },
    };
}

const app = express();

// --- Env ---
const ADMIN_USER     = process.env.ADMIN_USER;
const ADMIN_PASS     = process.env.ADMIN_PASS;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;
const APP_NAME       = process.env.APP_NAME || 'GeradorTemplates';

// --- KV keys ---
const USERS_KEY      = 'gt_users';
const LOGS_KEY       = 'gt_logs';
const ADMIN_LOGS_KEY = 'gt_admin_logs';
const REPORTS_KEY    = 'gt_reports';
const TEMPLATES_KEY  = 'gt_templates';
const MAX_LOGS       = 500;
const MAX_REPORTS    = 1000;
const TPL_KEYS       = ['fsp_first', 'fsp_renot', 'efsp_first', 'efsp_renot'];
const MAX_TPL_LEN    = 5000;
const SESSION_TTL    = 60 * 60 * 8;   // 8 h
const TEMP_2FA_TTL   = 60 * 5;        // 5 min

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: usuários
// ─────────────────────────────────────────────────────────────────────────────
async function loadUsers() {
    const u = await kv.get(USERS_KEY);
    return Array.isArray(u) ? u : [];
}
async function saveUsers(users) { await kv.set(USERS_KEY, users); }

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
}
function verifyPassword(password, salt, hash) {
    try {
        const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
        return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'));
    } catch { return false; }
}

function isStrongPassword(password) {
    // min 10 chars, letra maiuscula, minuscula, numero e simbolo
    return password.length >= 10
        && /[A-Z]/.test(password)
        && /[a-z]/.test(password)
        && /[0-9]/.test(password)
        && /[^A-Za-z0-9]/.test(password);
}

// Gera uma senha temporaria forte e aleatoria (sempre passa em isStrongPassword)
// - usada pelo admin ao resetar a senha de um usuario.
function generateTempPassword() {
    const UPPER   = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I/O (evita confusao visual)
    const LOWER   = 'abcdefghijkmnpqrstuvwxyz';
    const DIGITS  = '23456789';
    const SYMBOLS = '!@#$%&*-_+=?';
    const ALL     = UPPER + LOWER + DIGITS + SYMBOLS;
    const pick = (set) => set[crypto.randomInt(set.length)];

    const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
    while (chars.length < 14) chars.push(pick(ALL));

    // embaralha (Fisher-Yates) usando RNG criptografico
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: TOTP (RFC 6238) - zero dependencias externas
// ─────────────────────────────────────────────────────────────────────────────
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(s) {
    let bits = 0, value = 0;
    const output = [];
    for (const c of s.toUpperCase().replace(/=+$/, '')) {
        const idx = B32_ALPHABET.indexOf(c);
        if (idx < 0) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) { bits -= 8; output.push((value >>> bits) & 0xff); }
    }
    return Buffer.from(output);
}

function base32Encode(buf) {
    let bits = 0, value = 0, out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) { bits -= 5; out += B32_ALPHABET[(value >>> bits) & 31]; }
    }
    if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

function generateTotpSecret() {
    return base32Encode(crypto.randomBytes(20)); // 160-bit secret
}

function totpCode(secret, counter) {
    const key = base32Decode(secret);
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(counter));
    const hmac  = crypto.createHmac('sha1', key).update(buf).digest();
    const off   = hmac[hmac.length - 1] & 0x0f;
    return ((hmac.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

function totpVerify(secret, code) {
    const cleaned = String(code).replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleaned)) return false;
    const t = Math.floor(Date.now() / 1000 / 30);
    for (let d = -1; d <= 1; d++) { // +/- 30s drift
        const expected = totpCode(secret, t + d);
        if (crypto.timingSafeEqual(Buffer.from(cleaned), Buffer.from(expected))) return true;
    }
    return false;
}

function totpUri(secret, email) {
    const label = encodeURIComponent(`${APP_NAME}:${email}`);
    const issuer = encodeURIComponent(APP_NAME);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: sessao
// ─────────────────────────────────────────────────────────────────────────────
function signToken(payload) {
    const data = JSON.stringify(payload);
    const sig  = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
    return Buffer.from(data).toString('base64url') + '.' + sig;
}
function verifyToken(token) {
    try {
        const [b64, sig] = token.split('.');
        if (!b64 || !sig) return null;
        const data     = Buffer.from(b64, 'base64url').toString();
        const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
        return JSON.parse(data);
    } catch { return null; }
}
// `epoch` amarra a sessao a versao atual da senha do usuario (user.sessionEpoch).
// Quando o admin reseta a senha (ou o usuario a troca), o epoch e incrementado e
// todas as sessoes antigas (criadas com o epoch anterior) passam a ser invalidas.
async function createSession(email, isAdmin, epoch = 0) {
    const token = signToken({ email, isAdmin, iat: Date.now() });
    await kv.set(`gt_sess:${token}`, { email, isAdmin, epoch }, { ex: SESSION_TTL });
    return token;
}
async function getSession(token) {
    if (!token) return null;
    const payload = verifyToken(token);
    if (!payload) return null;
    const sess = await kv.get(`gt_sess:${token}`);
    if (!sess) return null;

    // Admin via env nao tem registro em gt_users - nao se aplica o controle de epoch.
    if (!(ADMIN_USER && sess.email === ADMIN_USER)) {
        const users       = await loadUsers();
        const user        = users.find(u => u.email === sess.email);
        const currentEpoch = user?.sessionEpoch || 0;
        if ((sess.epoch || 0) !== currentEpoch) {
            await kv.del(`gt_sess:${token}`); // sessao obsoleta (senha foi resetada/trocada)
            return null;
        }
    }
    return sess;
}
async function deleteSession(token) {
    if (token) await kv.del(`gt_sess:${token}`);
}

// Temp token apenas para o segundo fator do 2FA (5 min, single-use)
async function createTemp2faToken(email, isAdmin) {
    const token = 'tmp_' + crypto.randomBytes(24).toString('hex');
    await kv.set(`gt_2fa:${token}`, { email, isAdmin }, { ex: TEMP_2FA_TTL });
    return token;
}
async function consumeTemp2faToken(token) {
    if (!token || !token.startsWith('tmp_')) return null;
    const data = await kv.get(`gt_2fa:${token}`);
    if (data) await kv.del(`gt_2fa:${token}`); // single-use
    return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: account lockout
// ─────────────────────────────────────────────────────────────────────────────
const MAX_FAIL_ATTEMPTS = 5;
const LOCKOUT_SECONDS   = 15 * 60; // 15 min

async function recordFailedLogin(users, user, saveUsersFn) {
    user.failedAttempts  = (user.failedAttempts || 0) + 1;
    user.lastFailedLogin = new Date().toISOString();
    if (user.failedAttempts >= MAX_FAIL_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_SECONDS * 1000).toISOString();
    }
    await saveUsersFn(users);
}

async function clearFailedLogin(users, user, saveUsersFn) {
    user.failedAttempts = 0;
    user.lockedUntil    = null;
    await saveUsersFn(users);
}

function isLockedOut(user) {
    if (!user.lockedUntil) return false;
    return new Date(user.lockedUntil) > new Date();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: logs
// ─────────────────────────────────────────────────────────────────────────────
async function writeLog(entry) {
    try {
        const logs = await kv.get(LOGS_KEY) || [];
        logs.unshift({ ...entry, ts: new Date().toISOString() });
        if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
        await kv.set(LOGS_KEY, logs);
    } catch { /* log failure must never break the request */ }
}

async function writeAdminLog(entry) {
    try {
        const logs = await kv.get(ADMIN_LOGS_KEY) || [];
        logs.unshift({ ...entry, ts: new Date().toISOString() });
        if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
        await kv.set(ADMIN_LOGS_KEY, logs);
    } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: rate limit via KV
// ─────────────────────────────────────────────────────────────────────────────
async function checkRateLimit(key, max, windowSec) {
    const k   = `gt_rl:${key}`;
    const now = Date.now();
    let   rec = await kv.get(k) || { count: 0, reset: now + windowSec * 1000 };
    if (now > rec.reset) rec = { count: 0, reset: now + windowSec * 1000 };
    rec.count++;
    await kv.set(k, rec, { ex: windowSec + 10 });
    return rec.count > max;
}

function getIp(req) {
    // Só confiar em X-Forwarded-For quando atrás de proxy confiável (Vercel)
    if (process.env.VERCEL) {
        return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    }
    return req.socket?.remoteAddress || 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware: redireciona domínio .vercel.app antigo para o domínio custom
// ─────────────────────────────────────────────────────────────────────────────
const OLD_HOST = 'gerador-templates-4foj.vercel.app';
const NEW_ORIGIN = 'https://geradortemplates.com.br';
app.use((req, res, next) => {
    if (req.headers.host === OLD_HOST) {
        return res.redirect(308, NEW_ORIGIN + req.originalUrl);
    }
    next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Middleware: CORS
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    const origin  = req.headers.origin || '';
    const allowed = ALLOWED_ORIGIN
        ? origin === ALLOWED_ORIGIN
        : (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('vercel.app') || !origin);

    if (allowed || !origin) res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
    res.header('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Middleware: security headers
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';"
    );
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Middleware: CSRF - rejeita POST sem Content-Type: application/json (impede form POST cross-origin)
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const ct = req.headers['content-type'] || '';
        // Aceita requests sem body (content-length 0 ou ausente) - ex: /logout, /2fa/setup
        const hasBody = (req.headers['content-length'] && req.headers['content-length'] !== '0')
            || req.headers['transfer-encoding'];
        if (hasBody && !ct.includes('application/json')) {
            return res.status(415).json({ success: false, error: 'Content-Type deve ser application/json.' });
        }
    }
    next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Middleware: access log
// ─────────────────────────────────────────────────────────────────────────────
app.use(async (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        if (!req.path.startsWith('/api/')) return;
        const token   = req.headers['x-session-token'];
        const payload = token ? verifyToken(token) : null;
        writeLog({
            ip:     getIp(req),
            method: req.method,
            path:   req.path,
            status: res.statusCode,
            ms:     Date.now() - start,
            ua:     (req.headers['user-agent'] || '').slice(0, 120),
            email:  payload?.email || null,
        });
    });
    next();
});

app.use(express.json({ limit: '64kb' }));

// Bloqueia acesso direto a arquivos sensiveis
const BLOCKED_FILES = /\.(env|json|md|sh|log|gitignore|example)$|^\/package|^\/vercel|^\/\.|\bREADME\b/i;
app.use((req, res, next) => {
    if (BLOCKED_FILES.test(req.path)) return res.status(404).end();
    next();
});

app.use(express.static(path.join(__dirname, '..'), {
    setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
        }
        if (/\.(js|css)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    },
    // Nao serve arquivos ocultos (dotfiles)
    dotfiles: 'deny',
}));

// ─────────────────────────────────────────────────────────────────────────────
// Middleware: auth
// ─────────────────────────────────────────────────────────────────────────────
async function requireSession(req, res, next) {
    const sess = await getSession(req.headers['x-session-token']);
    if (!sess) return res.status(401).json({ success: false, error: 'Sessao invalida ou expirada. Faca login novamente.' });
    req.session = sess;
    next();
}

async function requireAdmin(req, res, next) {
    const sess = await getSession(req.headers['x-session-token']);
    if (!sess || !sess.isAdmin) return res.status(403).json({ success: false, error: 'Nao autorizado.' });
    req.session = sess;
    next();
}


// =============================================================================
// ROTAS PUBLICAS
// =============================================================================

// Verificar sessao
app.post('/api/session/verify', async (req, res) => {
    const sess = await getSession(req.headers['x-session-token']);
    if (!sess) return res.status(401).json({ success: false });
    res.json({ success: true, email: sess.email, isAdmin: sess.isAdmin });
});

// Logout
app.post('/api/session/logout', async (req, res) => {
    await deleteSession(req.headers['x-session-token']);
    res.json({ success: true });
});

// Login (fator 1 - email + senha)
app.post('/api/login', async (req, res) => {
    const ip = getIp(req);
    if (await checkRateLimit(`login:${ip}`, 10, 900)) {
        return res.status(429).json({ success: false, error: 'Muitas tentativas. Aguarde 15 minutos.' });
    }

    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Preencha e-mail e senha.' });
    }

    // Admin via env - mesmo com credenciais corretas, aplica rate limit por IP
    if (ADMIN_USER && ADMIN_PASS && email === ADMIN_USER) {
        // Comparação timing-safe para evitar ataques de timing
        const passMatch = ADMIN_PASS.length === password.length
            && crypto.timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASS));
        if (!passMatch) {
            await writeAdminLog({ action: 'admin_login_fail', ip, email });
            return res.status(401).json({ success: false, error: 'E-mail ou senha incorretos.' });
        }
        await writeAdminLog({ action: 'admin_login_ok', ip, email });
        // Verificar se admin tem 2FA ativo
        const adminUser = await resolveUser(email);
        if (adminUser?.twofa?.enabled) {
            const tempToken = await createTemp2faToken(email, true);
            return res.json({ success: true, requires2fa: true, tempToken });
        }
        const token = await createSession(email, true);
        return res.json({
            success: true,
            token,
            isAdmin: true,
            requires2fa: false,
            mfaSetupRequired: !adminUser?.twofa?.enabled
        });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const users = await loadUsers();
    const user  = users.find(u => u.email === normalizedEmail);

    // mensagem generica para evitar enumeracao
    if (!user || !verifyPassword(password, user.salt, user.hash)) {
        if (user) await recordFailedLogin(users, user, saveUsers);
        return res.status(401).json({ success: false, error: 'E-mail ou senha incorretos.' });
    }

    // Conta bloqueada por tentativas excessivas
    if (isLockedOut(user)) {
        const unlockAt = new Date(user.lockedUntil);
        const mins = Math.ceil((unlockAt - Date.now()) / 60000);
        return res.status(403).json({ success: false, error: `Conta bloqueada por tentativas excessivas. Tente novamente em ${mins} minuto(s).` });
    }

    if (user.status === 'pending') {
        return res.status(403).json({ success: false, error: 'Cadastro aguardando aprovacao do administrador.' });
    }
    if (user.status === 'denied') {
        return res.status(403).json({ success: false, error: 'Cadastro negado pelo administrador.' });
    }

    // Limpa contador de falhas apos login valido
    await clearFailedLogin(users, user, saveUsers);

    // Se 2FA ativo, retorna temp token para segundo fator
    if (user.twofa?.enabled) {
        const tempToken = await createTemp2faToken(normalizedEmail, user.isAdmin === true);
        return res.json({ success: true, requires2fa: true, tempToken });
    }

    const token = await createSession(normalizedEmail, user.isAdmin === true, user.sessionEpoch || 0);
    res.json({
        success: true,
        token,
        isAdmin: user.isAdmin === true,
        requires2fa: false,
        mustChangePassword: !!user.mustChangePassword,
        // 2FA obrigatorio: se o usuario chegou ate aqui (sem requires2fa) e nao tem
        // 2FA ativo, precisa configurar antes de acessar o app.
        mfaSetupRequired: !user.twofa?.enabled
    });
});

// Login fator 2 - verificar TOTP
app.post('/api/2fa/verify-login', async (req, res) => {
    const ip = getIp(req);
    if (await checkRateLimit(`2fa:${ip}`, 10, 300)) {
        return res.status(429).json({ success: false, error: 'Muitas tentativas de 2FA. Aguarde.' });
    }

    const { tempToken, code } = req.body || {};
    if (!tempToken || !code) {
        return res.status(400).json({ success: false, error: 'Dados incompletos.' });
    }

    const data = await consumeTemp2faToken(tempToken);
    if (!data) {
        return res.status(401).json({ success: false, error: 'Token expirado ou invalido. Faca login novamente.' });
    }

    // resolveUser suporta tanto admin-env quanto usuarios KV
    const user = await resolveUser(data.email);
    if (!user || !user.twofa?.enabled || !user.twofa?.secret) {
        return res.status(401).json({ success: false, error: 'Configuracao de 2FA invalida.' });
    }

    if (!totpVerify(user.twofa.secret, code)) {
        return res.status(401).json({ success: false, error: 'Codigo incorreto. Verifique seu aplicativo autenticador.' });
    }

    const token = await createSession(data.email, data.isAdmin, user.sessionEpoch || 0);
    res.json({
        success: true,
        token,
        isAdmin: data.isAdmin,
        mustChangePassword: !!user.mustChangePassword
    });
});

// Cadastro
app.post('/api/register', async (req, res) => {
    const ip = getIp(req);
    if (await checkRateLimit(`reg:${ip}`, 5, 3600)) {
        return res.status(429).json({ success: false, error: 'Limite de cadastros atingido. Tente mais tarde.' });
    }

    const email    = String(req.body?.email    || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return res.status(400).json({ success: false, error: 'E-mail invalido.' });
    }
    if (!isStrongPassword(password)) {
        return res.status(400).json({ success: false, error: 'A senha deve ter pelo menos 10 caracteres, incluindo maiúscula, minúscula, número e símbolo (ex: @, #, !).' });
    }

    const users = await loadUsers();
    if (users.some(u => u.email === email)) {
        return res.status(409).json({ success: false, error: 'Ja existe uma solicitacao para este e-mail.' });
    }

    const { salt, hash } = hashPassword(password);
    users.push({ id: crypto.randomUUID(), email, salt, hash, status: 'pending', createdAt: new Date().toISOString(), ip });
    await saveUsers(users);
    res.json({ success: true, message: 'Solicitacao enviada. Aguarde a aprovacao do administrador.' });
});

// =============================================================================
// ROTAS AUTENTICADAS
// =============================================================================

// Enviar denuncia
app.post('/api/send-report', requireSession, async (req, res) => {
    const ip = getIp(req);
    if (await checkRateLimit(`report:${ip}:${req.session.email}`, 20, 3600)) {
        return res.status(429).json({ success: false, error: 'Limite de envios atingido. Aguarde 1 hora.' });
    }

    const { message } = req.body || {};
    if (!message || String(message).trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Mensagem vazia.' });
    }
    if (String(message).length > 4096) {
        return res.status(400).json({ success: false, error: 'Mensagem muito longa (max. 4096 caracteres).' });
    }

    const { oferta, isPrimeira } = req.body || {};

    try {
        // Salvar no histórico
        const reports = await kv.get(REPORTS_KEY) || [];
        reports.unshift({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            email: req.session.email,
            oferta: String(oferta || '').slice(0, 20),
            isPrimeira: !!isPrimeira,
            preview: String(message).slice(0, 200),
            sentAt: new Date().toISOString()
        });
        await kv.set(REPORTS_KEY, reports.slice(0, MAX_REPORTS));

        // Encaminha a denuncia para o Telegram exatamente como foi gerada
        // (sem cabecalho): o texto ja e o template pronto para a plataforma.
        // Usuario, oferta e tipo continuam registrados no historico (gt_reports).
        // Nao bloqueia a resposta nem falha o registro se o Telegram estiver fora.
        sendTelegramNotification(String(message).slice(0, 4096)).catch(() => {});

        res.json({ success: true, message: 'Denúncia registrada com sucesso!' });
    } catch (error) {
        console.error('Erro ao salvar denúncia:', error.message);
        res.status(500).json({ success: false, error: 'Falha ao registrar. Tente novamente.' });
    }
});

// Usuario troca a propria senha (fluxo pos-reset do admin, ou troca voluntaria).
// Exige a senha atual mesmo com sessao valida, para evitar que uma sessao
// sequestrada troque a senha silenciosamente. Gera uma nova sessao (novo epoch),
// entao a sessao antiga (inclusive a usada nesta propria chamada) deixa de valer.
app.post('/api/change-password', requireSession, async (req, res) => {
    const ip = getIp(req);
    if (await checkRateLimit(`chpw:${ip}:${req.session.email}`, 10, 3600)) {
        return res.status(429).json({ success: false, error: 'Muitas tentativas. Aguarde 1 hora.' });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, error: 'Preencha a senha atual e a nova senha.' });
    }
    if (!isStrongPassword(newPassword)) {
        return res.status(400).json({ success: false, error: 'A nova senha deve ter pelo menos 10 caracteres, incluindo maiúscula, minúscula, número e símbolo.' });
    }

    const email = req.session.email;
    if (ADMIN_USER && email === ADMIN_USER) {
        return res.status(400).json({ success: false, error: 'A senha do administrador principal e definida por variavel de ambiente.' });
    }

    const users = await loadUsers();
    const user  = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario nao encontrado.' });

    if (!verifyPassword(currentPassword, user.salt, user.hash)) {
        return res.status(401).json({ success: false, error: 'Senha atual incorreta.' });
    }
    if (verifyPassword(newPassword, user.salt, user.hash)) {
        return res.status(400).json({ success: false, error: 'A nova senha deve ser diferente da atual.' });
    }

    const { salt, hash } = hashPassword(newPassword);
    user.salt               = salt;
    user.hash                = hash;
    user.mustChangePassword  = false;
    user.sessionEpoch        = (user.sessionEpoch || 0) + 1;
    await saveUsers(users);
    await writeAdminLog({ actor: email, action: 'change-password', target: email });

    // Nova sessao (com o epoch atualizado) para o cliente continuar logado sem
    // precisar refazer login - as demais sessoes antigas ficam invalidas.
    const token = await createSession(email, user.isAdmin === true, user.sessionEpoch);
    res.json({
        success: true,
        token,
        mfaSetupRequired: !user.twofa?.enabled
    });
});

// Histórico de denúncias do usuário
app.get('/api/reports', requireSession, async (req, res) => {
    const limit  = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const all    = await kv.get(REPORTS_KEY) || [];
    const mine   = req.session.isAdmin ? all : all.filter(r => r.email === req.session.email);
    res.json({ success: true, total: mine.length, reports: mine.slice(offset, offset + limit) });
});

// ─────────────────────────────────────────────────────────────────────────────
// Templates de denuncia (compartilhados por toda a equipe, persistidos no KV)
// ─────────────────────────────────────────────────────────────────────────────
async function loadTemplates() {
    const t = await kv.get(TEMPLATES_KEY);
    return (t && typeof t === 'object' && !Array.isArray(t)) ? t : {};
}

// Qualquer usuario logado le os templates para gerar a denuncia.
app.get('/api/templates', requireSession, async (req, res) => {
    const templates = await loadTemplates();
    res.json({ success: true, templates });
});

// Apenas admin grava. Aceita { templates: {...} } ou o objeto cru (compat).
app.post('/api/admin/templates', requireAdmin, async (req, res) => {
    const body     = req.body || {};
    const incoming = (body.templates && typeof body.templates === 'object') ? body.templates : body;

    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return res.status(400).json({ success: false, error: 'Formato invalido.' });
    }

    const clean = {};
    for (const key of TPL_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
        const val = incoming[key];
        if (typeof val !== 'string') {
            return res.status(400).json({ success: false, error: `Template "${key}" deve ser texto.` });
        }
        if (val.length > MAX_TPL_LEN) {
            return res.status(400).json({ success: false, error: `Template "${key}" excede ${MAX_TPL_LEN} caracteres.` });
        }
        clean[key] = val;
    }

    if (Object.keys(clean).length === 0) {
        return res.status(400).json({ success: false, error: 'Nenhum template valido enviado.' });
    }

    const merged = { ...(await loadTemplates()), ...clean };
    await kv.set(TEMPLATES_KEY, merged);
    await writeAdminLog({ action: 'templates_update', email: req.session.email, keys: Object.keys(clean) });

    res.json({ success: true, templates: merged });
});

// helpers: resolve user object para qualquer tipo (kv ou admin-env)
async function resolveUser(email) {
    if (ADMIN_USER && email === ADMIN_USER) {
        // admin do env: dados 2FA ficam em KV separado
        const twofa = await kv.get(`gt_admin_2fa`) || { enabled: false };
        return { _isEnvAdmin: true, email, twofa };
    }
    const users = await loadUsers();
    return users.find(u => u.email === email) || null;
}
async function persistUser(user) {
    if (user._isEnvAdmin) {
        await kv.set('gt_admin_2fa', user.twofa);
        return;
    }
    const users = await loadUsers();
    const idx   = users.findIndex(u => u.email === user.email);
    if (idx >= 0) { users[idx] = user; await saveUsers(users); }
}

// --- 2FA: iniciar setup (gera secret pendente) ---
app.post('/api/2fa/setup', requireSession, async (req, res) => {
    const user = await resolveUser(req.session.email);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario nao encontrado.' });

    const secret = generateTotpSecret();
    user.twofa = { ...user.twofa, pendingSecret: secret, enabled: user.twofa?.enabled || false };
    await persistUser(user);

    res.json({ success: true, secret, uri: totpUri(secret, user.email) });
});

// --- 2FA: confirmar e ativar ---
app.post('/api/2fa/enable', requireSession, async (req, res) => {
    const { code } = req.body || {};
    const user = await resolveUser(req.session.email);
    if (!user || !user.twofa?.pendingSecret) {
        return res.status(400).json({ success: false, error: 'Inicie o setup de 2FA primeiro.' });
    }
    if (!totpVerify(user.twofa.pendingSecret, code)) {
        return res.status(401).json({ success: false, error: 'Codigo incorreto. Verifique o aplicativo e tente novamente.' });
    }
    user.twofa = { enabled: true, secret: user.twofa.pendingSecret, enabledAt: new Date().toISOString() };
    await persistUser(user);
    res.json({ success: true, message: '2FA ativado com sucesso.' });
});

// --- 2FA: desativar (exige codigo valido) ---
app.post('/api/2fa/disable', requireSession, async (req, res) => {
    const { code } = req.body || {};
    const user = await resolveUser(req.session.email);
    if (!user || !user.twofa?.enabled) {
        return res.status(400).json({ success: false, error: '2FA nao esta ativo.' });
    }
    if (!totpVerify(user.twofa.secret, code)) {
        return res.status(401).json({ success: false, error: 'Codigo incorreto.' });
    }
    user.twofa = { enabled: false };
    await persistUser(user);
    res.json({ success: true, message: '2FA desativado.' });
});

// --- 2FA: verificar se esta ativo para o usuario logado ---
app.get('/api/2fa/status', requireSession, async (req, res) => {
    const user = await resolveUser(req.session.email);
    res.json({ success: true, enabled: !!(user?.twofa?.enabled), enabledAt: user?.twofa?.enabledAt || null });
});

// =============================================================================
// ROTAS ADMIN
// =============================================================================

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const users = (await loadUsers()).map(({ id, email, status, isAdmin, createdAt, ip, twofa, failedAttempts, lockedUntil, mustChangePassword }) =>
        ({ id, email, status, isAdmin: !!isAdmin, createdAt, ip, has2fa: !!(twofa?.enabled), failedAttempts: failedAttempts || 0, lockedUntil: lockedUntil || null, mustChangePassword: !!mustChangePassword })
    );
    res.json({ success: true, users });
});

app.post('/api/admin/approve', requireAdmin, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const users = await loadUsers();
    const user  = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario nao encontrado.' });
    user.status     = 'approved';
    user.approvedAt = new Date().toISOString();
    await saveUsers(users);
    await writeAdminLog({ actor: req.session.email, action: 'approve', target: email });
    res.json({ success: true });
});

app.post('/api/admin/deny', requireAdmin, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const users = await loadUsers();
    const user  = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario nao encontrado.' });
    user.status = 'denied';
    await saveUsers(users);
    await writeAdminLog({ actor: req.session.email, action: 'deny', target: email });
    res.json({ success: true });
});

app.post('/api/admin/delete-request', requireAdmin, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const users = await loadUsers();
    const user  = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario nao encontrado.' });
    if (user.status === 'approved') return res.status(400).json({ success: false, error: 'Negue o acesso antes de excluir.' });
    await saveUsers(users.filter(u => u.email !== email));
    await writeAdminLog({ actor: req.session.email, action: 'delete', target: email });
    res.json({ success: true });
});

// Admin: desbloquear conta manualmente
app.post('/api/admin/unlock', requireAdmin, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const users = await loadUsers();
    const user  = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario nao encontrado.' });
    user.failedAttempts = 0;
    user.lockedUntil    = null;
    await saveUsers(users);
    await writeAdminLog({ actor: req.session.email, action: 'unlock', target: email });
    res.json({ success: true });
});

// Admin: promover/rebaixar usuario (isAdmin)
app.post('/api/admin/set-role', requireAdmin, async (req, res) => {
    const email   = String(req.body?.email || '').trim().toLowerCase();
    const isAdmin = req.body?.isAdmin === true;
    // Impede que o admin env seja modificado via API
    if (ADMIN_USER && email === ADMIN_USER) {
        return res.status(400).json({ success: false, error: 'O administrador principal nao pode ser editado via painel.' });
    }
    const users = await loadUsers();
    const user  = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario nao encontrado.' });
    user.isAdmin = isAdmin;
    await saveUsers(users);
    await writeAdminLog({ actor: req.session.email, action: isAdmin ? 'grant-admin' : 'revoke-admin', target: email });
    res.json({ success: true });
});

// Admin: remover 2FA de um usuario
app.post('/api/admin/reset-2fa', requireAdmin, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const users = await loadUsers();
    const user  = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario nao encontrado.' });
    user.twofa = { enabled: false };
    await saveUsers(users);
    await writeAdminLog({ actor: req.session.email, action: 'reset-2fa', target: email });
    res.json({ success: true });
});

// Admin: gera uma senha temporaria para um usuario.
// - O admin nunca define a senha final: a conta fica marcada como
//   "precisa trocar a senha" e, no proximo login, o usuario e obrigado
//   a definir uma senha nova (que so ele conhece) antes de acessar o app.
// - Todas as sessoes ativas do usuario sao invalidadas na hora (sessionEpoch++).
app.post('/api/admin/reset-password', requireAdmin, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (ADMIN_USER && email === ADMIN_USER) {
        return res.status(400).json({ success: false, error: 'A senha do administrador principal nao pode ser resetada por aqui.' });
    }

    const users = await loadUsers();
    const user  = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario nao encontrado.' });

    const tempPassword    = generateTempPassword();
    const { salt, hash }  = hashPassword(tempPassword);
    user.salt               = salt;
    user.hash                = hash;
    user.mustChangePassword  = true;
    user.sessionEpoch        = (user.sessionEpoch || 0) + 1;
    user.failedAttempts      = 0;
    user.lockedUntil         = null;
    await saveUsers(users);
    await writeAdminLog({ actor: req.session.email, action: 'reset-password', target: email });

    // A senha temporaria so aparece aqui, uma unica vez - nao fica salva em texto puro
    // em lugar nenhum (nem nos logs) e o admin precisa repassa-la ao usuario por fora do sistema.
    res.json({ success: true, tempPassword });
});

// Logs de acesso
app.get('/api/admin/logs', requireAdmin, async (req, res) => {
    const limit  = Math.min(Number(req.query.limit) || 100, MAX_LOGS);
    const offset = Number(req.query.offset) || 0;
    const all    = await kv.get(LOGS_KEY) || [];
    res.json({ success: true, total: all.length, logs: all.slice(offset, offset + limit) });
});

app.delete('/api/admin/logs', requireAdmin, async (req, res) => {
    await kv.set(LOGS_KEY, []);
    await writeAdminLog({ actor: req.session.email, action: 'clear-logs', target: 'access_logs' });
    res.json({ success: true });
});

// Admin: estatísticas do dashboard
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    const [users, reports, logs] = await Promise.all([
        loadUsers(),
        kv.get(REPORTS_KEY) || [],
        kv.get(LOGS_KEY) || []
    ]);
    const reportsArr = reports || [];
    const logsArr    = logs || [];
    const byStatus   = { pending: 0, approved: 0, denied: 0 };
    for (const u of users) byStatus[u.status] = (byStatus[u.status] || 0) + 1;

    const oneDayAgo = Date.now() - 86400000;
    const recentReports  = reportsArr.filter(r => new Date(r.sentAt).getTime() > oneDayAgo).length;
    const recentLogins   = logsArr.filter(l => new Date(l.ts).getTime() > oneDayAgo).length;

    res.json({
        success: true,
        stats: {
            totalUsers: users.length,
            byStatus,
            totalReports: reportsArr.length,
            recentReports,
            recentLogins,
            totalLogs: logsArr.length
        }
    });
});

// Audit log de acoes admin
app.get('/api/admin/audit', requireAdmin, async (req, res) => {
    const limit  = Math.min(Number(req.query.limit) || 100, MAX_LOGS);
    const offset = Number(req.query.offset) || 0;
    const all    = await kv.get(ADMIN_LOGS_KEY) || [];
    res.json({ success: true, total: all.length, logs: all.slice(offset, offset + limit) });
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
}
