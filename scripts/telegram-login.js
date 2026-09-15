/* scripts/telegram-login.js
 *
 * Roda LOCALMENTE, NO SEU COMPUTADOR, UMA ÚNICA VEZ - nunca é deployado nem
 * chamado pelo site. Serve só para autenticar a conta do Telegram (com o
 * número de telefone) e gerar a string de sessão que o app em produção
 * (lib/telegram.js) vai reaproveitar, sem precisar logar de novo.
 *
 * Como usar:
 *   1. Preencha TELEGRAM_API_ID e TELEGRAM_API_HASH no seu .env (pegue em
 *      https://my.telegram.org -> "API development tools").
 *   2. Instale a dependência usada só por este script:
 *        npm install input
 *   3. Rode:
 *        node scripts/telegram-login.js
 *   4. Digite o número de telefone (com DDI, ex: +5511999999999), o código
 *      que chegar no Telegram e, se sua conta tiver 2FA, a senha.
 *   5. Copie a string de sessão impressa no final e salve como a variável de
 *      ambiente TELEGRAM_SESSION (no seu .env local e nas Environment
 *      Variables do projeto na Vercel).
 *   6. Depois disso pode apagar este passo da sua rotina - não precisa rodar
 *      de novo, a menos que troque a senha da conta ou desative/ative o 2FA.
 */

require('dotenv').config();

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

const apiId = Number(process.env.TELEGRAM_API_ID || 0);
const apiHash = process.env.TELEGRAM_API_HASH || '';

if (!apiId || !apiHash) {
    console.error('Preencha TELEGRAM_API_ID e TELEGRAM_API_HASH no seu .env antes de rodar este script.');
    process.exit(1);
}

(async () => {
    const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await input.text('Número (com DDI, ex: +5511999999999): '),
        password: async () => await input.text('Senha 2FA da sua conta Telegram (deixe em branco se não tiver): '),
        phoneCode: async () => await input.text('Código recebido no Telegram: '),
        onError: (err) => console.log(err),
    });

    console.log('\nLogin feito com sucesso!\n');
    console.log('Copie a linha abaixo e salve como a variável de ambiente TELEGRAM_SESSION:\n');
    console.log(client.session.save());
    console.log('\nDica: depois de logado, entre no grupo/canal que vai receber as notificações');
    console.log('com essa mesma conta - ela precisa ser membro pra poder enviar mensagens lá.');

    await client.disconnect();
    process.exit(0);
})();
