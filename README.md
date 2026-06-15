# Xray

> Raio-X de especificações — inspeciona prompts, requisitos e briefings antes de enviá-los a uma IA ou time de desenvolvimento.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Stack](https://img.shields.io/badge/stack-FastAPI%20%7C%20Vanilla%20JS-informational)]()

O Xray analisa a qualidade estrutural de uma especificação em seis dimensões ponderadas, atribui um score de 0 a 100 e devolve um diagnóstico acionável: lacunas, ambiguidades, suposições ocultas, sugestões e uma proposta de revisão (before/after). O sistema **não inventa requisitos** — revela o que falta clarificar.

---

## Sumário

- [Hero](#hero)
- [Quick Start](#quick-start)
- [Visão Sistêmica](#visão-sistêmica)
- [Arquitetura Deep Dive](#arquitetura-deep-dive)
- [Fluxos de Dados & Estados](#fluxos-de-dados--estados)
- [Documentação de Interface](#documentação-de-interface)
- [Manutenibilidade](#manutenibilidade)
- [Contribuição & Git Flow](#contribuição--git-flow)
- [Referências & Glossário](#referências--glossário)

---

## Hero

Ver [topo](#xray).

---

## Quick Start

**Pré-requisitos:** Python 3.11+, chave de API (OpenRouter ou Gemini).

```bash
# 1. Configurar ambiente
cp .env.example .env
# Edite .env com sua chave e provedor

# 2. Backend (terminal 1)
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000 --host 127.0.0.1

# 3. Frontend (terminal 2)
cd frontend
python3 -m http.server 5500 --bind 127.0.0.1
```

Abra **http://127.0.0.1:5500**, cole uma especificação (mín. 10 caracteres) e clique **Escanear**.

| Serviço | URL |
|---------|-----|
| Frontend | http://127.0.0.1:5500 |
| API | http://127.0.0.1:8000 |
| Swagger | http://127.0.0.1:8000/docs |

**Falha comum:** CORS bloqueado — confirme que `XRAY_CORS_ORIGINS` inclui a origem exata do frontend.

<details>
<summary><strong>Variáveis de ambiente</strong></summary>

| Variável | Obrigatória | Default | Descrição |
|----------|-------------|---------|-----------|
| `XRAY_LLM_PROVIDER` | não | `openrouter` | `openrouter` ou `gemini` |
| `OPENROUTER_API_KEY` | se openrouter | — | Chave OpenRouter |
| `GEMINI_API_KEY` | se gemini | — | Chave Google Gemini |
| `XRAY_DEFAULT_MODEL` | não | por provedor | Modelo LLM |
| `XRAY_CORS_ORIGINS` | não | localhost:5500 | Origens CORS (vírgula) |
| `XRAY_RATE_LIMIT` | não | `10` | Req/min por IP |
| `XRAY_LLM_TIMEOUT` | não | `25` | Timeout LLM (segundos) |

Ver `.env.example` para template completo.

</details>

---

## Visão Sistêmica

O Xray opera como um pipeline de inspeção: o frontend valida entrada localmente, o backend orquestra a chamada LLM, valida o JSON de resposta e recalcula o score como fonte de verdade.

```mermaid
flowchart LR
  subgraph client [Frontend]
    UI[index.html + app.js]
    LS[(LocalStorage)]
  end
  subgraph server [Backend FastAPI]
    API["/api/analyze"]
    LLM[LLM Dispatcher]
    Score[score.py]
  end
  subgraph external [External]
    OR[OpenRouter]
    GM[Gemini]
  end
  UI -->|POST JSON| API
  API --> LLM
  LLM --> OR
  LLM --> GM
  API --> Score
  API -->|AnalysisResponse| UI
  UI --> LS
```

**Stakeholders:** desenvolvedores e product owners que escrevem specs para LLMs ou times técnicos.

---

## Arquitetura Deep Dive

| Componente | Responsabilidade | Tecnologia |
|------------|------------------|------------|
| `frontend/js/app.js` | Máquina de estados, scan, histórico | Vanilla JS (ES modules) |
| `frontend/js/renderer.js` | Stream de inspeção, telemetria, diff | DOM |
| `backend/app/routes/analyze.py` | Endpoint de análise | FastAPI |
| `backend/app/services/analyzer.py` | Prompt → LLM → validação → retry | asyncio |
| `backend/app/services/llm.py` | Dispatcher openrouter \| gemini | httpx |
| `backend/app/services/score.py` | Recálculo ponderado do score | Pydantic |
| `backend/app/middleware/rate_limit.py` | Rate limit por IP em `/api/*` | ASGI middleware |

**Decisão:** score recalculado no backend (não confia no total do LLM). **Decisão:** retry único se JSON inválido → 422.

**Dimensões e pesos:**

| Dimensão | Peso |
|----------|------|
| Contexto | 20% |
| Objetivo | 20% |
| Restrições | 15% |
| Especificidade | 15% |
| Clareza | 15% |
| Critérios de Sucesso | 15% |

---

## Fluxos de Dados & Estados

```mermaid
sequenceDiagram
  participant U as Utilizador
  participant FE as Frontend
  participant BE as Backend
  participant LLM as LLM Provider
  U->>FE: Cola spec + Escanear
  FE->>FE: validateInput 10-10000 chars
  FE->>BE: POST /api/analyze
  BE->>BE: rate limit check
  BE->>LLM: prompt + JSON mode
  LLM-->>BE: AnalysisResponse JSON
  BE->>BE: Pydantic validate + score
  BE-->>FE: 200 AnalysisResponse
  FE->>FE: render stream + save history
```

**Estados do frontend:** `Initializing` → `Idle`/`Ready` → `Analyzing` → `Results` | `ErrorState` | `OfflineMode`

---

## Documentação de Interface

### `GET /api/health`

Verifica conectividade com o provedor LLM.

```bash
curl -s http://127.0.0.1:8000/api/health
```

```json
{"status":"ok","provider":"openrouter","llm":"connected","openrouter":"connected"}
```

### `POST /api/analyze`

Analisa uma especificação.

```bash
curl -sS -X POST "http://127.0.0.1:8000/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Crie um sistema de login com email e senha para usuários internos.",
    "type": "requirement"
  }'
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `text` | string | sim | 10–10.000 caracteres |
| `type` | enum | sim | `prompt` \| `requirement` \| `briefing` |
| `model` | string | não | Override do modelo LLM |

| Status | Significado |
|--------|-------------|
| 200 | Análise concluída |
| 400 | Validação de entrada |
| 422 | JSON do LLM inválido após retry |
| 429 | Rate limit excedido |
| 502 | LLM indisponível |
| 504 | Timeout LLM |

Documentação interativa: http://127.0.0.1:8000/docs

---

## Manutenibilidade

**Estrutura do repositório:**

```
Xray-Spec/
├── backend/app/          # FastAPI application
│   ├── routes/           # /api/health, /api/analyze
│   ├── schemas/          # Pydantic request/response
│   ├── services/         # LLM, analyzer, score, prompts
│   └── middleware/       # Rate limiting (required)
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/               # ES modules, no bundler
├── .env.example
└── LICENSE
```

**Frontend timeout:** `frontend/js/config.js` define `REQUEST_TIMEOUT_MS = 90000` — modelos free podem demorar >60s.

**Histórico:** até 50 análises em `localStorage` (`xray_history`). Texto da spec **não** persiste no backend.

---

## Contribuição & Git Flow

1. Fork → branch feature → PR
2. Não commitar `.env`, `__pycache__/`, `.venv/`
3. Testar localmente: backend :8000 + frontend :5500

Convenção de commits: imperativo, foco no *why* (`add`, `fix`, `refactor`).

---

## Referências & Glossário

| Termo | Definição |
|-------|-----------|
| **Spec Health** | Score 0–100 da qualidade estrutural |
| **Gap** | Informação ausente que impede execução confiável |
| **Ambiguity** | Termo com múltiplas interpretações |
| **Assumption** | Premissa não declarada com risco |
| **[A DEFINIR]** | Marcador no after — decisão pendente do autor |

**Licença:** [MIT](LICENSE)
