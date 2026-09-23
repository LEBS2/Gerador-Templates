// scripts/verificar-chat.js
//
// Verifica, SEM enviar nenhuma mensagem, se a sessão do Telegram salva no
// .env consegue "ver" o grupo/canal configurado em TELEGRAM_CHAT_ID.
//
// Uso:
//   node scripts/verificar-chat.js
//
// Requer as mesmas variáveis já usadas pelo restante do projeto:
//   TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION, TELEGRAM_CHAT_ID

require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION || "";
const chatIdEnv = process.env.TELEGRAM_CHAT_ID;

function faltando(nome, valor) {
  if (!valor) {
    console.error(`✗ Variável ${nome} não está definida no .env`);
    return true;
  }
  return false;
}

async function main() {
  console.log("Verificando variáveis de ambiente...");
  let erro = false;
  erro = faltando("TELEGRAM_API_ID", apiId) || erro;
  erro = faltando("TELEGRAM_API_HASH", apiHash) || erro;
  erro = faltando("TELEGRAM_SESSION", sessionString) || erro;
  erro = faltando("TELEGRAM_CHAT_ID", chatIdEnv) || erro;
  if (erro) {
    console.error("\nCorrija o .env antes de continuar.");
    process.exit(1);
  }
  console.log("✓ Todas as variáveis necessárias estão presentes.\n");

  const client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { connectionRetries: 3 }
  );

  console.log("Conectando ao Telegram com a sessão salva...");
  try {
    await client.connect();
  } catch (e) {
    console.error("✗ Falha ao conectar/autenticar com a TELEGRAM_SESSION atual.");
    console.error("  Detalhe:", e.message);
    process.exit(1);
  }

  const conectado = await client.checkAuthorization();
  if (!conectado) {
    console.error("✗ A sessão foi lida, mas não está autenticada (login expirado ou revogado).");
    console.error("  Será necessário rodar novamente: npm run telegram:login");
    await client.disconnect();
    process.exit(1);
  }

  const me = await client.getMe();
  console.log(`✓ Sessão autenticada como: ${me.firstName || ""} ${me.lastName || ""} (@${me.username || "sem username"})\n`);

  console.log(`Procurando o chat com ID ${chatIdEnv} entre os diálogos desta conta...`);
  const alvo = chatIdEnv.toString();
  // Alguns formatos possíveis para o mesmo chat, dependendo da versão/lib:
  //   -1001645551359 (com prefixo -100)
  //   1645551359      (id "cru" do canal, sem prefixo)
  const alvoSemPrefixo = alvo.startsWith("-100") ? alvo.slice(4) : null;

  let encontrado = null;
  const todosGruposCanais = [];

  for await (const dialogo of client.iterDialogs({})) {
    if (!(dialogo.isChannel || dialogo.isGroup)) continue; // pula conversas privadas
    const id = dialogo.id ? dialogo.id.toString() : null;
    todosGruposCanais.push({ id, nome: dialogo.title || dialogo.name });
    if (id === alvo || (alvoSemPrefixo && id === alvoSemPrefixo)) {
      encontrado = dialogo;
    }
  }

  if (!encontrado) {
    console.error(`✗ Nenhum diálogo com ID ${alvo} (ou ${alvoSemPrefixo}) foi encontrado nesta conta.\n`);
    console.log("Grupos/canais que esta conta VÊ (compare com o grupo desejado):");
    if (todosGruposCanais.length === 0) {
      console.log("  (nenhum grupo ou canal encontrado — esta conta pode não estar em nenhum)");
    } else {
      todosGruposCanais.forEach((g) => console.log(`  - ${g.nome}  →  ID: ${g.id}`));
    }
    console.error("\nPossíveis causas: TELEGRAM_CHAT_ID incorreto/formato diferente, ou esta conta não é mais membro do grupo/canal.");
    await client.disconnect();
    process.exit(1);
  }

  console.log("✓ Chat encontrado! Nenhuma mensagem foi enviada.\n");
  console.log("Detalhes:");
  console.log("  Nome:      ", encontrado.title || encontrado.name);
  console.log("  Tipo:      ", encontrado.isChannel ? "canal/supergrupo" : encontrado.isGroup ? "grupo" : "outro");
  console.log("  ID:        ", encontrado.id.toString());
  console.log("  Membros:   ", encontrado.entity && encontrado.entity.participantsCount != null
    ? encontrado.entity.participantsCount
    : "não informado nesta consulta");

  await client.disconnect();
  console.log("\nTudo certo — a integração está pronta para enviar denúncias a este chat.");
}

main().catch((e) => {
  console.error("Erro inesperado:", e);
  process.exit(1);
});
