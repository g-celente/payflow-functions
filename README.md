# payflow-functions

**Componente serverless do PayFlow**: uma Function App do **Azure Functions** com
duas funções, uma com **HTTP Trigger** e outra com **Message Trigger** (Service Bus).

Parte da plataforma PayFlow (arc42 completo no repositório de documentação
[`PayFlow`](https://github.com/CaioSeniuk/PayFlow)). Alunos: **Caio Henrique,
Gabriel Moribe, Guilherme Celente e Leonardo Berlanda** — PUCPR, Arquitetura de
Soluções com Cloud, 2026.

## O que é este repositório

| Função | Gatilho | O que faz |
|---|---|---|
| `calculate-fees` | **HTTP Trigger** (`POST /api/fees`) | **Cálculo/enriquecimento**: recebe totais por meio de pagamento e devolve taxa (MDR), valor líquido e data prevista de liquidação. É chamada pelo BFF em `/aggregated-data`. |
| `deliver-webhook` | **Service Bus Trigger** (fila `payment-events`) | **Consumidor da EDA**: para cada evento de pagamento, busca a configuração de webhook do lojista e envia o webhook assinado (HMAC-SHA256). Se falhar, a mensagem volta à fila; após 5 entregas, vai para a DLQ. |

Requisito da atividade atendido: _"Azure Function — HTTP Trigger / Message
Trigger, pode simular cálculo ou enriquecimento de dados, exposta via endpoint
HTTP"_. Esta Function App também substitui o antigo notification-service da
arquitetura aprovada.

## Relação com os outros repositórios

```mermaid
flowchart LR
    bff["payflow-bff"] -- "POST /api/fees<br/>(x-functions-key)" --> fees["<b>calculate-fees</b>"]
    ps["payflow-payment-service"] -- "outbox → CloudEvents" --> sb[["Service Bus<br/>payment-events"]]
    sb -- trigger --> wh["<b>deliver-webhook</b>"]
    wh -- "GET /v1/merchants/{id}/webhook" --> ms["payflow-merchant-service"]
    wh -- "POST (HMAC)" --> loja["Loja do lojista"]
```

| Repositório | Relação |
|---|---|
| `payflow-bff` | Chama `calculate-fees` para compor `/aggregated-data`. |
| `payflow-payment-service` | Produz os eventos consumidos por `deliver-webhook`; o contrato está no `docs/asyncapi.yaml` dele. |
| `payflow-merchant-service` | Fornece URL, segredo e eventos do webhook do lojista. |

## Tecnologias

| Item | Escolha |
|---|---|
| Plataforma | Azure Functions v4, modelo de programação Node.js v4 |
| Runtime / linguagem | Node.js 20, TypeScript |
| Mensageria | Binding Service Bus (`app.serviceBusQueue`) |
| Assinatura | `node:crypto` HMAC-SHA256 |
| Testes | Vitest (unitários), dependency-cruiser (arquitetura) |
| Ferramentas locais | Azure Functions Core Tools v4, Azurite |
| Execução na nuvem | Function App `func-payflow` (Flex Consumption ou Consumption, Linux) |
| Observabilidade | Application Insights |

## Arquitetura interna (Clean Architecture + Vertical Slice)

| Camada | Pasta | Conteúdo |
|---|---|---|
| Domain | `src/domain/` | `calculateFees()` (regras de taxa puras), `signWebhook()`, tipos `PaymentEvent` |
| Application | `src/features/<fatia>/handler.ts`, `ports.ts` | Caso de uso e portas (`WebhookConfigProvider`, `WebhookSender`) |
| API | `src/features/<fatia>/function.ts` | Registro do gatilho (HTTP ou Service Bus) e tradução de entrada/saída |
| Infrastructure | `src/infrastructure/` | `HttpMerchantClient`, `FetchWebhookSender`, config |

```text
src/
├── domain/
│   ├── fees.ts
│   └── webhook-signature.ts
├── features/
│   ├── calculate-fees/      function.ts · handler.ts
│   └── deliver-webhook/     function.ts · handler.ts · ports.ts
└── infrastructure/
host.json
local.settings.example.json
```

## Contratos

**`POST /api/fees`** (`authLevel: function`)

```json
// requisição
{ "byMethod": { "CARD": 90000, "PIX": 35000 }, "currency": "BRL" }
// resposta
{
  "totalFees": 3488,
  "netAmount": 121512,
  "byMethod": [
    { "method": "CARD", "gross": 90000, "rate": 0.0349, "fee": 3141, "settlement": "D+30" },
    { "method": "PIX",  "gross": 35000, "rate": 0.0099, "fee": 347,  "settlement": "D+0" }
  ]
}
```

Valores em centavos. As taxas são fictícias e ficam em `src/domain/fees.ts`.

**`deliver-webhook`**: recebe um CloudEvent (`payment.*`) e envia `POST <url do lojista>`
com o corpo do evento e os cabeçalhos:

| Cabeçalho | Valor |
|---|---|
| `X-PayFlow-Event-Id` | `id` do evento (para idempotência na loja) |
| `X-PayFlow-Event-Type` | `type` do evento |
| `X-PayFlow-Signature` | `t=<unix>,v1=<hex HMAC-SHA256(segredo, "<t>.<corpo>")>` |

Resposta 2xx encerra a mensagem; outra resposta ou timeout (10 s) lança erro e o
Service Bus reentrega. Eventos que o lojista não assinou são descartados.

## Estado atual

Repositório novo; nada implementado.

- [ ] Projeto Functions v4 TypeScript (`func init --worker-runtime node --language typescript --model V4`)
- [ ] `calculate-fees` + testes unitários do domínio
- [ ] `deliver-webhook` + testes unitários com portas simuladas
- [ ] Regras dependency-cruiser no `npm test`
- [ ] Function App na Azure, App Settings e Application Insights
- [ ] Testar entrega com https://webhook.site e a DLQ com URL inválida
- [ ] GitHub Actions (build, testes e deploy)

## Como rodar localmente (previsto)

```bash
cp local.settings.example.json local.settings.json
npm install
npm test
npm start            # func start → http://localhost:7071/api/fees
```

### App Settings

| Variável | Descrição |
|---|---|
| `ServiceBusConnection` | Connection string com permissão `Listen` (segredo) |
| `SERVICEBUS_QUEUE` | `payment-events` |
| `MERCHANT_SERVICE_URL` | URL base do merchant-service |
| `INTERNAL_KEY` | `X-Internal-Key` do merchant-service (segredo) |
| `WEBHOOK_TIMEOUT_MS` | Padrão `10000` |

## Publicação

```bash
npm run build
func azure functionapp publish func-payflow
```

A function key de `calculate-fees` (portal → Function → *Function Keys*) é
configurada no BFF como `FEES_FUNCTION_KEY`.

## Links

| Item | URL |
|---|---|
| `calculate-fees` | _a publicar_ |
| Documentação de arquitetura | https://github.com/CaioSeniuk/PayFlow |
