# content-studio — Reels animados do RecompraCRM (piloto)

Reels de 40–60 s em que o **Caramelo**, o vira-lata da porta da loja, mostra a lojistas uma conta
ou um dado com fonte e termina na tela do RecompraCRM que resolve aquilo. Inspirado no formato que o
@enxovaly.app publica (história curta de personagens + dica com fonte + tela do app), com elenco,
desenho e nicho próprios.

- `CONTENT-GUIDE.md`: o guia editorial (público, elenco, forma do episódio, regras de fonte).
- `CLAUDE.md`: o passo a passo que o Claude Code segue para produzir um episódio.
- `episodes/<id>/script.json`: o roteiro. `voice.mp3` + `voice.json`: a narração e o tempo de cada palavra.

## Estado do piloto

| Episódio | Roteiro | Voz | Vídeo |
|---|---|---|---|
| 001 Desconto de 10% × cashback de 5% | ✓ (diálogo) | ✓ duas vozes | `npm run render -- 001-desconto-vs-cashback` |
| 002 Promoção pra base toda no WhatsApp | ✓ | — | falta a tela `campaign-whatsapp` |
| 003 Os 20% que pagam as contas | ✓ | — | falta a tela `rfm-segments` |
| 004 Seu Jorge sumiu | ✓ | — | falta a tela `rfm-segments` |
| 005 Crédito que vale um ano | ✓ | — | pronto para voz e render |

## Rodar

```bash
cd content-studio
npm install
npm run lint                                  # confere os roteiros
npm run render -- 001-desconto-vs-cashback --stills   # um quadro por passo, para revisar
npm run render -- 001-desconto-vs-cashback            # out/001-desconto-vs-cashback.mp4
```

## Custos e licenças

- **Voz:** Fish Audio `drama-3` via Monid, duas vozes (Caramelo e o dono) numa chamada, com direção
  de atuação por fala e o tempo de cada palavra: ~US$ 0,07 por episódio. As vozes atuais
  (`voice.config.json`) são da biblioteca licenciada, **só para o piloto**: antes de publicar, use
  vozes que a marca controle (clone autorizado de alguém da equipe ou locutor contratado). As vozes
  "animadas" mais usadas da biblioteca pública são clones de pessoas reais (narradores, políticos,
  dubladores) e ficam de fora.
- **Remotion:** gratuito para pessoa física, empresas de até 3 funcionários e avaliação. Acima
  disso, a Syncroniza precisa da Company License antes de publicar em produção
  (https://www.remotion.dev/license).
- **Render:** local, ~1,5 min por vídeo de 60 s. Sem custo de nuvem.
- **Fontes:** Baloo 2 e Inter (SIL OFL) via `@fontsource`.

## Fora do app

Esta pasta tem `package.json` próprio e fica fora do `tsconfig`, do `oxlint` e do build da Vercel
do app (ver `scripts/vercel-ignore-build.sh`). `out/` e `node_modules/` não vão para o git.
