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

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Chave Groq
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# Descobre onde o main.py está
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Monta os caminhos corretamente
static_dir = os.path.join(base_dir, "static")
templates_dir = os.path.join(base_dir, "templates")

app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    # Caminho absoluto para evitar erros na Vercel
    path = os.path.join(os.path.dirname(__file__), "..", "templates", "index.html")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def extrair_texto_pdf(conteudo_arquivo: bytes) -> str:
    doc = fitz.open(stream=conteudo_arquivo, filetype="pdf")
    return "".join([pagina.get_text() for pagina in doc])

@app.post("/classificar")
async def classificar_email(
    texto_direto: str = Form(None), 
    arquivo: UploadFile = File(None)
):
    conteudo_bruto = ""
    origem = "Texto Direto"
    
    # 1. CAPTURA DO CONTEÚDO (Sem remover caracteres especiais)
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

    # 2. SYSTEM INSTRUCTION MELHORADA
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

    # 3. PROMPT COM FOCO EM ESTRUTURA
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

    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.1, # Temperatura baixa para maior consistência técnica
            response_format={"type": "json_object"}
        )
        
        resultado_ia = json.loads(chat_completion.choices[0].message.content)
        
        return {
            "origem": origem,
            "conteudo_original": conteudo_bruto,
            **resultado_ia
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)