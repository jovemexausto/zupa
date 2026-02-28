# Avaliação do Estado Atual do Codebase e Metas de Produção

Data: 2026-02-26  
Escopo analisado: `packages/zupa` (runtime, kernel phases, ports, integrações, testes) e documentação raiz.

## Resumo Executivo

O codebase está em um bom estágio de **funcionalidade de runtime** (pipeline determinístico, fases separadas, hooks, comandos, tool loop, persistência básica e telemetria por fase).  
Para produção com confiabilidade forte, ainda falta um **plano explícito de robustez operacional**.

Estado atual (macro):
- Forte em: estrutura de pipeline, extensibilidade por portas/adapters, testes de fluxo principal.
- Parcial em: limitação por taxa, fallback de erro em TTS/tool/LLM schema.
- Fraco/ausente em: idempotência ponta a ponta, deduplicação, retries seguros com política unificada, backpressure, timeouts padronizados, replay controlado, trilha de auditoria robusta e intervenção humana operacional.

## Diagnóstico por Objetivo de Produção

| Tema | Estado atual | Meta de produção | Como tratar |
|---|---|---|---|
| Idempotência de mensagens | Ausente no contrato de `InboundMessage` e nas fases (não há `messageId/idempotencyKey`). | Garantir “exactly-once effect” lógico por inbound/outbound crítico. | Introduzir `inbound.id`, `dedupe_key` e `processed_events` no DB; fence por chave + TTL; tornar gravações e side-effects dependentes desse ledger. |
| Deduplicação de eventos | Inbound é processado em callback direto, sem guarda de duplicata. | Aceitar reentrega da plataforma sem duplicar persistência/envio. | Criar fase inicial `event_dedup_gate`; registrar hash/fingerprint de evento e retornar short-circuit quando já processado. |
| Retries seguros | Não há política transversal; falhas sobem/caem por fase, com alguns fallbacks ad hoc. | Retentar somente operações idempotentes com orçamento e jitter. | Definir `RetryPolicy` por porta (LLM/STT/TTS/transport/db), classificação de erro e circuit breaker simples. |
| Backpressure | Processamento inbound sem fila/controlador de concorrência. | Evitar saturação e degradação em pico. | Inserir fila por tenant/usuário com limite de concorrência; resposta de overload (429 equivalente) e métricas de fila. |
| Timeouts de ferramentas | Não há timeout global por tool call/phase. | Nenhuma tool bloquear loop indefinidamente. | `withTimeout` por tool/LLM/STT/TTS e timeout de fase; marcar erro recuperável com razão padronizada. |
| Sessões zumbis | Sessão ativa é reaproveitada sem varredura de expiração automática no runtime. | Encerrar sessões órfãs/inativas de forma previsível. | Job de housekeeping + checagem em `session_attach` para `idle_timeout`; fechamento com resumo e carimbo de motivo. |
| Replays | Sem mecanismo formal de replay operacional. | Reprocessar eventos com segurança e rastreabilidade. | Persistir envelope de execução (input + decisão + outputs) e ferramenta de replay em modo dry-run/commit. |
| Visibilidade | Telemetria por fase existe, mas sem correlação operacional completa. | Observabilidade por request/session/user + SLOs. | Padronizar campos (`requestId`, `sessionId`, `userId`, `eventId`, `dedupeKey`), painéis e alertas (erro, latência, fila). |
| Controle | Poucos controles operacionais (sem kill switch, sem pause por usuário/tenant). | Operação controlável em incidente. | Feature flags operacionais: pause global, blocklist dinâmica, degradação controlada por capability. |
| Auditoria | Persistência de mensagens existe, mas sem trilha de decisão completa. | Trilha auditável de “quem fez o quê e por quê”. | Audit log imutável para comandos/tools/onResponse e intervenções humanas; versionar policy/config aplicada. |
| Intervenção humana | Sem handoff/human-in-the-loop nativo. | Permitir tomada manual em falhas/alto risco. | Estado `needs_human`, fila de revisão, comando de aprovação/reprovação e reentrada no fluxo. |
| Confiança operacional | Base funcional, mas sem runbook/SLO/SLA e sem testes de caos/carga. | Operar com previsibilidade e MTTR baixo. | Definir SLOs, erro budget, testes de carga/chaos, playbooks de incidente e readiness checklist. |

## Evidências Técnicas Principais

- Pipeline determinístico por fases e medição de duração por fase: `core/kernel/runner.ts` e `core/kernel/phases/telemetryEmit.ts`.
- Inbound processado diretamente via `onInbound` sem dedupe/backpressure: `core/runtime/inbound/transportBridge.ts` e `integrations/transport/wwebjs.ts`.
- Rate limit por usuário já existente (parcial para controle): `core/kernel/phases/commandDispatchGate.ts`.
- Persistência atual grava mensagens e contadores, sem ledger de idempotência/replay: `core/kernel/phases/persistenceHooks.ts` e `core/ports/database.ts`.
- Timeouts/retries não padronizados nas portas OpenAI/tools: `integrations/llm/openai.ts`, `integrations/stt/openai.ts`, `integrations/tts/openai.ts`, `capabilities/tools/hooks.ts`.
- Sessão finaliza via comando/hook, sem política automática robusta de expiração operacional: `core/kernel/phases/sessionAttach.ts`, `capabilities/session/sessionLifecycle.ts`.

## Roadmap Recomendado (prioridade)

1. **Confiabilidade de entrada (P0):** idempotência + dedupe + timeout base + fila/concurrency limit.
2. **Confiabilidade de execução (P0):** política de retry segura por porta + error taxonomy + circuit breaker.
3. **Confiabilidade de estado (P1):** sessão expirada/zumbi + housekeeping + replay ledger.
4. **Confiabilidade operacional (P1):** observabilidade padronizada, controles operacionais e auditoria.
5. **Confiabilidade humana (P2):** fluxo de intervenção humana e runbooks.

## Plano de Entrega por Fase

### Fase 1 (1-2 sprints)
- Adicionar `eventId`/`dedupeKey` e tabela de `processed_events`.
- Implementar `event_dedup_gate` no início do kernel.
- Adicionar `withTimeout` para tool/LLM/STT/TTS + configuração central.
- Inserir limite de concorrência inbound e métrica de fila.

### Fase 2 (1 sprint)
- Retry policy unificada com backoff + jitter + classificação de erros.
- Circuit breaker simples para provedores externos.
- Housekeeping de sessões inativas e fechamento seguro.

### Fase 3 (1-2 sprints)
- Audit log imutável de decisões e intervenções.
- Modo replay (dry-run + commit).
- Controles de operação (pause/disable por capability, blocklist dinâmica).

### Fase 4 (contínuo)
- SLOs e alertas; testes de carga/chaos; runbooks e revisão periódica de incidentes.

## Critérios de Pronto para Produção (mínimo)

- Nenhuma mensagem duplicada sob reentrega simulada.
- Nenhuma operação externa sem timeout explícito.
- Retry apenas em operações idempotentes e com limite.
- Filas estáveis sob carga alvo definida.
- Sessões inativas encerradas automaticamente com rastreabilidade.
- Auditoria e telemetria com correlação por request/session/user/event.
- Runbook testado para incidente de dependência externa.
