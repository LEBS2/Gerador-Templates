require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const fs = require('fs');
const path = require('path');

const app = express();

// --- Credenciais do dono/admin ---
// Vêm de variáveis de ambiente (.env), NUNCA do código-fonte, para não
// ficarem expostas no navegador (frontend) nem em texto puro no repositório.
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

function requireAdmin(req, res, next) {
    const u = req.header('x-admin-user');
    const p = req.header('x-admin-pass');

    if (u === ADMIN_USER && p === ADMIN_PASS) {
        return next();
    }

    // Permite que usuários aprovados marcados como isAdmin também
    // acessem as rotas administrativas, usando seu próprio e-mail/senha.
    if (u && p) {
        const normalizedEmail = String(u).trim().toLowerCase();
        const users = loadUsers();
        const user = users.find(x => x.email === normalizedEmail);
        if (user && user.status === 'approved' && user.isAdmin === true && verifyPassword(p, user.salt, user.hash)) {
            return next();
        }
    }

    return res.status(401).json({ success: false, error: "Não autorizado." });
}

// --- Armazenamento simples de usuários (arquivo local users.json) ---
const USERS_FILE = 'users.json';

function loadUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) return [];
        const raw = fs.readFileSync(USERS_FILE, 'utf8').trim();
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (error) {
        console.error("❌ Erro ao ler users.json:", error.message);
        return [];
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
}

function verifyPassword(password, salt, hash) {
    const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'));
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-user, x-admin-pass');
    res.header('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(express.json());

// --- Serve o frontend estático (index.html, script.js, styles.css, favicon.png) ---
app.use(express.static(path.join(__dirname)));

const chatId = Number(process.env.CHAT_ID);
const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING || '');

let client;

async function startTelegramClient() {
    if (!apiId || !apiHash) {
        console.error("\n⚠️ AVISO: API_ID e API_HASH não encontrados no arquivo .env");
        console.error("Por favor, preencha o arquivo .env com suas credenciais do my.telegram.org e reinicie o servidor.\n");
        return;
    }

    client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    try {
        await client.start({
            phoneNumber: async () => await input.text('📱 Por favor digite seu número de telefone (ex: +5511999999999): '),
            password: async () => await input.text('🔒 Por favor digite sua senha de verificação em duas etapas (se tiver): '),
            phoneCode: async () => await input.text('📩 Por favor digite o código recebido no seu Telegram: '),
            onError: (err) => console.log(err),
        });

        console.log("\n✅ Conectado ao Telegram!");

        // Salva a sessão no .env para não precisar logar de novo
        const sessionString = client.session.save();
        if (sessionString !== process.env.SESSION_STRING) {
            let envContent = fs.readFileSync('.env', 'utf8');
            if (envContent.includes('SESSION_STRING=')) {
                envContent = envContent.replace(/SESSION_STRING=.*/, `SESSION_STRING=${sessionString}`);
            } else {
                envContent += `\nSESSION_STRING=${sessionString}`;
            }
            fs.writeFileSync('.env', envContent);
            console.log("💾 Sessão salva no .env com sucesso. Você não precisará logar novamente.");
        }
    } catch (error) {
        console.error("\n❌ Erro ao conectar ao Telegram:", error.message);
    }
}

app.post('/api/send-report', async (req, res) => {
    if (!client || !client.connected) {
        return res.status(500).json({ success: false, error: "Servidor não está conectado ao Telegram." });
    }

    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ success: false, error: "Mensagem vazia." });
    }

    try {
        const targetChat = /^-?\d+$/.test(process.env.CHAT_ID) ? BigInt(process.env.CHAT_ID) : process.env.CHAT_ID;
        console.log("Enviando mensagem para:", targetChat);

        await client.sendMessage(targetChat, { message: message });

        res.json({ success: true, message: "Enviado com sucesso!" });
    } catch (error) {
        console.error("❌ Erro ao enviar mensagem:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Solicitação de cadastro de novo usuário ---
app.post('/api/register', (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !String(email).trim()) {
        return res.status(400).json({ success: false, error: "Informe um e-mail ou usuário." });
    }
    if (!password || String(password).length < 6) {
        return res.status(400).json({ success: false, error: "A senha deve ter pelo menos 6 caracteres." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const users = loadUsers();

    if (users.some(u => u.email === normalizedEmail)) {
        return res.status(409).json({ success: false, error: "Já existe uma solicitação para este e-mail." });
    }

    const { salt, hash } = hashPassword(password);
    users.push({
        id: crypto.randomUUID(),
        email: normalizedEmail,
        salt,
        hash,
        status: 'pending', // pending | approved | denied
        createdAt: new Date().toISOString(),
    });
    saveUsers(users);

    console.log(`📝 Nova solicitação de cadastro: ${normalizedEmail}`);
    res.json({ success: true, message: "Solicitação enviada. Aguarde a aprovação do administrador." });
});

// --- Login de usuário aprovado (por e-mail) ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ success: false, error: "Preencha e-mail e senha." });
    }

    // --- Login do dono do sistema ---
    // Credenciais vêm de variáveis de ambiente (nunca do código-fonte).
    if (ADMIN_USER && ADMIN_PASS && email === ADMIN_USER && password === ADMIN_PASS) {
        return res.json({ success: true, message: "Login realizado com sucesso.", isAdmin: true });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const users = loadUsers();
    const user = users.find(u => u.email === normalizedEmail);

    if (!user) {
        return res.status(404).json({ success: false, error: "Nenhum cadastro encontrado para este e-mail." });
    }
    if (user.status === 'pending') {
        return res.status(403).json({ success: false, error: "Seu cadastro ainda está aguardando aprovação do administrador." });
    }
    if (user.status === 'denied') {
        return res.status(403).json({ success: false, error: "Seu cadastro foi negado pelo administrador." });
    }
    if (!verifyPassword(password, user.salt, user.hash)) {
        return res.status(401).json({ success: false, error: "Senha incorreta." });
    }

    res.json({ success: true, message: "Login realizado com sucesso.", isAdmin: user.isAdmin === true });
});

// --- Admin: listar todas as solicitações/usuários ---
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = loadUsers().map(({ id, email, status, createdAt }) => ({ id, email, status, createdAt }));
    res.json({ success: true, users });
});

// --- Admin: aprovar cadastro ---
app.post('/api/admin/approve', requireAdmin, (req, res) => {
    const { email } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const users = loadUsers();
    const user = users.find(u => u.email === normalizedEmail);

    if (!user) {
        return res.status(404).json({ success: false, error: "Usuário não encontrado." });
    }
    user.status = 'approved';
    saveUsers(users);
    console.log(`✅ Cadastro aprovado: ${normalizedEmail}`);
    res.json({ success: true });
});

// --- Admin: negar cadastro ---
app.post('/api/admin/deny', requireAdmin, (req, res) => {
    const { email } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const users = loadUsers();
    const user = users.find(u => u.email === normalizedEmail);

    if (!user) {
        return res.status(404).json({ success: false, error: "Usuário não encontrado." });
    }
    user.status = 'denied';
    saveUsers(users);
    console.log(`⛔ Cadastro negado: ${normalizedEmail}`);
    res.json({ success: true });
});

// --- Admin: excluir solicitação (somente enquanto estiver 'pending') ---
app.post('/api/admin/delete-request', requireAdmin, (req, res) => {
    const { email } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const users = loadUsers();
    const user = users.find(u => u.email === normalizedEmail);

    if (!user) {
        return res.status(404).json({ success: false, error: "Usuário não encontrado." });
    }
    if (user.status === 'approved') {
        return res.status(400).json({ success: false, error: "Não é possível excluir um usuário aprovado. Negue o acesso primeiro." });
    }

    const updatedUsers = users.filter(u => u.email !== normalizedEmail);
    saveUsers(updatedUsers);
    console.log(`🗑️ Solicitação excluída: ${normalizedEmail}`);
    res.json({ success: true });
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, async () => {
        console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
        console.log("⏳ Iniciando conexão com o Telegram...\n");
        await startTelegramClient();
    });
}

module.exports = app;
