# Assistente Hamburgueria E2E

## Interactive E2E Script

Run deterministic fake E2E (recommended for CI/local validation):

```bash
pnpm --filter assistente-hamburgueria e2e:fake
```

Run real WhatsApp interactive observation mode:

```bash
pnpm --filter assistente-hamburgueria e2e:real
```

Environment variables:

- `ZUPA_E2E_MODE=fake|real` (default: `fake`)
- `ZUPA_E2E_TIMEOUT_MS=20000` (observation/assertion timeout)

Artifacts are recorded in `examples/assistente-hamburgueria/artifacts/`.

