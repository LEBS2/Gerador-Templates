# Gerador de Templates de Denúncia

Plataforma web interna para gerar e registrar templates padronizados de denúncia de perfis falsos em redes sociais (**FSP** e **EFSP**).

## Funcionalidades

- Geração de templates de primeira notificação e renotificação
- Histórico de denúncias, com bloqueio de envios duplicados
- Encaminhamento opcional das denúncias para um grupo do Telegram
- Painel administrativo para gestão de acessos
- Autenticação com aprovação de cadastro e 2FA (TOTP)

## Stack

Node.js 18+ · Express · Vercel (Serverless) · Vercel KV
