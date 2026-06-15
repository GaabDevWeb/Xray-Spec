# Xray — Análise de Especificações

Motor de análise de especificações baseado em LLM. O Xray avalia a **qualidade da sua especificação** (prompt, requisito ou briefing) *antes* de você enviá-la a uma IA ou time de desenvolvimento, identificando lacunas, ambiguidades e suposições ocultas em 6 dimensões ponderadas, com um score de 0 a 100.

Não é um gerador de prompts: é um diagnóstico educativo de *spec engineering*.

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Backend | Python + FastAPI (Pydantic v2, httpx async) |
| Frontend | HTML + CSS + JavaScript vanilla (sem build step) |
| Gráfico | Chart.js (radar) via CDN |
| LLM | OpenRouter (chave apenas server-side) |
| Persistência | LocalStorage no navegador (histórico de 50 análises) |

```
backend/app/
  main.py              FastAPI app, CORS, rate limit, handler de erros
  config.py            settings via variáveis de ambiente
  routes/              /api/analyze, /api/health
  schemas/             request/response Pydantic (schema v1.0)
  services/            openrouter, prompt_builder, analyzer, score
  middleware/          rate limit por IP
frontend/
  index.html
  css/styles.css
  js/                  app, api, validator, renderer, radar, history, highlight
```

## Pré-requisitos

- Python 3.10+ (testado em 3.13)
- Uma conta no [OpenRouter](https://openrouter.ai) com uma API key

## Configuração

1. Copie o arquivo de exemplo de variáveis de ambiente e preencha sua chave:

```bash
cp .env.example .env
```

2. Edite `.env` conforme o provedor escolhido:

**Gemini (recomendado se você tem chave Google AI):**
```env
XRAY_LLM_PROVIDER=gemini
GEMINI_API_KEY=sua-chave-aqui
XRAY_DEFAULT_MODEL=gemini-3-flash
```

**OpenRouter:**
```env
XRAY_LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
XRAY_DEFAULT_MODEL=anthropic/claude-sonnet-4.5
```

As demais variáveis têm defaults sensatos (veja a tabela abaixo).

| Variável | Default | Descrição |
|---|---|---|
| `XRAY_LLM_PROVIDER` | `openrouter` | Provedor LLM: `openrouter` ou `gemini` |
| `OPENROUTER_API_KEY` | (vazio) | Chave OpenRouter (obrigatória se provider=openrouter) |
| `GEMINI_API_KEY` | (vazio) | Chave Google AI / Gemini (obrigatória se provider=gemini) |
| `XRAY_DEFAULT_MODEL` | *(por provedor)* | Modelo de análise. Se vazio: `gemini-3-flash` (Gemini) ou `anthropic/claude-sonnet-4.5` (OpenRouter) |
| `XRAY_FALLBACK_MODEL` | `openai/gpt-4o-mini` | Modelo de fallback OpenRouter (reservado) |
| `XRAY_CORS_ORIGINS` | `http://localhost:5500,...` | Origens permitidas no CORS |
| `XRAY_RATE_LIMIT` | `10` | Requisições por minuto por IP |
| `XRAY_LLM_TIMEOUT` | `25` | Timeout (segundos) da chamada ao LLM |

> Obtenha a chave Gemini em [Google AI Studio](https://aistudio.google.com/apikey).

## Executando

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

A documentação interativa da API fica em `http://localhost:8000/docs`.

### 2. Frontend

Sirva a pasta `frontend/` por HTTP (não abra via `file://`, pois os módulos ES exigem origem HTTP). Por exemplo:

```bash
cd frontend
python3 -m http.server 5500 --bind 127.0.0.1
```

Acesse `http://127.0.0.1:5500`. Garanta que a porta usada esteja listada em `XRAY_CORS_ORIGINS`.

> O frontend chama o backend em `http://localhost:8000` (constante `API_BASE` em `frontend/js/config.js`). Ajuste se você rodar o backend em outra porta/host.

## Uso

1. Escolha o tipo de entrada: Prompt, Requisito ou Briefing (calibra a análise).
2. Cole sua especificação (entre 10 e 10.000 caracteres).
3. Clique em Analisar (ou pressione Ctrl+Enter).
4. Explore o resultado: score, radar das 6 dimensões, lacunas, ambiguidades, suposições, sugestões e a versão Before/After.
5. Edite o texto e re-analise para ver o delta de score. As análises ficam salvas no histórico local.

## API

### `POST /api/analyze`

```bash
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"Crie um sistema de vendas para pequenas empresas utilizando Python.","type":"prompt"}'
```

Resposta: JSON no schema v1.0 (score, dimensões, gaps, ambiguities, assumptions, suggestions, improved_spec).

| Status | Condição |
|---|---|
| 200 | Análise concluída |
| 400 | Texto vazio, `< 10` ou `> 10.000` caracteres, ou `type` inválido |
| 422 | JSON do LLM inválido após 1 retry |
| 429 | Rate limit atingido (10 req/min/IP) |
| 502 | OpenRouter indisponível |
| 504 | Timeout na chamada ao OpenRouter |

### `GET /api/health`

```bash
curl http://localhost:8000/api/health
# {"status":"ok","openrouter":"connected"}
```

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| Banner "Sem conexão" no frontend | Backend fora do ar ou CORS bloqueando | Verifique se o backend está rodando e se a origem do frontend está em `XRAY_CORS_ORIGINS` |
| Erro de CORS no console do navegador | Origem do frontend não permitida | Ajuste `XRAY_CORS_ORIGINS` e reinicie o backend |
| HTTP 502 ao analisar | Modelo sem créditos, chave inválida ou provedor indisponível | Verifique `XRAY_LLM_PROVIDER` e a chave (`GEMINI_API_KEY` ou `OPENROUTER_API_KEY`) |
| HTTP 504 / "Tempo esgotado" | Modelo lento (acima de 25s no backend ou 30s no cliente) | Use um modelo mais rápido em `XRAY_DEFAULT_MODEL` |
| `/api/health` retorna `degraded` | Chave ausente/inválida ou API inacessível | Confira provider + chave no `.env` |

## Escopo (V1)

Inclui análise via LLM, scoring em 6 dimensões, detecção de lacunas/ambiguidades/suposições, sugestões priorizadas, comparativo Before/After, radar e histórico local.

Fora de escopo na V1: autenticação, banco de dados, dark mode, exportação, templates de requisitos e integração com IDEs (ver `cursor/PRD.md` §16 para o roadmap).
