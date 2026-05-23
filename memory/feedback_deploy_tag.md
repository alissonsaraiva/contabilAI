---
name: Deploy requer tag semântica
description: O workflow de deploy SÓ dispara com push de tag v* — nunca com push para main
type: feedback
---

Push para `main` NÃO faz deploy. O GitHub Actions só dispara com tag `v*`.

**Sequência obrigatória para deploy:**
```bash
git describe --tags --abbrev=0   # ver a última tag
git tag vX.Y.Z                   # incrementar na sequência exata
git push origin vX.Y.Z
```

**Regra de incremento — SEMPRE verificar a última tag antes de criar:**
- Bug fix / ajuste pequeno → incrementa patch: `v2.1.0` → `v2.1.1`
- Nova feature → incrementa minor: `v2.1.0` → `v2.2.0`
- NUNCA pular versões nem criar major sem solicitação explícita do usuário

**Why:** Tags fora de sequência (ex: v1.9.14 → v2.0.0 → v2.1.0) quebram a ordem visual no GitHub e dificultam rastrear o histórico. O usuário quer sequência contínua e previsível.

**How to apply:** Sempre rodar `git describe --tags --abbrev=0` antes de criar nova tag para garantir o incremento correto.
