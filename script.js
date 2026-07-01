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

elements.addClientBtn.addEventListener('click', addClient);

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

    let template = '';

    if (clientsData.length === 1) {
        template = `Dear Telegram,

The following profile are using the brand ${clientsData[0].client} to commit scams:

${clientsData[0].urls.join('\n')}

Can you help us by removing it from Telegram?`;
    } else {
        const listText = clientsData.map(item => `- ${item.client}:\n  ${item.urls.join('\n  ')}`).join('\n\n');
        
        template = `Dear Telegram,

The following profiles are using our clients' brands to commit scams:

${listText}

Can you help us by removing them from Telegram?`;
    }

    elements.previewText.value = template;
    elements.submitBtn.disabled = false;
    elements.copyBtn.disabled = false;
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
        const response = await fetch('http://localhost:3000/api/send-report', {
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
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

loginBtn.addEventListener('click', async () => {
    const userVal = document.getElementById('login-username').value.trim();
    const passVal = document.getElementById('login-password').value.trim();

    const originalText = loginBtn.textContent;
    loginBtn.textContent = 'Verificando...';
    loginBtn.disabled = true;
    loginError.style.display = 'none';

    try {
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: userVal, pass: passVal }),
        });
        const data = await response.json();

        if (data.success) {
            document.getElementById('login-overlay').style.display = 'none';
        } else {
            loginError.style.display = 'block';
            loginBtn.textContent = originalText;
            loginBtn.disabled = false;
        }
    } catch {
        loginError.style.display = 'block';
        loginBtn.textContent = originalText;
        loginBtn.disabled = false;
    }
});

document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
});
