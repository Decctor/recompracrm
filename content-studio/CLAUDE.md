# content-studio — como produzir um Reel do Caramelo

Esta pasta é um projeto à parte (Remotion + React), fora do app Next.js. Não importa nada do app e
o app não importa nada daqui. Leia o `CONTENT-GUIDE.md` antes de escrever qualquer roteiro.

## Pipeline de um episódio

1. **Pauta.** Escolha um tema que resolva um medo do lojista com uma ação para amanhã. Fontes boas
   de pauta já existem no repositório: `app/_content/blog-posts/posts/` (com fontes citadas),
   `app/_content/glossary.ts`, `app/_content/segment-pages.ts`. Use os números e as fontes desses
   arquivos; não invente estatística.
2. **Roteiro.** Crie `episodes/<NNN-slug>/script.json` seguindo `src/types.ts` (`ScriptSchema`).
   Copie a estrutura de `episodes/001-desconto-vs-cashback/script.json`.
   - `say`: o que o Caramelo fala. Números **por extenso**. A legenda mostra exatamente isto.
   - `label` e cartões: dígitos (`R$ 10`, `10%`).
   - Todo número afirmado leva `source`. Conta própria vale, dizendo a conta.
   - Último passo: `shot: "outro"`. Um passo `shot: "app"` mostra a tela do produto que faz aquilo.
3. **Conferir.** `npm run lint -- <id>`. Corrija todo erro. Aviso de tela não desenhada: desenhe a
   tela em `src/ui/AppScreen.tsx` e inclua em `IMPLEMENTED_SCREENS` (`src/types.ts`), ou troque a tela.
4. **Voz.** `npm run tts-request -- <id>` imprime a chamada. Rode-a com a ferramenta `monid_run`
   do Monid (provider, endpoint, input, tag e maxCost exatamente como impressos) e espere com
   `monid_get_run` até `COMPLETED`. Salve o resultado completo do run num arquivo JSON e rode
   `npm run save-voice -- <id> <arquivo>`: baixa `voice.mp3` e escreve `voice.json` com o tempo de
   cada palavra. O link do áudio expira em ~1 h; se expirar, chame `monid_get_run` de novo.
   Custo: ~US$ 0,015 por 1.000 caracteres (~US$ 0,01 por episódio).
5. **Revisar quadros.** `npm run render -- <id> --stills` gera um quadro por passo e
   `out/<id>/contact-sheet.jpg`. **Abra a contact sheet e olhe**: texto cortado, cartão cobrindo
   rosto, legenda em cima do gesto, número errado. Corrija e repita.
6. **Vídeo.** `npm run render -- <id>` → `out/<id>.mp4` (1080×1920, 30 fps, H.264 + AAC, ~1,5 min
   para 60 s de vídeo).
7. **Legenda do post.** Está em `script.json` → `instagram`. Siga o formato do guia.

Sem rede para o Chrome do Remotion, exporte o navegador da máquina antes do render:
`REMOTION_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`.

## Onde mexer

| Quero… | Arquivo |
|---|---|
| mudar o desenho ou uma expressão do Caramelo | `src/characters/Caramelo.tsx` |
| novo lojista (outro segmento) | `src/characters/<Nome>.tsx` + `owner.look` em `src/types.ts` |
| novo cenário | `src/scene/<Cena>.tsx` + `scene` em `src/types.ts` |
| posição dos personagens e câmera por plano | `SHOTS` em `src/Reel.tsx` |
| legenda, rótulo, contador, cartões, fonte | `src/ui/Overlays.tsx` |
| tela do produto | `src/ui/AppScreen.tsx` |
| tempo das falas e quebra de legenda | `src/timeline.ts` |
| voz e pronúncia ("RecompraCRM" → "Recompra cê érre ême") | `voice.config.json` |

Regras do desenho: personagens e cenários são SVG desenhados em código (nada de imagem gerada por
episódio), com contorno `COLORS.outline`, paleta de `src/theme.ts`, e o cenário sem texto atrás da
zona dos cartões (y 420–950), porque eles passam por cima.

`npm run check` roda o TypeScript desta pasta. `npm run studio` abre o Remotion Studio para mexer
com pré-visualização ao vivo.
