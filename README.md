# Gerador de Templates de Denúncia

Plataforma web para geração automatizada de templates de denúncia e envio direto via Telegram. Desenvolvida com Node.js serverless no Vercel, autenticação segura com 2FA (TOTP), painel administrativo e logs de auditoria.

---

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 18+ (Vercel Serverless) |
| API | Express.js |
| Banco de dados | Vercel KV (Redis) |
| Autenticação | HMAC-SHA256 (session tokens) + TOTP (RFC 6238) |
| Mensagens | Telegram User API via gramJS (TelegramClient) |
| Frontend | HTML + CSS + JS vanilla |
| Deploy | Vercel |

---

## Funcionalidades

### Para usuários
- Cadastro com aprovação manual de administrador
- Login com autenticação de dois fatores (TOTP)
- Geração de templates de denúncia por categoria (perfis falsos, fraude financeira, golpes)
- Envio direto para grupos/canais do Telegram configurados

### Para administradores
- Painel de administração dedicado (`/admin.html`)
- Aprovação, negação e exclusão de cadastros
- Visualização de logs de acesso em tempo real
- Desbloqueio de contas bloqueadas por excesso de tentativas
- Reset de 2FA de usuários
- Audit trail de todas as ações administrativas

---

## Segurança

| Medida | Detalhes |
|---|---|
| Autenticação | Session tokens HMAC-SHA256, TTL 8h, armazenados no KV |
| 2FA | TOTP RFC 6238, sem dependências externas, segredo por usuário |
| Bloqueio de conta | 5 tentativas falhas -> bloqueio de 15 minutos |
| Rate limiting | Login: 10 req/15min, Registro: 5 req/h, Envio: 20 req/h (por IP, via KV) |
| CORS | Restrito a `ALLOWED_ORIGIN` |
| CSP | Content-Security-Policy configurada via middleware Express |
| Headers | X-Content-Type-Options, X-Frame-Options: DENY, Referrer-Policy, HSTS |
| Token storage | `sessionStorage` - apagado ao fechar o browser |
| Audit trail | Toda acao admin registrada com actor, action, target e timestamp |
| Senha forte | Minimo 8 caracteres, ao menos 1 letra e 1 numero |

---

## Variaveis de Ambiente

Configure no painel do Vercel em Settings > Environment Variables:

| Variavel | Obrigatoria | Descricao |
|---|---|---|
| `KV_URL` | Sim | URL de conexao do Vercel KV |
| `KV_REST_API_URL` | Sim | URL REST do Vercel KV |
| `KV_REST_API_TOKEN` | Sim | Token de autenticacao do KV |
| `API_ID` | Sim | ID da aplicacao Telegram (my.telegram.org) - numero inteiro |
| `API_HASH` | Sim | Hash da aplicacao Telegram |
| `SESSION_STRING` | Sim | String de sessao gramJS (gerada com gramJS StringSession) |
| `ADMIN_USER` | Sim | E-mail ou usuario do administrador (comparacao direta com env var) |
| `ADMIN_PASS` | Sim | Senha do administrador (comparacao direta - use apenas em ambiente seguro) |
| `ALLOWED_ORIGIN` | Sim | Origem permitida pelo CORS (ex: https://seudominio.vercel.app) |
| `SESSION_SECRET` | Recomendado | Chave HMAC para assinar session tokens. Sem ela, sessoes sao invalidadas a cada cold start |
| `APP_NAME` | Nao | Nome exibido no app autenticador 2FA (padrao: GeradorTemplates) |

Nunca commite o arquivo `.env` - ele esta no `.gitignore`.

---

## Instalacao e Deploy

### Pre-requisitos
- Conta no Vercel
- Vercel KV criado no dashboard do projeto
- Bot do Telegram configurado e sessao gramJS gerada
- Node.js 18+

### Deploy local (desenvolvimento)

```bash
npm install
npm run dev
```

### Deploy no Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

Ou conecte o repositorio GitHub ao Vercel para deploy automatico em push.

---

## Endpoints da API

### Autenticacao

| Metodo | Endpoint | Descricao |
|---|---|---|
| POST | `/api/register` | Cadastro de novo usuario |
| POST | `/api/login` | Login (retorna token ou inicia fluxo 2FA) |
| POST | `/api/2fa/verify-login` | Verificacao do codigo TOTP no login |
| POST | `/api/session/verify` | Verifica se o token de sessao e valido |
| POST | `/api/session/logout` | Encerra a sessao |

### 2FA (autenticado)

| Metodo | Endpoint | Descricao |
|---|---|---|
| GET | `/api/2fa/status` | Retorna se 2FA esta ativo |
| POST | `/api/2fa/setup` | Gera segredo pendente + URI para QR Code |
| POST | `/api/2fa/enable` | Ativa o 2FA com codigo de verificacao |
| POST | `/api/2fa/disable` | Desativa o 2FA com codigo de verificacao |

### Administracao (requer token admin)

| Metodo | Endpoint | Descricao |
|---|---|---|
| GET | `/api/admin/users` | Lista todos os usuarios |
| POST | `/api/admin/approve` | Aprova cadastro |
| POST | `/api/admin/deny` | Nega cadastro |
| POST | `/api/admin/delete-request` | Exclui cadastro pendente |
| POST | `/api/admin/unlock` | Desbloqueia conta bloqueada |
| POST | `/api/admin/reset-2fa` | Remove o 2FA de um usuario |
| GET | `/api/admin/logs` | Lista logs de acesso |
| POST | `/api/admin/clear-logs` | Limpa todos os logs |
| GET | `/api/admin/audit` | Lista o audit trail de acoes admin |
| GET | `/api/admin/stats` | Retorna estatisticas gerais |

---

## Configuracao do 2FA

1. Acesse a plataforma e faca login
2. Clique em Painel Admin > aba Minha Conta
3. Clique em Ativar 2FA
4. Escaneie o QR Code com Google Authenticator, Authy ou qualquer app TOTP
5. Digite o codigo de 6 digitos para confirmar a ativacao

Na proxima vez que fizer login, o sistema solicitara o codigo apos a senha.

---

## Estrutura de Arquivos

```
├── api/
│   └── index.js          # Backend serverless (Express + todas as rotas)
├── index.html            # Frontend principal
├── admin.html            # Painel administrativo
├── styles.css            # Estilos globais
├── script.js             # Logica frontend (login, 2FA, templates, envio)
├── logo.png              # Logo e favicon da aplicacao
├── vercel.json           # Configuracao Vercel (rewrites, headers, bundling)
├── package.json          # Dependencias Node.js
├── .gitignore
└── README.md
```

---

## Chaves KV utilizadas

| Chave | Conteudo |
|---|---|
| `gt_users` | Array de objetos de usuario (JSON) |
| `gt_logs` | Array de logs de acesso (JSON) |
| `gt_admin_logs` | Array de logs de acoes admin (JSON) |
| `gt_rl:{ip}:{action}` | Rate limiting por IP e acao |
| `gt_2fa:{token}` | Token temporario de 2FA (TTL 5 min, uso unico) |
| `gt_session:{token}` | Dados da sessao (email, isAdmin, TTL 8h) |

---

## Licenca

Uso interno - nao distribuir sem autorizacao.