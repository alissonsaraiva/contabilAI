---
name: feedback_componentizacao
description: Sempre componentizar e escrever código limpo — nunca deixar lógica inline em componentes grandes
type: feedback
---

Sempre desenvolver com componentização e código limpo.

**Why:** O Alisson corrigiu abordagem onde lógica de bulk actions ficou inline no componente pai. Componentes grandes com lógica misturada dificultam manutenção e reuso.

**How to apply:**
- Extrair subcomponentes sempre que uma seção tem estado e lógica própria (ex: barra de ações, modal, row, upload)
- Constantes compartilhadas (labels, colors, options) vão em arquivo central reutilizável, nunca duplicadas
- Cada componente deve ter responsabilidade única e clara
- Props tipadas, callbacks bem definidos — o parent orquestra, o filho encapsula
- Preferir composição (slots, children, render props) a componentes monolíticos
- Código limpo: nomes descritivos, sem lógica inline complexa no JSX, computações em variáveis nomeadas
