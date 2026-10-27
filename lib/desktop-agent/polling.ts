// Cadência sugerida ao agent desktop. Sem canal de push, o polling É a latência entre a criação de
// um job e o claim. O agent alterna entre duas cadências: `ativoMs` enquanto houve impressão
// recente (a loja está em atendimento) e `ociosoMs` depois de uma janela quieta de 10 minutos —
// assim a latência fica baixa quando importa e a carga no banco cai fora do expediente. O claim é
// barato (mediana ~0 ms, ~10 ms de CPU) numa instância já quente.
//
// Servida em dois lugares: no bootstrap (`/configuration`) e em todo claim. O claim existe porque o
// agent só lia a configuração ao iniciar — se o PC ligou antes da rede, ela falhava e o agent
// ficava o dia inteiro na cadência de fallback. Qualquer claim bem-sucedido agora corrige isso.
//
// `intervaloSegundos` continua sendo servido para agents antigos, que só conhecem uma cadência
// inteira em segundos (aceitam 5–300 s). Os três valores têm override por env, sem deploy:
// DESKTOP_AGENT_POLLING_ATIVO_MS, DESKTOP_AGENT_POLLING_OCIOSO_MS, DESKTOP_AGENT_POLLING_SEGUNDOS.
const POLLING_ATIVO_MS_PADRAO = 2_000;
const POLLING_OCIOSO_MS_PADRAO = 10_000;
const POLLING_MS_MIN = 1_000;
const POLLING_MS_MAX = 300_000;
const POLLING_INTERVALO_SEGUNDOS_PADRAO = 5;
const POLLING_INTERVALO_SEGUNDOS_MIN = 5;
const POLLING_INTERVALO_SEGUNDOS_MAX = 300;
const CLAIM_LIMITE_PADRAO = 5;

function resolveIntegerEnv({ name, fallback, min, max }: { name: string; fallback: number; min: number; max: number }) {
	const raw = Number(process.env[name]);
	if (!Number.isInteger(raw)) return fallback;
	return Math.min(max, Math.max(min, raw));
}

export function resolveDesktopAgentPollingCadence() {
	const ativoMs = resolveIntegerEnv({ name: "DESKTOP_AGENT_POLLING_ATIVO_MS", fallback: POLLING_ATIVO_MS_PADRAO, min: POLLING_MS_MIN, max: POLLING_MS_MAX });
	const ociosoMs = resolveIntegerEnv({ name: "DESKTOP_AGENT_POLLING_OCIOSO_MS", fallback: POLLING_OCIOSO_MS_PADRAO, min: POLLING_MS_MIN, max: POLLING_MS_MAX });
	const intervaloSegundos = resolveIntegerEnv({
		name: "DESKTOP_AGENT_POLLING_SEGUNDOS",
		fallback: POLLING_INTERVALO_SEGUNDOS_PADRAO,
		min: POLLING_INTERVALO_SEGUNDOS_MIN,
		max: POLLING_INTERVALO_SEGUNDOS_MAX,
	});
	// O ocioso nunca fica mais rápido que o ativo: a janela quieta é para desacelerar.
	return { intervaloSegundos, ativoMs, ociosoMs: Math.max(ativoMs, ociosoMs), claimLimite: CLAIM_LIMITE_PADRAO };
}
export type TDesktopAgentPollingCadence = ReturnType<typeof resolveDesktopAgentPollingCadence>;
