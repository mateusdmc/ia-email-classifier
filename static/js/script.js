// ============================================================
// 1. VARIÁVEIS GLOBAIS E ESTADO DA APLICAÇÃO
// ============================================================
let currentAnalysisId = null;
let currentModalItemId = null;
let isAnalysisComplete = false;
let currentPage = 1;
const itemsPerPage = 5;

// Inicializa o "banco de dados" na sessão caso não exista
if (!sessionStorage.getItem('db')) {
    sessionStorage.setItem('db', JSON.stringify([]));
}

// ============================================================
// 2. SISTEMA DE NOTIFICAÇÕES (TOASTS)
// ============================================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-emerald-600' : 'bg-red-600';
    
    toast.className = `${bgColor} text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 transform translate-x-full transition-all duration-300 ease-out pointer-events-auto border border-white/10`;
    toast.innerHTML = `
        <span class="text-sm font-bold">${message}</span>
        <button onclick="this.parentElement.remove()" class="text-white/50 hover:text-white">×</button>
    `;
    
    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-x-full'), 10);
    
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================================
// 3. COMUNICAÇÃO COM O BACKEND E ANÁLISE
// ============================================================
async function realAnalysis() {
    const btn = document.getElementById('btnAnalisar');
    const input = document.getElementById('analyzeInput');
    const fileInput = document.getElementById('fileInput');
    const resultCard = document.getElementById('resultCard');
    const pulse = document.getElementById('resultPulse');

    // Validação de entrada
    if(!input.value && !fileInput.files[0]) return showToast("Insira texto ou anexo para analizar!", "error");

    // UI Loading State
    btn.innerText = "IA Processando...";
    btn.disabled = true;
    resultCard.classList.remove('opacity-50');
    pulse.classList.add('animate-ping', 'bg-indigo-500');

    const formData = new FormData();
    if(input.value) formData.append('texto_direto', input.value);
    if(fileInput.files[0]) formData.append('arquivo', fileInput.files[0]);
    
    try {
        const response = await fetch('/classificar', { method: 'POST', body: formData });
        const data = await response.json();
        
        // Salvar no Histórico (SessionStorage)
        const db = JSON.parse(sessionStorage.getItem('db')) || [];
        const entry = { ...data, id: Date.now(), timestamp: new Date().toLocaleString() };
        db.unshift(entry);
        sessionStorage.setItem('db', JSON.stringify(db));

        // Atualização de Estados
        currentAnalysisId = entry.id;
        isAnalysisComplete = true;

        // Bloqueio de Inputs após análise
        const textarea = document.getElementById('analyzeInput');
        textarea.disabled = true;
        textarea.classList.add('cursor-not-allowed', 'opacity-50');
        document.getElementById('fileInputLabel').classList.add('cursor-not-allowed', 'opacity-50');
        
        const btnRemove = document.getElementById('btnRemoveFile');
        if (btnRemove) btnRemove.classList.add('hidden');

        // Troca de botões de ação
        document.getElementById('btnAnalisar').classList.add('hidden');
        document.getElementById('btnNovaAnalise').classList.remove('hidden');
        btn.innerText = "Analisar com IA";

        // Atualizar Dashboard
        updateActionButtonsState();
        updateUI(data);
        updateCounts();
        showToast("Análise concluída com sucesso!");

    } catch (e) {
        showToast("Erro ao conectar ao servidor", "error");
        btn.innerText = "Analisar com IA";
        btn.disabled = false;
    } finally {
        if (pulse) pulse.classList.remove('animate-ping');
    }
}

// ============================================================
// 4. GERENCIAMENTO DO HISTÓRICO E DASHBOARD
// ============================================================
function updateCounts() {
    const db = JSON.parse(sessionStorage.getItem('db')) || [];
    document.getElementById('countTotal').innerText = db.length;
    document.getElementById('countProd').innerText = db.filter(x => x.categoria === 'PRODUTIVO').length;
    document.getElementById('countImp').innerText = db.filter(x => x.categoria === 'IMPRODUTIVO').length;
}

function renderHistory() {
    const db = JSON.parse(sessionStorage.getItem('db')) || [];
    const body = document.getElementById('historyBody');
    const totalPages = Math.ceil(db.length / itemsPerPage) || 1;
    
    const start = (currentPage - 1) * itemsPerPage;
    const paginatedItems = db.slice(start, start + itemsPerPage);

    body.innerHTML = paginatedItems.map(item => `
        <tr class="hover:bg-slate-50 transition-all border-b border-slate-50">
            <td class="px-6 py-5">
                <div class="font-bold text-sm">${item.assunto_resumo}</div>
                <div class="text-xs text-slate-400">${item.remetente || 'Sem remetente'}</div>
            </td>
            <td class="px-6 py-5 text-center">
                <span class="px-3 py-1 ${item.categoria === 'PRODUTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} rounded-lg text-[10px] font-bold uppercase">${item.categoria}</span>
            </td>
            <td class="px-6 py-5 text-center text-xs text-slate-500">${item.timestamp}</td>
            <td class="px-6 py-5 text-right">
                <button onclick="openDetails(${item.id})" class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-indigo-700 transition-colors">
                    Ver Detalhes
                </button>
            </td>
        </tr>
    `).join('');

    document.getElementById('pageInfo').innerText = `Página ${currentPage} de ${totalPages}`;
    document.getElementById('btnPrev').disabled = (currentPage === 1);
    document.getElementById('btnNext').disabled = (currentPage === totalPages);
}

function changePage(direction) {
    currentPage += direction;
    renderHistory();
}

// ============================================================
// 5. EDIÇÃO E CÓPIA DE RESPOSTAS
// ============================================================
function toggleEdit() {
    if (!isAnalysisComplete) return;

    const textDiv = document.getElementById('aiResponseText');
    const btnEdit = document.getElementById('btnEditResponse');
    const isEditable = textDiv.contentEditable === "true";

    if (!isEditable) {
        textDiv.contentEditable = "true";
        textDiv.classList.add('bg-white/10', 'border-indigo-500', 'text-white');
        textDiv.focus();
        btnEdit.innerText = "Salvar Alteração";
        btnEdit.classList.replace('bg-indigo-600', 'bg-emerald-600');
    } else {
        saveEditToStorage(textDiv.innerText);
        textDiv.contentEditable = "false";
        textDiv.classList.remove('border-indigo-500');
        btnEdit.innerText = "Editar Resposta";
        btnEdit.classList.replace('bg-emerald-600', 'bg-indigo-600');
        showToast("Edição salva no histórico!");
    }
}

function saveEditToStorage(newText) {
    let db = JSON.parse(sessionStorage.getItem('db')) || [];
    db = db.map(item => {
        if (item.id === currentAnalysisId) {
            return { ...item, resposta_sugerida: newText };
        }
        return item;
    });
    sessionStorage.setItem('db', JSON.stringify(db));
}

function copyResponse() {
    if (!isAnalysisComplete) return;
    const text = document.getElementById('aiResponseText').innerText;
    navigator.clipboard.writeText(text).then(() => showToast("Copiado!"));
}

// ============================================================
// 6. MODAL DE DETALHES
// ============================================================
function openDetails(id) {
    const db = JSON.parse(sessionStorage.getItem('db')) || [];
    const item = db.find(x => x.id === id);
    if (!item) return;

    currentModalItemId = id; 

    // Preenchimento de dados no modal
    document.getElementById('modalSender').innerText = item.remetente || "Não identificado";
    document.getElementById('modalReceiver').innerText = item.destinatario || "Não identificado";
    document.getElementById('modalFrom').innerText = item.origem;
    document.getElementById('modalDate').innerText = item.timestamp;
    document.getElementById('modalContent').innerText = item.conteudo_original;
    
    const resDiv = document.getElementById('modalResponse');
    resDiv.innerText = item.resposta_sugerida;
    resDiv.contentEditable = "false";

    const badge = document.getElementById('modalCategoryBadge');
    badge.innerHTML = `<span class="px-6 py-2 ${item.categoria === 'PRODUTIVO' ? 'bg-emerald-500' : 'bg-amber-500'} text-white rounded-full text-xs font-bold shadow-lg">${item.categoria}</span>`;

    // Animação da barra de confiança
    const confidenceText = document.getElementById('modalConfidence');
    const confidenceBar = document.getElementById('confidenceBar');
    confidenceText.innerText = "0%";
    confidenceBar.style.width = "0%";
    
    setTimeout(() => {
        confidenceText.innerText = item.confianca + "%";
        confidenceBar.style.width = item.confianca + "%";
    }, 150);

    const modal = document.getElementById('emailModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    document.getElementById('emailModal').classList.replace('flex', 'hidden');
}

// ============================================================
// 7. MANIPULAÇÃO DE ARQUIVOS E INPUTS
// ============================================================
function handleFileSelection() {
    const fileInput = document.getElementById('fileInput');
    const textarea = document.getElementById('analyzeInput');
    const preview = document.getElementById('filePreview');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const fileLabel = document.getElementById('fileInputLabel');

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        fileNameDisplay.innerText = file.name;
        preview.classList.remove('hidden');
        fileLabel.classList.add('hidden');

        textarea.disabled = true;
        textarea.classList.add('opacity-50');
        textarea.placeholder = "Remova o arquivo para inserir o texto...";
        showToast("Arquivo anexado!");
    }
}

function removeFile() {
    const fileInput = document.getElementById('fileInput');
    const textarea = document.getElementById('analyzeInput');
    const preview = document.getElementById('filePreview');
    const fileLabel = document.getElementById('fileInputLabel');

    fileInput.value = "";
    preview.classList.add('hidden');
    fileLabel.classList.remove('hidden');
    
    textarea.disabled = false;
    textarea.classList.remove('opacity-50');
    textarea.placeholder = "Cole o texto do e-mail aqui...";
    showToast("Arquivo removido", "success");
}

// ============================================================
// 8. UTILITÁRIOS DE INTERFACE E RESET
// ============================================================
function resetAnalysis() {
    const btnAnalisar = document.getElementById('btnAnalisar');
    const btnNova = document.getElementById('btnNovaAnalise');
    const textarea = document.getElementById('analyzeInput');
    const fileLabel = document.getElementById('fileInputLabel');
    const fileInput = document.getElementById('fileInput');
    const preview = document.getElementById('filePreview');

    isAnalysisComplete = false;
    currentAnalysisId = null;

    textarea.value = "";
    textarea.disabled = false;
    textarea.classList.remove('opacity-50', 'cursor-not-allowed');
    
    fileInput.value = ""; 
    preview.classList.add('hidden');
    fileLabel.classList.remove('hidden', 'cursor-not-allowed', 'opacity-50');

    btnNova.classList.add('hidden');
    btnAnalisar.classList.remove('hidden');

    document.getElementById('resultCard').classList.add('opacity-50');
    document.getElementById('aiResponseText').innerText = "O resultado aparecerá aqui...";
    
    updateActionButtonsState();
    showToast("Pronto para nova consulta!", "success");
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.getElementById('btn-' + tabId).classList.add('active');
    
    if(tabId === 'history') renderHistory();
    if(window.innerWidth < 1024) toggleSidebar();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('hidden');
}

function updateActionButtonsState() {
    const btnCopy = document.querySelector('button[onclick="copyResponse()"]');
    const btnEdit = document.getElementById('btnEditResponse');
    
    if (!btnCopy || !btnEdit) return;

    const state = !isAnalysisComplete;
    btnCopy.disabled = state;
    btnEdit.disabled = state;
    btnCopy.classList.toggle('opacity-30', state);
    btnEdit.classList.toggle('opacity-30', state);
}

function updateUI(data) {
    const badge = document.getElementById('categoryBadge');
    const resText = document.getElementById('aiResponseText');
    badge.innerText = data.categoria;
    badge.className = data.categoria === 'PRODUTIVO' ? 
        "px-5 py-2 bg-emerald-500 text-white rounded-full text-xs font-bold" : 
        "px-5 py-2 bg-amber-500 text-white rounded-full text-xs font-bold";
    resText.innerText = data.resposta_sugerida;
    resText.classList.remove('italic', 'text-slate-400');
    resText.classList.add('text-white');
}

// Inicialização ao carregar a página
window.onload = () => {
    updateCounts();
    updateActionButtonsState();
};