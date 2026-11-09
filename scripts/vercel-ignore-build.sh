#!/bin/sh
# Vercel "Ignored Build Step" (vercel.json → ignoreCommand).
# exit 0 = pula o build; qualquer outro código = builda.
#
# Na dúvida, sempre builda: sem deploy anterior conhecido, sem o commit-base no clone raso ou com
# qualquer falha do git, o script sai com 1. Pular um build necessário deixa produção desatualizada;
# um build a mais só custa minutos.

# Branches de agentes nunca geram preview.
case "$VERCEL_GIT_COMMIT_REF" in
	ccr-*|claude/*|cursor/*|codex/*|copilot/*|devin/*|agent/*|ai/*)
		echo "Branch de agente ($VERCEL_GIT_COMMIT_REF): build ignorado."
		exit 0
		;;
esac

# Compara com o último deploy bem-sucedido da branch, não com HEAD^: um push com vários commits
# só builda o último, e um commit de documentação no topo esconderia o código que veio antes dele.
BASE="$VERCEL_GIT_PREVIOUS_SHA"
HEAD_SHA="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [ -z "$BASE" ]; then
	echo "Sem deploy anterior registrado: buildando."
	exit 1
fi

# O clone da Vercel é raso; o commit-base pode não estar nele.
if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
	git fetch --quiet --depth=1 origin "$BASE" 2>/dev/null || {
		echo "Commit-base $BASE indisponível no clone: buildando."
		exit 1
	}
fi

CHANGED=$(git diff --name-only "$BASE" "$HEAD_SHA") || {
	echo "Falha ao comparar $BASE..$HEAD_SHA: buildando."
	exit 1
}

if [ -z "$CHANGED" ]; then
	echo "Nenhum arquivo mudou desde $BASE (redeploy): buildando."
	exit 1
fi

# Só documentação e configuração de agentes: Markdown fora de public/ e as pastas de agentes e docs.
# public/*.md é servido pelo site (ex.: public/pricing.md), então conta como mudança do app.
RELEVANT=$(printf '%s\n' "$CHANGED" | grep -Ev '^(docs|\.claude|\.agents|\.cursor)/' | grep -Ev '\.md$')
PUBLIC_MARKDOWN=$(printf '%s\n' "$CHANGED" | grep -E '^public/.*\.md$')

if [ -z "$RELEVANT" ] && [ -z "$PUBLIC_MARKDOWN" ]; then
	echo "Só documentação mudou desde $BASE: build ignorado."
	printf '%s\n' "$CHANGED" | sed 's/^/  - /'
	exit 0
fi

echo "Arquivos do app mudaram desde $BASE: buildando."
exit 1
