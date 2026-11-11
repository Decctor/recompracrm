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
qualquer consultor. Lenço azul RecompraCRM com uma plaquinha dourada em forma de moeda.

- Fala em primeira pessoa, frases curtas, português do balcão ("pra", "tá", "a gente").
- É quem explica o jeito certo. Nunca zomba do lojista: o erro é comum, não burro.
- Bordão de apresentação (usar nos primeiros episódios): "Eu sou o Caramelo, e daqui da porta eu vejo tudo."
- Bordão de saída: "Segue o Caramelo pra ver a próxima!"
- Por que um cachorro: cachorro é **fiel** e **sempre volta**. É o cliente que todo lojista quer.

**Os lojistas** — um por segmento, sempre com nome e uma loja concreta. Cometem o erro do episódio
com boa intenção.

| Nome | Loja | Segmento (`app/_content/segment-pages.ts`) |
|---|---|---|
| Márcia | sorveteria | `sorveteria` |
| Seu Antônio | ferragem | `materiais-de-construcao` |
| Paula | pet shop | `pet-shop` |
| Dr. Renato | farmácia | `farmacia-e-drogaria` |
| Bia | loja de roupas | `loja-de-roupas` |
| Dona Lurdes | padaria | `padaria-e-confeitaria` |

Personagens novos só entram no elenco depois de desenhados em `src/characters/`.

## A forma de um episódio (formato "balcão", 40–60 s)

1. **Gancho (até 4 s)**: segmento + mês/momento + o erro em andamento. "Julho, sorveteria vazia, e a
   Márcia pendurou a placa: dez por cento de desconto em tudo."
2. **O Caramelo entra** e mostra a conta, o dado ou o jeito certo, em 3 a 6 passos.
3. **Um contador** acompanha a tensão do episódio (`LUCRO POR PICOLÉ R$ 3,00 → R$ 2,00`,
   `CLIENTES QUE VOLTARAM 0/3`, `DIAS SEM COMPRAR 47`).
4. **Toda afirmação com número leva `source`.** Sem fonte, a frase não entra.
5. **A tela do produto** que faz exatamente aquilo (nunca o painel genérico).
6. **CTA** para uma ferramenta grátis (`/tools/cashback-calculator`, `/tools/whatsapp-cost`) ou
   para o teste de 15 dias, e "Segue o Caramelo pra ver a próxima!".

Outros formatos (ainda sem template de vídeo):

- **Confissão** (20–30 s, sem hashtag): o lojista fala de um hábito que todo mundo tem. "Também tem
  cliente que só aparece quando tem promoção? Conta aqui."
- **Glossário em 45 s**: um termo de `app/_content/glossary.ts` com a fórmula e um exemplo de loja.
- **Carrossel "vale a pena?"**: comparações de ferramenta ou prática, nunca de concorrente nomeado.

## Regras de conteúdo

- **Fontes aceitas**: IBGE, Sebrae, ABEMF, CNDL/SPC Brasil, ABRAS, Meta (preços do WhatsApp),
  Receita/SEFAZ (fiscal), estudos com autor e ano. Conta aritmética própria vale, desde que a fonte
  diga a conta ("Conta com custo de R$ 7 e preço de R$ 10").
- **Dados da base do RecompraCRM** só agregados, anonimizados, de pelo menos 30 lojas, e com a
  aprovação de quem responde pelos contratos. Nunca nome, cidade ou número que identifique um cliente.
- **Proibido**: promessa de faturamento ("dobre suas vendas"), orientação fiscal ou jurídica que não
  venha de fonte oficial, citar concorrente pelo nome, piada com o cliente final.
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
