require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING || '');

(async () => {
    if (!apiId || !apiHash || !process.env.SESSION_STRING) {
        console.error('\n⚠️  API_ID, API_HASH ou SESSION_STRING ausentes no .env. Rode o server.js primeiro para gerar a sessão.\n');
        process.exit(1);
    }

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    console.log('\n⏳ Conectando ao Telegram...\n');
    await client.connect();

    const dialogs = await client.getDialogs({ limit: 200 });

    console.log('--- Seus chats, grupos e canais ---\n');
    dialogs.forEach((d) => {
        const title = d.title || d.name || '(sem nome)';
        const tipo = d.isChannel ? 'canal/grupo' : d.isGroup ? 'grupo' : d.isUser ? 'usuário' : 'chat';
        console.log(`[${tipo}]  ${title}  =>  ID: ${d.id}`);
    });

    console.log('\n✅ Procure "Grupo teste" na lista acima e copie o valor de ID correspondente.\n');

    await client.disconnect();
    process.exit(0);
})().catch((err) => {
    console.error('\n❌ Erro:', err.message);
    process.exit(1);
});
