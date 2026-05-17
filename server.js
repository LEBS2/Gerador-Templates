require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const apiId = parseInt(process.env.API_ID);
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
        const targetChat = parseInt(process.env.TARGET_CHAT_ID); // Converte para número caso necessário (ou deixa string para username)
        console.log("Enviando mensagem para:", targetChat);
        
        await client.sendMessage(targetChat, { message: message });
        
        res.json({ success: true, message: "Enviado com sucesso!" });
    } catch (error) {
        console.error("❌ Erro ao enviar mensagem:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
    console.log("⏳ Iniciando conexão com o Telegram...\n");
    await startTelegramClient();
});
