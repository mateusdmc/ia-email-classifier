    // ==========================================
    // VARIÁVEIS GLOBAIS DE ESTADO
    // ==========================================
    let currentAnalysisId = null;
    let currentModalItemId = null;
    let isAnalysisComplete = false;
    let currentPage = 1;
    const itemsPerPage = 5;

    // Inicializa o banco de dados na sessão caso não exista
    if (!sessionStorage.getItem('db')) {
        sessionStorage.setItem('db', JSON.stringify([]));
    }

    // ==========================================
    // NOTIFICAÇÕES (TOASTS)
    // ==========================================
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

    // ==========================================
    // CONTROLE DE INTERFACE (BOTÕES E TABS)
    // ==========================================
    function updateActionButtonsState() {
        const btnCopy = document.querySelector('button[onclick="copyResponse()"]');
        const btnEdit = document.getElementById('btnEditResponse');
        
        if (!btnCopy || !btnEdit) return;

        if (!isAnalysisComplete) {
            btnCopy.disabled = true;
            btnEdit.disabled = true;
            btnCopy.classList.add('opacity-30', 'cursor-not-allowed');
            btnEdit.classList.add('opacity-30', 'cursor-not-allowed');
        } else {
            btnCopy.disabled = false;
            btnEdit.disabled = false;
            btnCopy.classList.remove('opacity-30', 'cursor-not-allowed');
            btnEdit.classList.remove('opacity-30', 'cursor-not-allowed');
        }
    }

    // ==========================================
    // ANÁLISE PRINCIPAL (CONEXÃO BACKEND)
    // ==========================================
    async function realAnalysis() {
        const btn = document.getElementById('btnAnalisar');
        const input = document.getElementById('analyzeInput');
        const fileInput = document.getElementById('fileInput');
        const resultCard = document.getElementById('resultCard');
        const pulse = document.getElementById('resultPulse');

        if(!input.value && !fileInput.files[0]) return showToast("Insira texto ou anexo para analizar!", "error");

        // UI Loading
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
    

    // 1. Salvar no Banco da Sessão
    const db = JSON.parse(sessionStorage.getItem('db')) || [];
    const entry = { ...data, id: Date.now(), timestamp: new Date().toLocaleString() };
    db.unshift(entry);
    sessionStorage.setItem('db', JSON.stringify(db));


    // 2. ATIVAÇÃO DOS ESTADOS E BLOQUEIOS
    currentAnalysisId = entry.id;
    isAnalysisComplete = true;

    // Bloqueia o textarea e o label de arquivo
    const textarea = document.getElementById('analyzeInput');
    textarea.disabled = true;
    textarea.classList.add('cursor-not-allowed', 'opacity-50');
    
    document.getElementById('fileInputLabel').classList.add('cursor-not-allowed', 'opacity-50');
    const btnRemove = document.getElementById('btnRemoveFile');
    if (btnRemove) btnRemove.classList.add('hidden');

    // 3. TROCA DE BOTÕES
    document.getElementById('btnAnalisar').classList.add('hidden');
    document.getElementById('btnNovaAnalise').classList.remove('hidden');

    btn.innerText = "Analisar com IA";

    // 4. Atualizar Dashboard e UI
    updateActionButtonsState();
    updateUI(data);
    updateCounts();
    showToast("Análise concluída com sucesso!");

} catch (e) {
    showToast("Erro ao conectar ao servidor", "error");
    // Se der erro, precisamos garantir que o botão de analisar volte ao normal
    const btn = document.getElementById('btnAnalisar');
    btn.innerText = "Analisar com IA";
    btn.disabled = false;
} finally {
    // O finally agora só cuida de parar as animações visuais
    const pulse = document.getElementById('resultPulse');
    if (pulse) pulse.classList.remove('animate-ping');
    
    // NOTA: Não resetamos o texto do botão aqui, 
    // pois o Sucesso ou o Catch já decidiram qual botão exibir.
}
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

    // ==========================================
    // EDIÇÃO E CÓPIA
    // ==========================================
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
            saveEditToStorage(textDiv.innerText); // A função agora está definida abaixo
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
        navigator.clipboard.writeText(text).then(() => {
            showToast("Copiado!");
        });
    }

    // ==========================================
    // HISTÓRICO E PAGINAÇÃO
    // ==========================================
    function updateCounts() {
        const db = JSON.parse(sessionStorage.getItem('db'));
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
                <td class="px-6 py-5"><div class="font-bold text-sm">${item.assunto_resumo}</div><div class="text-xs text-slate-400">${item.remetente || 'Sem remetente'}</div></td>
                <td class="px-6 py-5 text-center"><span class="px-3 py-1 ${item.categoria === 'PRODUTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} rounded-lg text-[10px] font-bold uppercase">${item.categoria}</span></td>
                <td class="px-6 py-5 text-center text-xs text-slate-500">${item.timestamp}</td>
                <td class="px-6 py-5 text-right"><button onclick="openDetails(${item.id})" class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-indigo-700 transition-colors view-details"><div class="flex flex-row gap-2 justify-center items-center"><svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20" height="20" viewBox="0,0,256,256" class="icon-vermais">
<g fill="#ffffff" fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" font-family="none" font-weight="none" font-size="none" text-anchor="none" style="mix-blend-mode: normal"><g transform="scale(10.66667,10.66667)"><path d="M12,2c-5.51101,0 -10,4.489 -10,10c0,5.511 4.48899,10 10,10c5.51101,0 10,-4.489 10,-10c0,-5.511 -4.48899,-10 -10,-10zM12,4c4.43013,0 8,3.56988 8,8c0,4.43012 -3.56987,8 -8,8c-4.43013,0 -8,-3.56988 -8,-8c0,-4.43012 3.56987,-8 8,-8zM12,7c-0.55228,0 -1,0.44772 -1,1c0,0.55228 0.44772,1 1,1c0.55228,0 1,-0.44772 1,-1c0,-0.55228 -0.44772,-1 -1,-1zM11.98438,10.98633c-0.55152,0.00862 -0.99193,0.46214 -0.98437,1.01367v5c-0.0051,0.36064 0.18438,0.69608 0.49587,0.87789c0.3115,0.18181 0.69676,0.18181 1.00825,0c0.3115,-0.18181 0.50097,-0.51725 0.49587,-0.87789v-5c0.0037,-0.2703 -0.10218,-0.53059 -0.29351,-0.72155c-0.19133,-0.19097 -0.45182,-0.29634 -0.72212,-0.29212z"></path></g></g>
</svg> <div class="hidden_verdetalhes">Ver Detalhes</div></div></button></td>
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

    // Função openDetails atualizada para capturar o ID
    function openDetails(id) {
        const db = JSON.parse(sessionStorage.getItem('db')) || [];
        const item = db.find(x => x.id === id);
        if (!item) return;

        currentModalItemId = id; 

        // Textos Básicos
        document.getElementById('modalSender').innerText = item.remetente || "Não identificado";
        document.getElementById('modalReceiver').innerText = item.destinatario || "Não identificado";
        document.getElementById('modalFrom').innerText = item.origem;
        document.getElementById('modalDate').innerText = item.timestamp;
        document.getElementById('modalContent').innerText = item.conteudo_original;
        
        // Configuração da Resposta (Modo Leitura)
        const resDiv = document.getElementById('modalResponse');
        resDiv.innerText = item.resposta_sugerida;
        resDiv.contentEditable = "false";
        resDiv.classList.remove('bg-white', 'ring-2');
        document.getElementById('btnEditModal').innerText = "Editar";
        document.getElementById('btnEditModal').classList.remove('text-emerald-600');

        // --- O trecho que recuperamos acima ---
        const badge = document.getElementById('modalCategoryBadge');
        badge.innerHTML = `<span class="px-6 py-2 ${item.categoria === 'PRODUTIVO' ? 'bg-emerald-500' : 'bg-amber-500'} text-white rounded-full text-xs font-bold shadow-lg">${item.categoria}</span>`;

        const confidenceText = document.getElementById('modalConfidence');
        const confidenceBar = document.getElementById('confidenceBar');
        confidenceText.innerText = "0%";
        confidenceBar.style.width = "0%";
        
        setTimeout(() => {
            confidenceText.innerText = item.confianca + "%";
            confidenceBar.style.width = item.confianca + "%";
        }, 150);
        // ---------------------------------------

        // Mostrar Modal
        const modal = document.getElementById('emailModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    // FUNÇÃO PARA EDITAR/SALVAR NO MODAL
    function toggleEditModal() {
        const textDiv = document.getElementById('modalResponse');
        const btnEdit = document.getElementById('btnEditModal');
        const isEditable = textDiv.contentEditable === "true";

        if (!isEditable) {
            // Habilitar Edição
            textDiv.contentEditable = "true";
            textDiv.classList.add('bg-white', 'ring-2');
            textDiv.focus();
            btnEdit.innerText = "Salvar";
            btnEdit.classList.add('text-emerald-600');
        } else {
            // Salvar Alteração
            const newText = textDiv.innerText;
            updateDatabaseItem(currentModalItemId, newText);
            
            // Desabilitar Edição
            textDiv.contentEditable = "false";
            textDiv.classList.remove('bg-white', 'ring-2');
            btnEdit.innerText = "Editar";
            btnEdit.classList.remove('text-emerald-600');
            
            showToast("Histórico atualizado!");
        }
    }

    // FUNÇÃO PARA COPIAR TEXTO DO MODAL
    function copyModalResponse() {
        const text = document.getElementById('modalResponse').innerText;
        navigator.clipboard.writeText(text).then(() => {
            showToast("Copiado do modal!");
        });
    }

    // FUNÇÃO AUXILIAR PARA ATUALIZAR O DB
    function updateDatabaseItem(id, newText) {
        let db = JSON.parse(sessionStorage.getItem('db')) || [];
        db = db.map(item => {
            if (item.id === id) {
                return { ...item, resposta_sugerida: newText };
            }
            return item;
        });
        sessionStorage.setItem('db', JSON.stringify(db));
        
        // Se a tabela de histórico estiver visível, atualiza ela também
        if (typeof renderHistory === 'function') renderHistory();
    }


    function closeModal() {
        document.getElementById('emailModal').classList.replace('flex', 'hidden');
    }

    // 1. GERENCIAMENTO DE VALIDAÇÃO CRUZADA
    function handleInputValidation() {
        const textarea = document.getElementById('analyzeInput');
        const fileLabel = document.getElementById('fileInputLabel');
        const fileInput = document.getElementById('fileInput');

        if (textarea.value.trim().length > 0) {
            // Bloqueia anexo se houver texto
            fileLabel.classList.add('opacity-50', 'cursor-not-allowed');
            fileInput.disabled = true;
        } else {
            // Libera anexo se texto for apagado
            fileLabel.classList.remove('opacity-50', 'cursor-not-allowed');
            fileInput.disabled = false;
        }
    }

    // 2. GERENCIAMENTO DE SELEÇÃO DE ARQUIVO
    function handleFileSelection() {
        const fileInput = document.getElementById('fileInput');
        const textarea = document.getElementById('analyzeInput');
        const preview = document.getElementById('filePreview');
        const fileNameDisplay = document.getElementById('fileNameDisplay');
        const fileLabel = document.getElementById('fileInputLabel');

        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            
            // Exibe o preview e oculta o label de anexo original
            fileNameDisplay.innerText = file.name;
            preview.classList.remove('hidden');
            fileLabel.classList.add('hidden');

            // Bloqueia o textarea
            textarea.disabled = true;
            textarea.classList.add('opacity-50');
            textarea.placeholder = "Remova o arquivo para inserir o texto...";
            
            showToast("Arquivo anexado!");
        }
    }

    // 3. REMOÇÃO DO ARQUIVO
    function removeFile() {
        const fileInput = document.getElementById('fileInput');
        const textarea = document.getElementById('analyzeInput');
        const preview = document.getElementById('filePreview');
        const fileLabel = document.getElementById('fileInputLabel');

        // Limpa o input de arquivo
        fileInput.value = "";
        
        // UI: Volta ao estado original
        preview.classList.add('hidden');
        fileLabel.classList.remove('hidden');
        
        // Libera o textarea
        textarea.disabled = false;
        textarea.classList.remove('opacity-50');
        textarea.placeholder = "Cole o texto do e-mail aqui...";
        
        showToast("Arquivo removido", "success");
    }

function resetAnalysis() {
    // 1. Referências dos elementos
    const btnAnalisar = document.getElementById('btnAnalisar');
    const btnNova = document.getElementById('btnNovaAnalise');
    const textarea = document.getElementById('analyzeInput');
    const fileLabel = document.getElementById('fileInputLabel');
    const fileInput = document.getElementById('fileInput');
    const preview = document.getElementById('filePreview');
    const btnRemove = document.getElementById('btnRemoveFile');

    // 2. Reset de Estados Globais
    isAnalysisComplete = false;
    currentAnalysisId = null;

    // 3. Restaurar Textarea
    textarea.value = "";
    textarea.disabled = false;
    textarea.classList.remove('opacity-50', 'cursor-not-allowed');
    textarea.style.pointerEvents = "auto";
    textarea.placeholder = "Cole o texto do e-mail aqui...";

    // 4. Restaurar Anexo (Limpeza e reativação)
    fileInput.value = ""; 
    fileInput.disabled = false; 
    preview.classList.add('hidden'); // Esconde o preview azul do arquivo anterior
    
    // Garante que o botão de remover volte a ficar visível para quando um NOVO arquivo for selecionado
    if (btnRemove) {
        btnRemove.classList.remove('hidden');
    }

    // Mostra o label tracejado original e remove bloqueios
    fileLabel.classList.remove('hidden', 'cursor-not-allowed', 'opacity-50');
    fileLabel.style.pointerEvents = "auto";
    // fileLabel.style.cursor = "pointer";

    // 5. Alternar Botões principais
    btnNova.classList.add('hidden');
    btnAnalisar.classList.remove('hidden');
    btnAnalisar.innerText = "Analisar com IA";
    btnAnalisar.disabled = false;

    // 6. Reset Visual do Card de Resultado (Mantendo sua identidade)
    const resultCard = document.getElementById('resultCard');
    if (resultCard) resultCard.classList.add('opacity-50');

    const resText = document.getElementById('aiResponseText');
    if (resText) {
        resText.innerText = "O resultado aparecerá aqui...";
        resText.classList.add('italic', 'text-slate-400');
        resText.classList.remove('text-white');
    }
    
    const badge = document.getElementById('categoryBadge');
    if (badge) {
        badge.innerText = "Aguardando entrada...";
        badge.className = "px-5 py-2 bg-slate-800 text-slate-400 rounded-full text-xs font-bold border border-white/10 italic";
    }

    // 7. Sincronizar botões de Copiar/Editar do card
    updateActionButtonsState();

    showToast("Pronto para nova consulta!", "success");
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('hidden');
}
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.getElementById('btn-' + tabId).classList.add('active');
    if(tabId === 'history') renderHistory();
    if(window.innerWidth < 1024) toggleSidebar();
}

    // Inicializar interface
    window.onload = () => {
        updateCounts();
        updateActionButtonsState();
    };