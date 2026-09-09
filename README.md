# Gerador de Templates de Denúncia

Plataforma web para geração e envio de templates padronizados de denúncia de **Fake Social Profiles (FSP)** e **Executive Fake Profiles (EFSP)** em redes sociais.

---

## Visão geral

| Recurso | Detalhe |
|---|---|
| Runtime | Node.js 18+ / Express 5 |
| Deploy | Vercel (Serverless Function) |
| Armazenamento | Vercel KV (Redis) — fallback in-memory em dev |
| Autenticação | HMAC-SHA256 + sessão KV + 2FA TOTP (RFC 6238) |
| Segurança | Rate limiting, lockout, CSP, HSTS, CSRF, timing-safe |

---

## Funcionalidades

### Usuário final
- Seleção de tipo de denúncia: **FSP** ou **EFSP**
- Escolha entre **Primeira Notificação** e **Renotificação**
- Preenchimento de dados (cliente, URLs, data)
- Geração automática de template formatado
- Cópia do texto para envio via WhatsApp, e-mail ou plataforma

### Painel Admin
- Dashboard com estatísticas (usuários, denúncias, logins recentes)
- Aprovação, negação e exclusão de solicitações de acesso
- Desbloqueio de contas travadas por tentativas excessivas
- Definição de papel (admin / usuário) por e-mail
- Reset de 2FA de qualquer usuário
- Logs de acesso e audit log de ações administrativas

### Segurança
- Senhas com hash **scrypt** (salt aleatório por usuário)
- Sessões assinadas com **HMAC-SHA256** e armazenadas no KV (TTL 8h)
- **2FA TOTP** (RFC 6238) sem dependências externas — compatível com Google Authenticator, Authy, etc.
- Rate limiting por IP em login (10/15min), cadastro (5/h) e 2FA (10/5min)
- Lockout automático após 5 tentativas falhas (15 min)
- Comparação timing-safe em todas as verificações de credencial
- CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy
- CSRF: rejeita POST sem `Content-Type: application/json`
- `X-Forwarded-For` confiado apenas quando rodando na Vercel

---

## Estrutura do projeto

```
.
├── api/
│   └── index.js          # Entry point Vercel — servidor Express completo
├── index.html            # Frontend público (canal de denúncias)
├── admin.html            # Painel administrativo (requer auth)
├── script.js             # Lógica de UI do frontend público
├── app.js                # Funções auxiliares compartilhadas (toast, modais, etc.)
├── styles.css            # Estilos globais
├── logo.png              # Logo da plataforma
├── vercel.json           # Configuração de deploy (rewrites, headers, includeFiles)
├── package.json
├── .env.example          # Variáveis de ambiente necessárias
└── .gitignore
```

### Arquivos legados (não fazem parte do deploy atual)

| Arquivo | O que era | Por que foi substituído |
|---|---|---|
| `server.js` | Servidor original com integração direta ao Telegram via MTProto (`telegram`) | Substituído por `api/index.js` — o envio direto ao Telegram exigia sessão interativa na inicialização e dependências incompatíveis com Serverless. O novo fluxo salva a denúncia no KV e o admin gerencia pelo painel. |
| `listar-chats.js` | Script utilitário para listar IDs de chats/grupos do Telegram | Ferramenta de setup do `server.js` para descobrir o `CHAT_ID`. Não é necessário na arquitetura atual. |

> Para reativar a integração com Telegram, veja a seção [Integração Telegram (legado)](#integração-telegram-legado) abaixo.

---

## Configuração local

### Pré-requisitos
- Node.js 18+
- npm

### Instalação

```bash
git clone https://github.com/LEBS2/Gerador-Templates.git
cd Gerador-Templates
npm install
```

### Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável | Obrigatório | Descrição |
|---|---|---|
| `ADMIN_USER` | Sim | E-mail do administrador principal |
| `ADMIN_PASS` | Sim | Senha do administrador (min. 10 chars, maiúscula, minúscula, número, símbolo) |
| `SESSION_SECRET` | Sim | String aleatória >= 32 caracteres para assinar sessões HMAC |
| `KV_REST_API_URL` | Produção | URL do Vercel KV (deixe vazio em dev — usa memória) |
| `KV_REST_API_TOKEN` | Produção | Token do Vercel KV |
| `ALLOWED_ORIGIN` | Produção | URL do seu domínio (ex: `https://seu-app.vercel.app`) |
| `APP_NAME` | Não | Nome exibido no QR Code do 2FA (padrão: `GeradorTemplates`) |
| `PORT` | Não | Porta local (padrão: `3000`) |

### Iniciar em desenvolvimento

```bash
npm run dev
# Servidor em http://localhost:3000
```

> Em dev sem KV configurado, os dados ficam em memória e são perdidos ao reiniciar.

---

## Deploy na Vercel

### 1. Conectar o repositório

1. Acesse [vercel.com](https://vercel.com) → **Add New Project**
2. Importe `LEBS2/Gerador-Templates`
3. Framework: **Other** (sem framework)

### 2. Configurar Vercel KV

1. No dashboard do projeto → **Storage** → **Create Database** → **KV**
2. Conecte ao projeto — as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` são adicionadas automaticamente

### 3. Configurar variáveis de ambiente

No dashboard → **Settings** → **Environment Variables**, adicione:

| Variável | Valor |
|---|---|
| `ADMIN_USER` | seu e-mail de admin |
| `ADMIN_PASS` | sua senha forte |
| `SESSION_SECRET` | string aleatória >= 32 chars |
| `ALLOWED_ORIGIN` | `https://seu-projeto.vercel.app` |

### 4. Deploy

```bash
git push origin master
# A Vercel faz o deploy automaticamente
```

---

## API — Referência de endpoints

### Públicos

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/register` | Solicitar acesso (e-mail + senha) |
| `POST` | `/api/login` | Login — retorna token ou `requires2fa: true` |
| `POST` | `/api/2fa/verify-login` | Verificar código TOTP (fator 2) |
| `POST` | `/api/session/verify` | Verificar se sessão está ativa |
| `POST` | `/api/session/logout` | Encerrar sessão |

### Autenticados (`x-session-token` obrigatório)

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/send-report` | Registrar denúncia |
| `GET` | `/api/reports` | Listar histórico de denúncias |
| `POST` | `/api/2fa/setup` | Iniciar configuração de 2FA (gera QR) |
| `POST` | `/api/2fa/enable` | Ativar 2FA (confirmar com código) |
| `POST` | `/api/2fa/disable` | Desativar 2FA (confirmar com código) |
| `GET` | `/api/2fa/status` | Status do 2FA do usuário logado |

### Admin (`x-session-token` de conta admin)

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/admin/users` | Listar todos os usuários |
| `GET` | `/api/admin/stats` | Estatísticas do dashboard |
| `POST` | `/api/admin/approve` | Aprovar usuário |
| `POST` | `/api/admin/deny` | Negar usuário |
| `POST` | `/api/admin/delete-request` | Excluir solicitação (status pending/denied) |
| `POST` | `/api/admin/unlock` | Desbloquear conta travada |
| `POST` | `/api/admin/set-role` | Definir papel admin/usuário |
| `POST` | `/api/admin/reset-2fa` | Resetar 2FA de um usuário |
| `GET` | `/api/admin/logs` | Logs de acesso |
| `DELETE` | `/api/admin/logs` | Limpar logs de acesso |
| `GET` | `/api/admin/audit` | Audit log de ações administrativas |

**Header de autenticação:**
```
x-session-token: <token retornado no login>
```

---

## Fluxo de autenticação

```
POST /api/login
  ├── sem 2FA  →  { token }  →  usa token normalmente
  └── com 2FA  →  { requires2fa: true, tempToken }
                        │
                   POST /api/2fa/verify-login
                        │  { tempToken, code }
                        └──→  { token }
```

O `token` deve ser enviado em todas as requisições autenticadas via header `x-session-token`. Sessões expiram em **8 horas**.

---

## Fluxo de cadastro e aprovação

```
Usuário  →  POST /api/register  →  status: pending
Admin    →  GET  /api/admin/users  →  ve solicitacao
Admin    →  POST /api/admin/approve  →  status: approved
Usuário  →  consegue fazer login
```

---

## Chaves no Vercel KV

| Chave | Tipo | Conteúdo |
|---|---|---|
| `gt_users` | Array JSON | Todos os usuários cadastrados |
| `gt_reports` | Array JSON | Histórico de denúncias (max. 1000) |
| `gt_logs` | Array JSON | Logs de acesso (max. 500) |
| `gt_admin_logs` | Array JSON | Audit log admin (max. 500) |
| `gt_sess:<token>` | Object | Dados da sessão (TTL 8h) |
| `gt_2fa:<token>` | Object | Token temporário 2FA (TTL 5min, single-use) |
| `gt_admin_2fa` | Object | Configuração 2FA do admin-env |
| `gt_rl:<key>` | Object | Contadores de rate limit por IP/rota |

---

## Integração Telegram (legado)

O `server.js` original enviava a denúncia diretamente para um grupo/canal do Telegram via MTProto (biblioteca `telegram`). Essa integração foi removida da versão Vercel por incompatibilidade com ambientes Serverless — requer conexão persistente e autenticação interativa na primeira execução.

### Para reativar localmente

1. Instale as dependências legadas:
```bash
npm install telegram input
```

2. Adicione ao `.env`:
```
API_ID=seu_api_id
API_HASH=seu_api_hash
CHAT_ID=id_do_grupo_telegram
SESSION_STRING=
```

3. Obtenha `API_ID` e `API_HASH` em [my.telegram.org](https://my.telegram.org)

4. Descubra o `CHAT_ID` do grupo:
```bash
node listar-chats.js
# Lista todos os seus chats com ID — copie o ID do grupo desejado
```

> Na primeira execução será solicitado login no Telegram (telefone + código). A sessão é salva no `.env` como `SESSION_STRING` automaticamente.

5. Inicie com o servidor legado:
```bash
node server.js
```

> `server.js` e `listar-chats.js` estão no `.gitignore` e não sobem para o repositório. Use apenas localmente.

---

## Requisitos de senha

Senhas de usuários cadastrados devem ter:
- Mínimo 10 caracteres
- Ao menos 1 letra maiúscula
- Ao menos 1 letra minúscula
- Ao menos 1 número
- Ao menos 1 símbolo (`@`, `#`, `!`, etc.)

---

## Segurança — detalhes técnicos

- **Hashing:** `crypto.scryptSync` com salt de 16 bytes por usuário, output de 64 bytes
- **Sessões:** `HMAC-SHA256(JSON.stringify(payload), SESSION_SECRET)` — validadas contra KV para garantir revogação
- **TOTP:** implementação RFC 6238 pura em Node.js (`crypto.createHmac`), sem dependências externas, janela de ±30s para drift de relógio
- **Timing attacks:** `crypto.timingSafeEqual` em todas as comparações de senha, token e TOTP
- **Rate limit:** contadores no KV por `IP:rota`, janela deslizante
- **CSRF:** middleware rejeita POST com body sem `Content-Type: application/json`
- **Dotfiles:** `express.static` configurado com `dotfiles: 'deny'`
- **Arquivos bloqueados:** regex bloqueia acesso direto a `.env`, `.json`, `.md`, `.sh`, `package*`, `vercel*`

---

## Licença

ISC
