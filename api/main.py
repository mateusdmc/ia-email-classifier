import os
import re
import io
import json
import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq

# ============================================================
# CONFIGURAÇÃO INICIAL DA APLICAÇÃO
# ============================================================
app = FastAPI()

# Middleware para permitir requisições de diferentes origens (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicialização do cliente Groq via variável de ambiente
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# ============================================================
# GESTÃO DE DIRETÓRIOS E ARQUIVOS ESTÁTICOS
# ============================================================
# Localização dinâmica dos diretórios para compatibilidade com deploy (Vercel)
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
static_dir = os.path.join(base_dir, "static")
templates_dir = os.path.join(base_dir, "templates")

# Montagem da pasta static para servir CSS e JS
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# ============================================================
# ROTAS DA API
# ============================================================

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """Rota principal que serve o frontend (index.html)"""
    path = os.path.join(os.path.dirname(__file__), "..", "templates", "index.html")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def extrair_texto_pdf(conteudo_arquivo: bytes) -> str:
    """Função auxiliar para ler e extrair texto de arquivos PDF"""
    doc = fitz.open(stream=conteudo_arquivo, filetype="pdf")
    return "".join([pagina.get_text() for pagina in doc])

@app.post("/classificar")
async def classificar_email(
    texto_direto: str = Form(None), 
    arquivo: UploadFile = File(None)
):
    """
    Endpoint principal de processamento. 
    Aceita texto puro via formulário ou upload de arquivos (PDF/TXT).
    """
    conteudo_bruto = ""
    origem = "Texto Direto"
    
    # --- 1. CAPTURA E PROCESSAMENTO DO INPUT ---
    if texto_direto:
        conteudo_bruto = texto_direto
    elif arquivo:
        origem = arquivo.filename
        extensao = arquivo.filename.split('.')[-1].lower()
        bytes_arquivo = await arquivo.read()
        
        if extensao == 'pdf': 
            conteudo_bruto = extrair_texto_pdf(bytes_arquivo)
        elif extensao == 'txt': 
            conteudo_bruto = bytes_arquivo.decode('utf-8', errors='ignore')
    
    if not conteudo_bruto:
        raise HTTPException(status_code=400, detail="Conteúdo vazio.")

    # --- 2. DEFINIÇÃO DAS REGRAS DE NEGÓCIO (PROMPT SYSTEM) ---
    system_instruction = """Você é um Analista de Operações Financeiras especializado em triagem de e-mails.
    
    SUA TAREFA PRINCIPAL: Extrair metadados técnicos com precisão absoluta.
    
    REGRAS PARA REMETENTE E DESTINATÁRIO:
    1. Extraia o endereço de e-mail COMPLETO (ex: nome@empresa.com.br). 
    2. NUNCA remova o símbolo '@' ou os pontos do domínio.
    3. Remetente: É quem enviou a mensagem (procure por 'De:', 'From:', ou na assinatura final).
    4. Destinatário: É o alvo da mensagem (procure por 'Para:', 'To:', ou no corpo da saudação).
    5. Se houver um histórico de mensagens abaixo, foque APENAS na mensagem mais recente (a do topo).
    
    CRITÉRIOS DE CLASSIFICAÇÃO:
    - PRODUTIVO: Demandas de trabalho, solicitações, envio de documentos, dúvidas técnicas.
    - IMPRODUTIVO: "Obrigado", "Recebido", avisos de férias (Out of Office), propagandas ou saudações vazias."""

    # --- 3. CONSTRUÇÃO DO PROMPT DE USUÁRIO ---
    prompt = f"""
    Analise o e-mail abaixo e extraia as informações em JSON. 
    Mantenha os endereços de e-mail intactos.

    ### CONTEÚDO DO E-MAIL ###
    {conteudo_bruto}

    ### FORMATO DE SAÍDA (JSON APENAS) ###
    {{
        "categoria": "PRODUTIVO ou IMPRODUTIVO",
        "confianca": 0-100,
        "remetente": "email@exemplo.com",
        "destinatario": "email@exemplo.com",
        "assunto_resumo": "Resumo em 10 palavras",
        "resposta_sugerida": "Texto da resposta formal"
    }}
    """

    # --- 4. CHAMADA À API DA GROQ (IA) ---
    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.1, # Estabilidade: valores baixos evitam 'criatividade' indesejada em dados técnicos
            response_format={"type": "json_object"} # Garante que a IA responda um JSON válido
        )
        
        # Conversão da resposta da IA em dicionário Python
        resultado_ia = json.loads(chat_completion.choices[0].message.content)
        
        return {
            "origem": origem,
            "conteudo_original": conteudo_bruto,
            **resultado_ia
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# EXECUÇÃO DO SERVIDOR
# ============================================================
if __name__ == "__main__":
    import uvicorn
    # Inicia o servidor local na porta 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)