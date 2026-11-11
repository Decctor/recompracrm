# content-studio — como produzir um Reel do Caramelo

Esta pasta é um projeto à parte (Remotion + React), fora do app Next.js. Não importa nada do app e
o app não importa nada daqui. Leia o `CONTENT-GUIDE.md` antes de escrever qualquer roteiro.

## Pipeline de um episódio

1. **Pauta.** Escolha um tema que resolva um medo do lojista com uma ação para amanhã. Fontes boas
   de pauta já existem no repositório: `app/_content/blog-posts/posts/` (com fontes citadas),
   `app/_content/glossary.ts`, `app/_content/segment-pages.ts`. Use os números e as fontes desses
   arquivos; não invente estatística.
2. **Roteiro.** Crie `episodes/<NNN-slug>/script.json` seguindo `src/types.ts` (`ScriptSchema`).
   Copie a estrutura de `episodes/001-desconto-vs-cashback/script.json` (formato balcão) ou de
   `episodes/g001-markup/script.json` (formato glossário: `g<NNN>-<slug do verbete>`; regras na
   seção "Formato glossário" do guia).
   - Passo 1 é o gancho: o dono reclamando (`speaker: "owner"`, `tone` irritado), rótulo em forma
     de pergunta para quem assiste. Veja "A forma de um episódio" no guia.
   - `say`: a fala; `speaker`: quem fala (`dog` ou `owner`); `tone`: direção de atuação em inglês.
     Números **por extenso**. A legenda mostra exatamente o `say`.
   - `label` e cartões: dígitos (`R$ 10`, `10%`).
   - Todo número afirmado leva `source`. Conta própria vale, dizendo a conta.
   - Último passo: `shot: "outro"`. Um passo `shot: "app"` mostra a tela do produto que faz aquilo.
3. **Conferir.** `npm run lint -- <id>`. Corrija todo erro. Aviso de tela que ainda não existe: veja
   "Telas do produto" abaixo, ou troque a tela. Cada tela destaca o trecho certo com `cue("palavra")`: escreva a fala do passo com as
   palavras que a tela espera (ex.: "risco", "campanha" na matriz RFM).
4. **Voz.** `npm run tts-request -- <id>` imprime a chamada. Rode-a com a ferramenta `monid_run`
   do Monid (provider, endpoint, input, tag e maxCost exatamente como impressos) e espere com
   `monid_get_run` até `COMPLETED`. Salve o resultado do run num arquivo JSON (se ele vier no
   contexto em vez de num arquivo, basta `output.segments` e `output.audio.download_link`) e rode
   `npm run save-voice -- <id> <arquivo>`: baixa `voice.mp3` e escreve `voice.json` com o tempo de
   cada palavra, já com as pausas longas encurtadas para `maxPauseSeconds`. O link do áudio expira
   em ~1 h; se expirar, chame `monid_get_run` de novo. Modelo `drama-3`, diálogo com duas vozes numa
   chamada só: ~US$ 0,05 por 1.000 caracteres (~US$ 0,07 por episódio). O `s2.1-pro` recusa duas
   vozes na mesma chamada ("Reference audio too long").
5. **Revisar quadros.** `npm run render -- <id> --frames 0` mostra a capa e o gancho (o quadro 0
   precisa ter o dono irritado, o adereço do erro e o rótulo-pergunta). `--stills` gera um quadro por passo e
   `out/<id>/contact-sheet.jpg`. **Abra a contact sheet e olhe**: texto cortado, cartão cobrindo
   rosto, legenda em cima do gesto, número errado. Corrija e repita.
6. **Vídeo.** `npm run render -- <id>` → `out/<id>.mp4` (1080×1920, 30 fps, H.264 + AAC, ~1,5 min
   para 60 s de vídeo).
7. **Legenda do post.** Está em `script.json` → `instagram`. Siga o formato do guia.

Sem rede para o Chrome do Remotion, exporte o navegador da máquina antes do render:
`REMOTION_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`.

## Telas do produto (1:1)

A tela do passo `app` é **o app de verdade**, nunca desenhada: um print da página inteira, na largura
de um celular, dos componentes reais do RecompraCRM com os números do episódio.

- `app/content-studio-screens/` (no app, só em desenvolvimento) monta a página real dentro da moldura
  do dashboard, troca a URL para a rota real (o cabeçalho tira o título dela) e responde cada GET com
  uma fixture tipada pelo tipo de saída da própria rota (`fixtures/`). Pedido sem fixture aparece no
  console como `[content-studio] sem fixture: GET /api/...`.
- `npm run capture-screens [-- <tela>]` sobe o `next dev` sozinho, tira o print
  (`episodes/_screens/<tela>.png`) e guarda onde estão os elementos a destacar
  (`episodes/_screens/manifest.json`; marcas em `CAPTURES`, `tools/capture-screens.ts`).
- `src/ui/screens.tsx` (`SPECS`) diz onde a tela abre e qual palavra da fala rola e acende cada marca.
  Escreva a fala do passo com essas palavras.

Tela nova: registre a página em `app/content-studio-screens/screens.tsx`, escreva as fixtures até o
console parar de reclamar e o typecheck da raiz passar, adicione as marcas em `CAPTURES`, o roteiro
em `SPECS`, o nome em `AppScreenEnum`/`IMPLEMENTED_SCREENS`, e rode `capture-screens`. Mudou a
interface do app? Rode `capture-screens` de novo antes do próximo render.

## Onde mexer

| Quero… | Arquivo |
|---|---|
| mudar o desenho ou uma expressão do Caramelo | `src/characters/Caramelo.tsx` |
| novo lojista (outro segmento) | `src/characters/<Nome>.tsx` + `owner.look` em `src/types.ts` |
| novo cenário | `src/scene/<Cena>.tsx` + `scene` em `src/types.ts` |
| posição dos personagens e câmera por plano | `SHOTS` em `src/Reel.tsx` |
| legenda, rótulo, contador, cartões, fonte | `src/ui/Overlays.tsx` |
| tela do produto (print do app real) | `app/content-studio-screens/` + `tools/capture-screens.ts` + `src/ui/screens.tsx` |
| tempo das falas e quebra de legenda | `src/timeline.ts` |
| vozes, velocidade, pausa máxima e pronúncia ("RecompraCRM" → "RecompraCêÉrreÊme", numa palavra só) | `voice.config.json` |

Regras do desenho: personagens e cenários são SVG desenhados em código (nada de imagem gerada por
episódio), com contorno `COLORS.outline`, paleta de `src/theme.ts`, e o cenário sem texto atrás da
zona dos cartões (y 420–950), porque eles passam por cima.

`npm run check` roda o TypeScript desta pasta. `npm run studio` abre o Remotion Studio para mexer
com pré-visualização ao vivo.
