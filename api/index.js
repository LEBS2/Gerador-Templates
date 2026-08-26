// --- Versão do backend adaptada para rodar como função serverless na Vercel ---
//
// Diferenças importantes em relação ao server.js (usado no seu PC):
// 1. Não existe conexão "permanente" com o Telegram guardada em memória —
//    cada requisição em /api/send-report abre uma conexão nova usando a
//    SESSION_STRING (variável de ambiente) e fecha ao final.
// 2. Não faz login interativo (telefone/código) — isso exige um terminal,
//    que não existe na Vercel. A SESSION_STRING já deve estar pronta e
//    configurada como variável de ambiente no painel da Vercel.
// 3. Os usuários (cadastro/aprovação) ficam salvos no Vercel KV em vez de
//    um arquivo users.json, porque a Vercel não permite gravar arquivos.
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { kv } = require('@vercel/kv');

const app = express();

// --- Credenciais do dono/admin (mesmas usadas no login do frontend) ---
const ADMIN_USER = "7B735636DD532E7DBF979D9B2023735DA8168ADE";
const ADMIN_PASS = "7F56D3F17078531A3613DD907020F7C0B18CE09F";

function requireAdmin(req, res, next) {
    const u = req.header('x-admin-user');
    const p = req.header('x-admin-pass');
    if (u === ADMIN_USER && p === ADMIN_PASS) {
        return next();
    }
    return res.status(401).json({ success: false, error: "Não autorizado." });
}

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

// --- Armazenamento de usuários via Vercel KV (substitui o users.json local) ---
const USERS_KV_KEY = 'gt_users';

async function loadUsers() {
    const users = await kv.get(USERS_KV_KEY);
    return Array.isArray(users) ? users : [];
}

async function saveUsers(users) {
    await kv.set(USERS_KV_KEY, users);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
}

function verifyPassword(password, salt, hash) {
    const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'));
}

// --- Conexão com o Telegram sob demanda (sem login interativo) ---
async function getTelegramClient() {
    const apiId = Number(process.env.API_ID);
    const apiHash = process.env.API_HASH;
    const sessionString = process.env.SESSION_STRING;

    if (!apiId || !apiHash || !sessionString) {
        throw new Error("Credenciais do Telegram ausentes nas variáveis de ambiente da Vercel (API_ID, API_HASH, SESSION_STRING).");
    }

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
        connectionRetries: 3,
    });
    await client.connect();
    return client;
}

// --- Enviar denúncia para o Telegram ---
app.post('/api/send-report', async (req, res) => {
    const { message } = req.body || {};
    if (!message) {
        return res.status(400).json({ success: false, error: "Mensagem vazia." });
    }

    let client;
    try {
        client = await getTelegramClient();
        const targetChat = /^-?\d+$/.test(process.env.CHAT_ID) ? BigInt(process.env.CHAT_ID) : process.env.CHAT_ID;
        await client.sendMessage(targetChat, { message });
        res.json({ success: true, message: "Enviado com sucesso!" });
    } catch (error) {
        console.error("❌ Erro ao enviar mensagem:", error.message);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (client) {
            try { await client.disconnect(); } catch (e) { /* ignore */ }
        }
    }
});

// --- Solicitação de cadastro de novo usuário ---
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !String(email).trim()) {
        return res.status(400).json({ success: false, error: "Informe um e-mail ou usuário." });
    }
    if (!password || String(password).length < 6) {
        return res.status(400).json({ success: false, error: "A senha deve ter pelo menos 6 caracteres." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const users = await loadUsers();

    if (users.some(u => u.email === normalizedEmail)) {
        return res.status(409).json({ success: false, error: "Já existe uma solicitação para este e-mail." });
    }

    const { salt, hash } = hashPassword(password);
    users.push({
        id: crypto.randomUUID(),
        email: normalizedEmail,
        salt,
        hash,
        status: 'pending',
        createdAt: new Date().toISOString(),
    });
    await saveUsers(users);

    res.json({ success: true, message: "Solicitação enviada. Aguarde a aprovação do administrador." });
});

// --- Login de usuário aprovado (por e-mail) ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ success: false, error: "Preencha e-mail e senha." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const users = await loadUsers();
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

    res.json({ success: true, message: "Login realizado com sucesso." });
});

// --- Admin: listar todas as solicitações/usuários ---
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const users = (await loadUsers()).map(({ id, email, status, createdAt }) => ({ id, email, status, createdAt }));
    res.json({ success: true, users });
});

// --- Admin: aprovar cadastro ---
app.post('/api/admin/approve', requireAdmin, async (req, res) => {
    const { email } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const users = await loadUsers();
    const user = users.find(u => u.email === normalizedEmail);

    if (!user) {
        return res.status(404).json({ success: false, error: "Usuário não encontrado." });
    }
    user.status = 'approved';
    await saveUsers(users);
    res.json({ success: true });
});

// --- Admin: negar cadastro ---
app.post('/api/admin/deny', requireAdmin, async (req, res) => {
    const { email } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const users = await loadUsers();
    const user = users.find(u => u.email === normalizedEmail);

    if (!user) {
        return res.status(404).json({ success: false, error: "Usuário não encontrado." });
    }
    user.status = 'denied';
    await saveUsers(users);
    res.json({ success: true });
});

module.exports = app;
