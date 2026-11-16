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
| 003 Os 20% que pagam as contas | ✓ | — | pronto para voz e render |
| 004 Seu Jorge sumiu | ✓ | — | pronto para voz e render |
| 005 Crédito que vale um ano | ✓ | — | pronto para voz e render |
| g001 Glossário: markup | ✓ | ✓ duas vozes | `npm run render -- g001-markup` |
| g002 Glossário: churn | ✓ | ✓ duas vozes | `npm run render -- g002-churn` |
| g003 Glossário: curva ABC | ✓ | ✓ duas vozes | `npm run render -- g003-curva-abc` |
| g004 Glossário: ticket médio | ✓ | ✓ duas vozes | `npm run render -- g004-ticket-medio` |

## Reproduzir os vídeos

Tudo o que os vídeos usam está no git: roteiros, vozes (`voice.mp3` + `voice.json`), os prints das
telas (`episodes/_screens/`) e o código. Para só renderizar, não precisa de Monid nem do app rodando.

Precisa de Node 22+ e `ffmpeg` no PATH (as revisões `--stills`/`--frames` montam as imagens com ele).

```bash
cd content-studio
npm install
npm run lint                                   # confere os roteiros
npm run render -- g002-churn --stills          # um quadro por passo, para revisar
npm run render -- g002-churn                   # out/g002-churn.mp4
```

O Remotion baixa o próprio Chrome headless no primeiro render. Sem rede para isso, aponte para um
Chrome da máquina com `REMOTION_BROWSER_EXECUTABLE=/caminho/do/chrome-headless-shell`.

### Refazer os prints das telas (só quando a interface do app mudar)

```bash
npm install                                    # na raiz do repositório: o app e o Playwright
npx playwright install chromium                # se o Playwright ainda não tiver navegador
cd content-studio
npm run capture-screens                        # sobe o next dev na porta 3100 e fotografa as 4 telas
```

Não precisa de banco nem de `.env`: a rota `/content-studio-screens` só existe em desenvolvimento e
responde as APIs com as fixtures de `app/content-studio-screens/fixtures/`. Detalhes em `CLAUDE.md`,
seção "Telas do produto".

### Gerar uma voz nova (só ao mudar a fala)

Precisa de uma conta no Monid (Fish Audio `drama-3`, ~US$ 0,07 por episódio). Passo a passo em
`CLAUDE.md`, item "Voz".

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
do app (ver `scripts/vercel-ignore-build.sh`). `out/` e `node_modules/` não vão para o git. A única
parte dentro do app é `app/content-studio-screens/`, que responde 404 fora de `next dev`.
