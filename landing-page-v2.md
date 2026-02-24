# Landing Page Structure: RecompraCRM

## Design System Notes (Light Mode Focus)
* **Vibe:** Clean, stable, professional, and trustworthy (traditional enterprise feel, but modern).
* **Backgrounds:** Primary background pure white (`#FFFFFF`). Section variants in subtle off-white (`#F8FAFC` or `slate-50`) to create depth.
* **Shadows:** Soft, diffused drop-shadows (`shadow-lg` with low opacity) to make the UI miniatures tactile and "clickable".
* **Accents:** Use RecompraCRM's brand yellow and deep blue for primary CTAs, active UI states, and key icons.

---

## Section 1: Hero (Above the Fold)
**Goal:** Immediate value proposition and high-fidelity visual proof of the software in action.

* **Headline:** Transforme compradores casuais em clientes leais no piloto automático.
* **Sub-headline:** O CRM de varejo focado em retenção. Aumente seu LTV com um programa de cashback de balcão e campanhas automatizadas de WhatsApp que vendem por você.
* **Primary CTA:** [ Agendar Demonstração ]
* **Secondary CTA:** [ Ver Planos ] (Optional)
* **Visual Interaction (Miniature UI):** A staggered, floating composition of three elements:
    1. Base layer: A minimized, light-mode version of the **Dashboard "Gráfico de Vendas"** (the blue wave graph).
    2. Overlapping layer: An animated miniature of the **"Ponto de Interação"** tablet screen (the yellow "Resgate seu Cashback" UI).
    3. Floating accent: A WhatsApp chat bubble popping up saying: *"Olá João! Você tem R$ 15,00 de cashback expirando..."*

---

## Section 2: Social Proof & Integrations
**Goal:** Establish local authority and friction-free adoption.

* **Layout:** A subtle, horizontal scrolling banner or centered grid.
* **Copy:** Integrado nativamente com as ferramentas que o seu varejo já usa.
* **Visuals:** Grayscale logos of Online Software, Cardápio Web, Meta/WhatsApp Cloud API, and generic ERP integration icons.

---

## Section 3: The "Bento Box" Feature Grid
**Goal:** Showcase core modules using high-fidelity, interactive UI components in a CSS grid layout.

### Box 1 (Large Focus): Matriz RFM Dinâmica
* **Copy:** Entenda quem compra de você. Nossa IA segmenta seus clientes do "Campeão" ao "Perdido".
* **Visual:** A simplified, animated version of the colorful RFM Matrix. When hovered, specific blocks (like "Em Risco") pulse or highlight.

### Box 2 (Medium Focus): Automação de WhatsApp
* **Copy:** Gatilhos inteligentes. Envie a mensagem certa na hora certa, sem depender de intervenção humana.
* **Visual:** The "Tipo de Gatilho" dropdown animating automatically between `PRIMEIRA COMPRA` -> `CASHBACK EXPIRANDO`, followed by a tiny progress bar simulating a message dispatch.

### Box 3 (Medium Focus): Operação à Prova de Falhas
* **Copy:** Feito para a correria do balcão. Sem filas, sem senhas esquecidas.
* **Visual:** A looping CSS animation of the 4-step POS flow navigating smoothly through: `Telefone` -> `Valor` -> `Resgate` -> `Senha` (inspired in app\_components\CashbackSection.tsx).

### Box 4 (Wide/Horizontal): Metas & Comissionamento
* **Copy:** Alinhe sua equipe com metas transparentes e rankings em tempo real.
* **Visual:** The "Ranking de Vendedores" component with crown icons, animating to show positions and revenue numbers updating dynamically.

---

## Section 4: Deep Dive - O Motor de Retenção (POS)
**Goal:** Emphasize the physical storefront experience and ease of use.

* **Layout:** Two columns. Copy on the left, interactive UI on the right.
* **Headline:** Uma experiência premium no seu caixa.
* **Copy:** Não exija downloads de aplicativos ou preenchimento de formulários longos. Seu cliente só precisa informar o WhatsApp para pontuar, resgatar descontos ou trocar por prêmios físicos.
* **Visual Interaction:** An interactive mockup of a tablet running the "Ponto de Interação" UI. Visitors can click a "Simular Resgate" button that automatically clicks through the high-fidelity miniature of the `NOVA VENDA` screens (inspired in app\_components\CashbackSection.tsx).

---

## Section 5: Deep Dive - Marketing de Precisão (Campaigns)
**Goal:** Highlight digital revenue generation and automated marketing ROI.

* **Layout:** Two columns or alternating zig-zag layout.
* **Headline:** Recuperação de vendas sem esforço manual.
* **Copy:** Crie réguas de relacionamento completas em minutos. Ofereça um "giftback" automático de 25% com validade curta para quem acabou de fazer a primeira compra e garanta o retorno imediato do cliente.
* **Visual Interaction:** Side-by-side comparison UI. 
    * *Left:* The Campaign Builder showing variables and delays being set. 
    * *Right:* The visual Conversion Funnel (Enviados -> Entregues -> Lidos -> Convertidos) filling up (inspired in components\Campaigns\CampaignsFunnel.tsx).

---

## Section 6: Footer & Final Push
**Goal:** Capture the lead.

* **Headline:** Pronto para modernizar o seu varejo?
* **Copy:** Junte-se às lojas que estão escalando o faturamento, retendo clientes e aumentando a recompra sem aumentar o custo de aquisição.
* **Primary CTA:** [ Falar com um Especialista ]
* **Links:** Contato, Termos de Uso, Política de Privacidade, Login da Organização.