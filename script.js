const elements = {
    form: document.getElementById('report-form'),
    previewText: document.getElementById('preview-text'),
    submitBtn: document.getElementById('submit-btn'),
    copyBtn: document.getElementById('copy-btn'),
    clientsContainer: document.getElementById('clients-container'),
    addClientBtn: document.getElementById('add-client-btn'),
    resetBtn: document.getElementById('reset-template-btn')
};

let clientCount = 1;
let isTemplateEdited = false;
const MAX_CLIENTS = 10;
const MAX_URLS = 9; // 1 principal + 9 extra = 10 URLs total max

// Oferta selecionada após o login: 'fsp' | 'efsp' | null
let selectedOferta = null;
// Se é a primeira notificação dessa denúncia: true | false | null
let selectedPrimeiraNotificacao = null;

const extraUrlsCount = {
    1: 0
};

function addClient() {
    if (document.querySelectorAll('.client-group').length >= MAX_CLIENTS) {
        alert("O limite máximo é de 10 clientes.");
        return;
    }

    clientCount++;
    const currentIndex = clientCount;
    extraUrlsCount[currentIndex] = 0;

    const newGroup = document.createElement('div');
    newGroup.className = 'form-group client-group';
    newGroup.id = `client-group-${currentIndex}`;

    newGroup.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <label style="margin-bottom: 0;">Cliente ${currentIndex} <span class="optional">(Opcional)</span></label>
            <button type="button" class="remove-client-btn" onclick="removeClient(${currentIndex})" title="Remover cliente">✕ Excluir</button>
        </div>
        <div class="input-row">
            <input type="text" id="client${currentIndex}" placeholder="Nome da marca...">
            <input type="url" class="client${currentIndex}-url" placeholder="URL principal...">
        </div>
        <div id="extra-urls-${currentIndex}"></div>
        <button type="button" class="add-url-btn" onclick="addUrlField(${currentIndex})">+ Adicionar outra URL</button>
    `;

    elements.clientsContainer.appendChild(newGroup);

    // Add event listeners to new inputs
    document.getElementById(`client${currentIndex}`).addEventListener('input', generateTemplate);
    newGroup.querySelector(`.client${currentIndex}-url`).addEventListener('input', generateTemplate);

    if (document.querySelectorAll('.client-group').length >= MAX_CLIENTS) {
        elements.addClientBtn.style.display = 'none';
    }
    
    updateClientLabels();
}

function removeClient(index) {
    const group = document.getElementById(`client-group-${index}`);
    if (group) {
        group.remove();
        generateTemplate();
        updateClientLabels();
        
        if (document.querySelectorAll('.client-group').length < MAX_CLIENTS) {
            elements.addClientBtn.style.display = 'flex';
        }
    }
}

function updateClientLabels() {
    const groups = document.querySelectorAll('.client-group');
    groups.forEach((group, index) => {
        const clientNum = index + 1;
        const label = group.querySelector('label');
        if (clientNum === 1) {
            label.innerHTML = `Cliente 1 <span class="required">*</span>`;
        } else {
            label.innerHTML = `Cliente ${clientNum} <span class="optional">(Opcional)</span>`;
        }
    });
}

function addUrlField(clientIndex) {
    if (extraUrlsCount[clientIndex] >= MAX_URLS) {
        alert("O limite máximo é de 10 URLs por cliente.");
        return;
    }

    extraUrlsCount[clientIndex]++;
    
    const container = document.getElementById(`extra-urls-${clientIndex}`);
    const newRow = document.createElement('div');
    newRow.className = 'input-row dynamic-url-row';
    newRow.style.marginTop = '0.5rem';

    const input = document.createElement('input');
    input.type = 'url';
    input.className = `client${clientIndex}-url`;
    input.placeholder = 'URL secundária (Opcional)...';
    input.addEventListener('input', generateTemplate);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-url-btn';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Remover URL';
    removeBtn.onclick = function() {
        container.removeChild(newRow);
        extraUrlsCount[clientIndex]--;
        
        const clientGroup = document.getElementById(`client-group-${clientIndex}`);
        const addBtn = clientGroup.querySelector('.add-url-btn');
        if (addBtn && extraUrlsCount[clientIndex] < MAX_URLS) {
            addBtn.style.display = 'inline-block';
        }
        
        generateTemplate();
    };

    newRow.appendChild(input);
    newRow.appendChild(removeBtn);
    container.appendChild(newRow);

    const clientGroup = document.getElementById(`client-group-${clientIndex}`);
    const addBtn = clientGroup.querySelector('.add-url-btn');
    if (addBtn && extraUrlsCount[clientIndex] >= MAX_URLS) {
        addBtn.style.display = 'none';
    }
}

function getClientData(index) {
    const clientNameInput = document.getElementById(`client${index}`);
    if (!clientNameInput) return null;
    
    const clientName = clientNameInput.value.trim();
    if (!clientName) return null;

    const urlInputs = document.querySelectorAll(`.client${index}-url`);
    const urls = [];
    urlInputs.forEach(input => {
        const val = input.value.trim();
        if (val) urls.push(val);
    });

    if (urls.length === 0) return null;

    return { client: clientName, urls: urls };
}

// Generate template based on inputs
function generateTemplate() {
    const clientsData = [];

    for (let i = 1; i <= clientCount; i++) {
        const data = getClientData(i);
        if (data) clientsData.push(data);
    }

    const c1Input = document.getElementById('client1');
    const u1Input = document.querySelector('.client1-url');
    
    if (!c1Input.value.trim() || !u1Input.value.trim()) {
        if (!isTemplateEdited) {
            elements.previewText.value = 'O Cliente 1 (Nome e URL) é obrigatório para gerar a mensagem.';
        }
        elements.submitBtn.disabled = true;
        elements.copyBtn.disabled = true;
        return;
    }

    if (isTemplateEdited) {
        elements.submitBtn.disabled = false;
        elements.copyBtn.disabled = false;
        return;
    }

    const template = buildTemplate(clientsData);

    elements.previewText.value = template;
    elements.submitBtn.disabled = false;
    elements.copyBtn.disabled = false;
}

// --- Construção do texto da denúncia, de acordo com a oferta e se é a primeira notificação ---
function buildTemplate(clientsData) {
    const clientNames = clientsData.map(c => c.client).join(', ');
    const primaryUrl = clientsData[0].urls[0];
    const isFirst = selectedPrimeiraNotificacao !== false; // default: primeira notificação

    if (selectedOferta === 'fsp') {
        if (isFirst) {
            const bulletLines = clientsData
                .flatMap(c => c.urls.map(u => `- ${u}`))
                .join('\n');

            return `Hello Telegram Team, \nThe following profile are impersonating ${clientNames}.\n\n${bulletLines}\n\nCould you help us by removing these profile?`;
        }

        const bulletLines = clientsData
            .flatMap(c => c.urls.map(u => `- ${u}`))
            .join('\n');

        return `Hello Telegram Team, \nThe following profile are impersonating ${clientNames}.\n\n${bulletLines}\n\nCould you help us by removing these profile? We've been reporting this profile for a while and it's still up`;
    }

    if (selectedOferta === 'efsp') {
        if (isFirst) {
            const bulletLines = clientsData
                .flatMap(c => c.urls.map(u => `- ${u}`))
                .join('\n');

            return `Dear Telegram,\n\nThe following profiles are using the executive ${clientNames} to commit scams. \n\n${bulletLines}\n\nCan you help us by removing it from Telegram?\n\nThank you!`;
        }

        const bulletLines = clientsData
            .flatMap(c => c.urls.map(u => `- ${u}`))
            .join('\n');

        return `The following profiles are using the executive ${clientNames} to commit scams. \n\n${bulletLines}\n\nCan you help us by removing it from Telegram? We've been reporting this profile for a while and it's still up\n\nThank you!`;
    }

    // Fallback (nenhuma oferta selecionada ainda) - mantém o texto padrão antigo
    if (clientsData.length === 1) {
        return `Dear Telegram,\n\nThe following profile are using the brand ${clientsData[0].client} to commit scams:\n\n${clientsData[0].urls.join('\n')}\n\nCan you help us by removing it from Telegram?`;
    }
    const listText = clientsData.map(item => `- ${item.client}:\n  ${item.urls.join('\n  ')}`).join('\n\n');
    return `Dear Telegram,\n\nThe following profiles are using our clients' brands to commit scams:\n\n${listText}\n\nCan you help us by removing them from Telegram?`;
}

// Manual Template Edit Logic
elements.previewText.addEventListener('input', () => {
    isTemplateEdited = true;
    elements.previewText.classList.add('edited-template');
    elements.resetBtn.style.display = 'inline-block';
    
    // Check required fields to enable/disable buttons even during manual edit
    const c1Input = document.getElementById('client1');
    const u1Input = document.querySelector('.client1-url');
    const isValid = c1Input && u1Input && c1Input.value.trim() && u1Input.value.trim();
    
    elements.submitBtn.disabled = !isValid;
    elements.copyBtn.disabled = !isValid;
});

elements.resetBtn.addEventListener('click', () => {
    isTemplateEdited = false;
    elements.previewText.classList.remove('edited-template');
    elements.resetBtn.style.display = 'none';
    generateTemplate();
});

// Event Listeners for Real-time update
document.getElementById('client1').addEventListener('input', generateTemplate);
document.querySelector('.client1-url').addEventListener('input', generateTemplate);

// Form submission / Button Click
elements.submitBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    const c1 = document.getElementById('client1').value.trim();
    const u1 = document.querySelector('.client1-url').value.trim();

    if (!c1 || !u1) {
        alert("Por favor, preencha o Nome e a URL principal do Cliente 1.");
        return;
    }

    const message = elements.previewText.value;
    
    // Feedback visual de carregamento
    const originalText = elements.submitBtn.innerHTML;
    elements.submitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l-5.46-1.5"></path></svg> Enviando...`;
    elements.submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/send-report`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });

        const data = await response.json();

        if (data.success) {
            elements.submitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Enviado com Sucesso!`;
            elements.submitBtn.style.backgroundColor = '#10B981';
            
            setTimeout(() => {
                elements.submitBtn.innerHTML = originalText;
                elements.submitBtn.style.backgroundColor = '';
                elements.submitBtn.disabled = false;
            }, 3000);
        } else {
            throw new Error(data.error || "Erro desconhecido");
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        alert("Erro ao enviar a mensagem: " + error.message + "\n\nVerifique se o servidor Node.js está rodando!");
        elements.submitBtn.innerHTML = originalText;
        elements.submitBtn.disabled = false;
    }
});

// Copy Button Logic
elements.copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const message = elements.previewText.value;
    
    if (!message) return;

    navigator.clipboard.writeText(message).then(() => {
        const originalText = elements.copyBtn.innerHTML;
        elements.copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copiado!`;
        elements.copyBtn.style.color = '#10B981';
        elements.copyBtn.style.borderColor = '#10B981';
        
        setTimeout(() => {
            elements.copyBtn.innerHTML = originalText;
            elements.copyBtn.style.color = '';
            elements.copyBtn.style.borderColor = '';
        }, 2000);
    }).catch(err => {
        alert("Erro ao copiar a mensagem. Seu navegador pode não suportar esta função.");
    });
});

// --- Login Logic ---
// Local (VS Code / node server.js): usa o servidor na porta 3000.
// Publicado na Vercel: usa o mesmo domínio da própria página (caminho relativo).
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : '';

// Credenciais do dono do sistema (acesso total + painel admin)
const ADMIN_USER = "7B735636DD532E7DBF979D9B2023735DA8168ADE";
const ADMIN_PASS = "7F56D3F17078531A3613DD907020F7C0B18CE09F";

let isOwner = false;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Sessão em cache (localStorage) ---
// Guarda que o login já foi feito para não pedir de novo ao atualizar a página.
// A escolha de oferta/notificação NÃO é salva aqui de propósito: a cada
// atualização o usuário volta para a tela "Qual oferta?".
const SESSION_KEY = 'gt_session';

function saveSession(ownerFlag) {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ loggedIn: true, isOwner: ownerFlag }));
    } catch (error) {
        console.warn('Não foi possível salvar a sessão:', error);
    }
}

function loadSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch (error) {
        // ignore
    }
}

document.getElementById('login-btn').addEventListener('click', async () => {
    const userVal = document.getElementById('login-username').value.trim();
    const passVal = document.getElementById('login-password').value.trim();
    const errorMsg = document.getElementById('login-error');
    errorMsg.style.display = 'none';

    // Login do dono do sistema (acesso total + admin)
    if (userVal === ADMIN_USER && passVal === ADMIN_PASS) {
        isOwner = true;
        saveSession(true);
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('open-admin-btn').style.display = 'block';
        openOfferWizard();
        return;
    }

    // Login de usuário comum (por e-mail/usuário, validado no servidor)
    if (!userVal || !passVal) {
        errorMsg.textContent = 'Usuário ou senha incorretos.';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        const resp = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userVal, password: passVal })
        });
        const data = await resp.json();

        if (data.success) {
            isOwner = false;
            saveSession(false);
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('open-admin-btn').style.display = 'none';
            openOfferWizard();
        } else {
            errorMsg.textContent = data.error || 'Usuário ou senha incorretos.';
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        errorMsg.textContent = 'Não foi possível conectar ao servidor. Ele está rodando?';
        errorMsg.style.display = 'block';
    }
});

// Permitir o Enter no campo de senha para logar
document.getElementById('login-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('login-btn').click();
    }
});

// --- Alternar entre telas de Login e Cadastro ---
document.getElementById('show-register-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('register-overlay').style.display = 'flex';
});

document.getElementById('show-login-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-overlay').style.display = 'none';
    document.getElementById('login-overlay').style.display = 'flex';
});

// --- Solicitação de Cadastro ---
document.getElementById('register-btn').addEventListener('click', async () => {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    const msg = document.getElementById('register-message');

    const showMsg = (text, isError) => {
        msg.textContent = text;
        msg.style.color = isError ? 'var(--color-error)' : '#10B981';
        msg.style.display = 'block';
    };

    if (!email) {
        showMsg('Digite um e-mail ou usuário.', true);
        return;
    }
    if (password.length < 6) {
        showMsg('A senha deve ter pelo menos 6 caracteres.', true);
        return;
    }
    if (password !== passwordConfirm) {
        showMsg('As senhas não coincidem.', true);
        return;
    }

    try {
        const resp = await fetch(`${API_BASE}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await resp.json();

        if (data.success) {
            showMsg('Solicitação enviada! Aguarde a aprovação do administrador.', false);
            document.getElementById('register-email').value = '';
            document.getElementById('register-password').value = '';
            document.getElementById('register-password-confirm').value = '';
        } else {
            showMsg(data.error || 'Erro ao solicitar cadastro.', true);
        }
    } catch (error) {
        showMsg('Não foi possível conectar ao servidor. Ele está rodando?', true);
    }
});

// --- Painel de Administração (apenas para o dono) ---
document.getElementById('open-admin-btn').addEventListener('click', () => {
    document.getElementById('admin-overlay').style.display = 'flex';
    loadAdminUsers();
});

document.getElementById('close-admin-btn').addEventListener('click', () => {
    document.getElementById('admin-overlay').style.display = 'none';
});

async function loadAdminUsers() {
    const list = document.getElementById('admin-users-list');
    list.innerHTML = '<p style="color: var(--color-text-light);">Carregando...</p>';

    try {
        const resp = await fetch(`${API_BASE}/api/admin/users`, {
            headers: { 'x-admin-user': ADMIN_USER, 'x-admin-pass': ADMIN_PASS }
        });
        const data = await resp.json();

        if (!data.success) {
            list.innerHTML = `<p style="color: var(--color-error);">${data.error}</p>`;
            return;
        }

        if (data.users.length === 0) {
            list.innerHTML = '<p style="color: var(--color-text-light);">Nenhuma solicitação de cadastro ainda.</p>';
            return;
        }

        const statusInfo = {
            pending: { label: 'Pendente', color: '#F59E0B' },
            approved: { label: 'Aprovado', color: '#10B981' },
            denied: { label: 'Negado', color: 'var(--color-error)' }
        };

        list.innerHTML = '';
        data.users
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .forEach((u) => {
                const info = statusInfo[u.status] || statusInfo.pending;
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.85rem 0; border-bottom: 1px solid var(--color-border);';
                row.innerHTML = `
                    <div>
                        <strong style="word-break: break-all;">${u.email}</strong><br>
                        <span style="font-size: 0.8rem; font-weight: 600; color: ${info.color};">${info.label}</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
                        ${u.status !== 'approved' ? `<button class="admin-approve-btn" data-email="${u.email}" style="background: #10B981; color: white; border: none; padding: 0.45rem 0.85rem; border-radius: var(--radius-md); cursor: pointer; font-weight: 600; font-size: 0.8rem;">Liberar</button>` : ''}
                        ${u.status !== 'denied' ? `<button class="admin-deny-btn" data-email="${u.email}" style="background: var(--color-error); color: white; border: none; padding: 0.45rem 0.85rem; border-radius: var(--radius-md); cursor: pointer; font-weight: 600; font-size: 0.8rem;">Negar</button>` : ''}
                        ${u.status !== 'approved' ? `<button class="admin-delete-btn" data-email="${u.email}" title="Excluir solicitação" style="background: none; color: var(--color-text-light); border: 1px solid var(--color-border); padding: 0.45rem 0.7rem; border-radius: var(--radius-md); cursor: pointer; font-weight: 600; font-size: 0.8rem;">🗑</button>` : ''}
                    </div>
                `;
                list.appendChild(row);
            });

        list.querySelectorAll('.admin-approve-btn').forEach((btn) => {
            btn.addEventListener('click', () => handleAdminAction('approve', btn.dataset.email));
        });
        list.querySelectorAll('.admin-deny-btn').forEach((btn) => {
            btn.addEventListener('click', () => handleAdminAction('deny', btn.dataset.email));
        });
        list.querySelectorAll('.admin-delete-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (confirm(`Tem certeza que deseja excluir a solicitação de "${btn.dataset.email}"? Essa ação não pode ser desfeita.`)) {
                    handleAdminAction('delete-request', btn.dataset.email);
                }
            });
        });
    } catch (error) {
        list.innerHTML = `<p style="color: var(--color-error);">Não foi possível conectar ao servidor. Ele está rodando?</p>`;
    }
}

async function handleAdminAction(action, email) {
    try {
        const resp = await fetch(`${API_BASE}/api/admin/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-user': ADMIN_USER,
                'x-admin-pass': ADMIN_PASS
            },
            body: JSON.stringify({ email })
        });
        const data = await resp.json();

        if (data.success) {
            loadAdminUsers();
        } else {
            alert(data.error || 'Erro ao processar a ação.');
        }
    } catch (error) {
        alert('Não foi possível conectar ao servidor.');
    }
}

// --- Assistente de Oferta (Qual oferta? / Primeira notificação?) ---
const OFERTA_LABELS = {
    fsp: 'Fake social media (FSP)',
    efsp: 'Executive fake social media profile'
};

function openOfferWizard() {
    document.getElementById('offer-step-oferta').style.display = 'block';
    document.getElementById('offer-step-notificacao').style.display = 'none';
    document.getElementById('offer-overlay').style.display = 'flex';
}

function closeOfferWizard() {
    document.getElementById('offer-overlay').style.display = 'none';
}

function updateOfferLabel() {
    const label = document.getElementById('current-offer-text');
    if (!selectedOferta) {
        label.textContent = '';
        return;
    }
    const notifTexto = selectedPrimeiraNotificacao ? 'primeira notificação' : 'já notificado antes';
    label.textContent = `Oferta: ${OFERTA_LABELS[selectedOferta]} (${notifTexto})`;
}

document.querySelectorAll('.offer-choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        selectedOferta = btn.dataset.oferta;
        document.getElementById('offer-step-oferta').style.display = 'none';
        document.getElementById('offer-step-notificacao').style.display = 'block';
    });
});

document.querySelectorAll('.notificacao-choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        selectedPrimeiraNotificacao = btn.dataset.primeira === 'sim';
        updateOfferLabel();
        closeOfferWizard();
        isTemplateEdited = false; // força recalcular o template com a nova oferta
        generateTemplate();
    });
});

document.getElementById('offer-back-btn').addEventListener('click', () => {
    document.getElementById('offer-step-notificacao').style.display = 'none';
    document.getElementById('offer-step-oferta').style.display = 'block';
});

document.getElementById('change-offer-link').addEventListener('click', (e) => {
    e.preventDefault();
    openOfferWizard();
});

document.getElementById('logout-link').addEventListener('click', (e) => {
    e.preventDefault();
    clearSession();
    location.reload();
});

// --- Ao carregar a página: se já existe sessão salva, pula o login ---
// e vai direto para a pergunta "Qual oferta?" (a oferta em si não fica
// salva, só o fato de já estar logado).
(function restoreSessionOnLoad() {
    const session = loadSession();
    if (session && session.loggedIn) {
        isOwner = !!session.isOwner;
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('open-admin-btn').style.display = isOwner ? 'block' : 'none';
        openOfferWizard();
    }
})();
