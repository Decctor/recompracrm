# Guia do canal — Reels do Caramelo

Este é o guia editorial dos Reels animados do RecompraCRM. Tudo que um roteiro precisa respeitar está
aqui; o `CLAUDE.md` desta pasta diz como transformar um roteiro em vídeo.

## Para quem falamos

Donos e gerentes de loja física no Brasil: sorveteria, padaria, pet shop, farmácia, loja de roupa,
ferragem, mercado. Gente que atende no balcão, responde WhatsApp à noite e decide sozinha. O medo
dessa pessoa não é "baixa retenção": é **o dia fraco**, **o cliente que sumiu**, **a promoção que
encheu a loja e esvaziou o caixa**, **o número do WhatsApp bloqueado**.

Cada vídeo resolve **um** desses medos com **uma** coisa que o lojista pode fazer amanhã, mesmo sem
o RecompraCRM. O produto entra no final, como o jeito mais fácil de fazer aquilo, nunca como o assunto.

## O elenco

**Caramelo** — o narrador. Vira-lata caramelo, cachorro da loja, deitado na porta. Vê todo cliente
entrar e sair, lembra de quem não aparece há tempo, e por isso entende de recompra melhor que
qualquer consultor. Coleira azul da marca com a plaquinha que é o ícone do RecompraCRM (o círculo azul com as
cinco barras), igual ao `icon-badge`.

- Fala em primeira pessoa, frases curtas, português do balcão ("pra", "tá", "a gente"), com energia:
  exclamação, "Olha só!", "Calma, Márcia!". A voz é animada e rápida (ver `voice.config.json`).
- É quem explica o jeito certo. Nunca zomba do lojista: o erro é comum, não burro.
- Bordão: "Eu vi tudo daqui da porta." Ele entra respondendo ao dono, nunca se apresentando.
- Bordão de saída: "Segue aí!" (curto, no imperativo, falando com quem assiste; nunca "Segue o Caramelo")
- Por que um cachorro: cachorro é **fiel** e **sempre volta**. É o cliente que todo lojista quer.

**Os lojistas** — um por segmento, sempre com nome e uma loja concreta. Cometem o erro do episódio
com boa intenção **e falam com a própria voz**: abrem o episódio reclamando e reagem no meio
("Pera… um terço do meu lucro?!"). O diálogo é o que segura quem assiste; um monólogo do Caramelo
vira aula.

| Nome | Loja | Segmento (`app/_content/segment-pages.ts`) |
|---|---|---|
| Márcia | sorveteria | `sorveteria` |
| Seu Antônio | ferragem | `materiais-de-construcao` |
| Paula | pet shop | `pet-shop` |
| Dr. Renato | farmácia | `farmacia-e-drogaria` |
| Bia | loja de roupas | `loja-de-roupas` |
| Dona Lurdes | padaria | `padaria-e-confeitaria` |

Personagens novos só entram no elenco depois de desenhados em `src/characters/`.

## A forma de um episódio (formato "balcão", 30–50 s)

1. **Gancho (até 3,5 s): o dono reclama do problema, na voz dele.** Uma frase que o lojista que
   assiste já disse em voz alta: "Dei dez por cento de desconto em tudo, a loja lotou… e o lucro
   sumiu!". O rótulo do topo devolve a reclamação como **pergunta a quem assiste**: "DEU DESCONTO E
   O LUCRO SUMIU?". No quadro 0 já estão o dono irritado, o rótulo e o adereço do erro (a placa de
   10%); sem contador nem cartão. Nada de apresentar personagem, nada de contexto antes do problema.
   O que não funciona como gancho: cenário ("Julho, sorveteria vazia…"), apresentação ("Eu sou o
   Caramelo…"), dado solto ("88% dos brasileiros…").
2. **O Caramelo responde** ("Calma, Márcia! Eu vi tudo daqui da porta.") e mostra a conta, o dado
   ou o jeito certo, em 3 a 6 passos curtos. **O dono reage pelo menos uma vez** no meio, com a
   surpresa ou a dúvida que quem assiste teria ("E quando esse crédito me custa?").
3. **Um contador** acompanha a tensão do episódio (`LUCRO POR PICOLÉ R$ 3,00 → R$ 2,00`,
   `CLIENTES QUE VOLTARAM 0/3`, `DIAS SEM COMPRAR 47`).
4. **Toda afirmação com número leva `source`.** Sem fonte, a frase não entra.
5. **A tela do produto** que faz exatamente aquilo (nunca o painel genérico): a tela real do app,
   com os números do episódio, nunca uma imitação desenhada.
6. **CTA** para uma ferramenta grátis (`/tools/cashback-calculator`, `/tools/whatsapp-cost`) ou
   para o teste de 15 dias, e "Segue aí!".

## Formato "glossário" (`format: "glossario"`, 35–45 s)

Um termo de `app/_content/glossary.ts` por episódio, com o mesmo elenco. A série tem selo próprio
(📖 GLOSSÁRIO DO CARAMELO + o termo, no lugar do contador) e termina numa **cola para salvar**:
salvamento é o sinal que esse tipo de conteúdo ganha, e a cola é o motivo para salvar.

1. **Gancho: o dono diz o equívoco comum com convicção**, em até 3,5 s ("Cem por cento em cima do
   custo: lucro de cem por cento, né?"). O rótulo devolve como pergunta: "MARKUP DE 100% = LUCRO
   DE 100%?". Quem assiste também acha isso, e quer saber se está errado.
2. **O Caramelo corrige** e mostra o verbete (`card.kind: "term"`, a definição curta do glossário).
3. **A fórmula** (`kind: "formula"`) com um exemplo de loja, sempre hipotético, com números
   redondos.
4. **Onde o equívoco dói**: a conta que mostra o prejuízo (desconto, margem, cliente perdido). O dono
   reage.
5. **A cola** (`kind: "recap"`): de 2 a 4 linhas "TERMO → o que lembrar".
6. **CTA**: "Salva o vídeo e confere o glossário completo no link da bio. Segue aí!".

Regras próprias:

- `glossary.slug` precisa existir em `app/_content/glossary.ts`, e o vídeo não pode contradizer o
  verbete (definição, fórmula, exemplo). O verbete é a fonte; o vídeo é o resumo.
- **Tela do produto só se o verbete tiver `inRecompra`.** Markup e CAC não são calculados pelo
  produto: esses episódios não mostram o RecompraCRM. O lint recusa.
- A marca se fala numa palavra só: "RecompraCRM" vai para a voz como "RecompraCêÉrreÊme". Separar
  as letras ("Recompra cê érre ême") faz a voz soletrar com pausa entre elas.
- Termo em inglês ou sigla ganha pronúncia em `voice.config.json` → `spoken` ("markup" → "márcap",
  "churn" → "tchurn", "ABC" → "á bê cê", "ticket" → "tíquete"); a legenda continua com a grafia certa.
- Os números do exemplo são os do verbete (loja hipotética), e a fonte diz isso: "Exemplo hipotético
  do glossário: …". Uma conta derivada do exemplo leva "Conta com …".

Outros formatos (ainda sem template de vídeo):

- **Confissão** (20–30 s, sem hashtag): o lojista fala de um hábito que todo mundo tem. "Também tem
  cliente que só aparece quando tem promoção? Conta aqui."
- **Carrossel "vale a pena?"**: comparações de ferramenta ou prática, nunca de concorrente nomeado.

## Regras de conteúdo

- **Fontes aceitas**: IBGE, Sebrae, ABEMF, CNDL/SPC Brasil, ABRAS, Meta (preços do WhatsApp),
  Receita/SEFAZ (fiscal), estudos com autor e ano. Conta aritmética própria vale, desde que a fonte
  diga a conta ("Conta com custo de R$ 7 e preço de R$ 10").
- **Dados da base do RecompraCRM** só agregados, anonimizados, de pelo menos 30 lojas, e com a
  aprovação de quem responde pelos contratos. Nunca nome, cidade ou número que identifique um cliente.
- **Proibido**: promessa de faturamento ("dobre suas vendas"), orientação fiscal ou jurídica que não
  venha de fonte oficial, citar concorrente pelo nome, piada com o cliente final.
- **Cada passo diz quem fala** (`speaker`: `dog` ou `owner`) e pode trazer `tone`, a direção de
  atuação em inglês curto ("annoyed, complaining fast", "shocked, disbelief"). Sem `tone`, vale o da
  voz em `voice.config.json`. O dono só fala quando está em cena.
- **Frases de até ~12 palavras.** Fala longa vira legenda longa e a voz perde o ritmo.
- **Números falados por extenso** no `say` ("dez por cento"), com dígitos no `label` e nos cards
  ("10%"). A legenda mostra exatamente o que é dito.
- **Uma ideia por vídeo.** Se o roteiro precisa de "e também", vira dois episódios.

## Legenda do post

```
<gancho do vídeo, uma linha, um emoji no máximo>
<a dica em 2–3 frases, com a fonte por extenso>
<uma pergunta que o lojista responde em uma palavra>
<CTA do link na bio>

#varejo #fidelizacao + 3 do segmento
```

## Ritmo de publicação (piloto)

1 Reel por dia útil às 11h30 e 2 carrosséis por semana. Medir alcance de não seguidores, visitas
ao perfil e cliques no link (UTM `utm_source=instagram&utm_campaign=caramelo-<id>`), não curtidas.
