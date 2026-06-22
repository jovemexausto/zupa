![Zupa](./banner.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Zupa é um framework open source para construir agentes conversacionais multimodais com foco real em runtime, transporte, memória e operação.

Em vez de acoplar o agente ao canal, ao provider ou a uma stack de infra específica, Zupa separa as camadas críticas da conversa para que o comportamento do agente sobreviva a trocas de canal, falhas de processo e evolução de produto.

## Tese

Hoje existe muita infra para gerar texto e pouca infra para sustentar conversas de verdade.

O problema difícil não é mais chamar modelo.

O problema difícil é orquestrar identidade, sessão, memória, ferramentas, áudio, retries, checkpoints e transporte sem transformar o produto em um emaranhado de callbacks, webhooks e estados inconsistentes.

Zupa existe para resolver essa camada.

## Primitivas de produção

- runtime transport-agnostic, com WhatsApp como caso de uso de primeira classe
- multimodalidade nativa: texto, STT, TTS e mirroring de voz
- router handshake para desacoplar identidade física de thread conversacional
- dual-write entre working memory e ledger de auditoria
- executor BSP/Pregel com checkpoint e retomada resiliente
- timeouts, retries, deduplicação e controle de sessão no runtime
- ports and adapters para trocar provider sem apodrecer o domínio
- streaming e UI reativa quando o canal permitir

## O que isso permite

- trocar de canal sem reescrever o agente
- evoluir de WhatsApp bootstrap para API oficial sem refazer o núcleo
- manter memória curta para inferência e histórico longo para produto e auditoria
- operar a conversa como sistema, não como script

## Quick Start

```bash
npm install zupa zod
```

Defina `OPENAI_API_KEY` e suba um agente com transporte WhatsApp:

```ts
import { z } from "zod";
import {
  createAgent,
  defineTool,
  withReply,
  WWebJSMessagingTransport,
} from "zupa";

const PlanejarAula = defineTool({
  name: "planejar_aula",
  description: "Gera um esboço curto de plano de aula",
  parameters: z.object({
    tema: z.string(),
    ano: z.string(),
  }),
  handler: async ({ tema, ano }) => {
    return [
      `Tema: ${tema}`,
      `Ano: ${ano}`,
      "Objetivo: ativar repertório e praticar o conceito em sala.",
      "Estrutura: abertura, atividade guiada e fechamento.",
    ].join("\n");
  },
});

const Resposta = withReply({
  proximoPasso: z.string().nullable(),
});

const agent = createAgent({
  language: "pt",
  modality: "auto",
  prompt: `
    Você é uma assistente pedagógica objetiva e calorosa.
    Fale com clareza, em tom de WhatsApp, e use ferramentas quando isso
    produzir uma resposta melhor do que improvisar.
  `,
  outputSchema: Resposta,
  tools: [PlanejarAula],
  context: async (ctx) => ({
    nome: ctx.user.displayName,
  }),
  onResponse: async (response, ctx) => {
    if (response.proximoPasso) {
      await ctx.resources.transport.sendMessage({
        to: ctx.replyTarget,
        type: "text",
        body: `Próximo passo sugerido: ${response.proximoPasso}`,
      });
    }
  },
  providers: {
    transport: new WWebJSMessagingTransport(),
  },
});

agent.on("auth:request", ({ qrString }) => {
  console.log("Escaneie o QR:", qrString);
});

agent.on("auth:ready", () => {
  console.log("Agente online.");
});

await agent.start();
```

## Como pensar a arquitetura

- `@zupa/core`: contratos, entidades e ports
- `@zupa/engine`: executor BSP/Pregel e modelo de checkpoint
- `@zupa/runtime`: runtime conversacional, roteamento e ciclo de vida
- `@zupa/adapters`: integrações concretas, como OpenAI e `whatsapp-web.js`
- `zupa`: API pública para criar e subir agentes

## Modelo operacional

Zupa roda como um processo Node.js autocontido.

Sem serviço gerenciado obrigatório.

Sem lock-in de fila, cloud ou workflow engine externo.

O mesmo agente pode rodar localmente, em container, VPS ou plataforma cloud, preservando a mesma estrutura de runtime.

## Status

A fundação principal já está estabelecida: engine, runtime, multimodalidade, tool calling, sessão e transporte desacoplado.

Os próximos ciclos estão concentrados em distribuição, observabilidade, HITL e operação multi-instância.

## Roadmap

- persistência distribuída
- outbox durável
- observabilidade e auditoria mais fortes
- adapters de transporte adicionais
- handoff humano nativo

Veja `ROADMAP.md`.

## Contribuir

Se você quer ajudar a construir agentes realmente prontos para o mundo real, leia `CONTRIBUTING.md`.

PRs são bem-vindos.

## Aviso

Zupa é um projeto open source independente.

Não é afiliado ao WhatsApp, Meta ou Turn.io.
