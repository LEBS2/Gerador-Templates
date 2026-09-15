/* lib/telegram.js
 * Encaminha notificações para um grupo/canal do Telegram usando uma conta
 * pessoal (GramJS/MTProto), não um bot. A sessão é gerada UMA VEZ, localmente,
 * rodando scripts/telegram-login.js (veja o README) e salva como a variável
 * de ambiente TELEGRAM_SESSION. Em produção este módulo só reconecta com essa
 * sessão já autenticada - nunca pede código/telefone aqui.
 *
 * Variáveis de ambiente necessárias:
 *   TELEGRAM_API_ID    - obtido em https://my.telegram.org
 *   TELEGRAM_API_HASH  - idem
 *   TELEGRAM_SESSION   - string de sessão gerada pelo scripts/telegram-login.js
 *   TELEGRAM_CHAT_ID   - ID numérico (ex: -1001234567890) ou @username do grupo/canal
 *
 * Se qualquer uma faltar, o envio fica silenciosamente desativado (o resto do
 * app continua funcionando normalmente).
 */

const API_ID   = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || '';
const SESSION  = process.env.TELEGRAM_SESSION || '';
const CHAT_ID  = process.env.TELEGRAM_CHAT_ID || '';

const TELEGRAM_ENABLED = !!(API_ID && API_HASH && SESSION && CHAT_ID);

let client = null;
let connectingPromise = null;

async function getClient() {
    if (!TELEGRAM_ENABLED) return null;
    if (client && client.connected) return client;

    if (!connectingPromise) {
        connectingPromise = (async () => {
            // Import tardio: se a lib nao estiver instalada e o Telegram nao
            // estiver configurado, o resto do app nao deve quebrar.
            const { TelegramClient } = require('telegram');
            const { StringSession } = require('telegram/sessions');

            const c = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {
                connectionRetries: 3,
            });
            await c.connect();
            client = c;
            return c;
        })();

        try {
            await connectingPromise;
        } finally {
            connectingPromise = null;
        }
    }

    return client;
}

/**
 * Envia uma notificação de texto para o grupo/canal configurado.
 * Nunca lança erro - falhas de Telegram nao devem derrubar o fluxo principal
 * (ex: registrar a denuncia no historico). Retorna true/false.
 */
async function sendTelegramNotification(text) {
    if (!TELEGRAM_ENABLED) return false;
    try {
        const c = await getClient();
        if (!c) return false;
        await c.sendMessage(CHAT_ID, { message: String(text).slice(0, 4096) });
        return true;
    } catch (err) {
        console.error('[telegram] Falha ao enviar notificacao:', err.message);
        return false;
    }
}

module.exports = { sendTelegramNotification, TELEGRAM_ENABLED };
