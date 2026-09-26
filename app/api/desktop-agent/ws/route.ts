import { type TExternalActorContext, authenticateExternalRequest } from "@/lib/access/authentication";
import { claimablePrintJobsCondition } from "@/lib/desktop-agent/print-jobs";
import { db } from "@/services/drizzle";
import { accessPrincipals, printJobs } from "@/services/drizzle/schema";
import { experimental_upgradeWebSocket } from "@vercel/functions";
import { and, eq, inArray } from "drizzle-orm";
import { isHttpError } from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { WebSocket } from "ws";

// Canal WebSocket de NUDGE do agente desktop (plano §Canal WebSocket, decisão 1):
// o socket nunca carrega jobs — apenas avisa "tem trabalho" e o agent faz o claim HTTP normal.
// Toda a correção mora no caminho HTTP; perder este canal degrada latência, nunca correção.
//
// DESLIGADO POR PADRÃO. No Fluid Compute a function fica provisionada (2 GB) enquanto o socket
// estiver aberto, e o agent reabre o socket assim que a Vercel o fecha aos 300 s: uma loja com
// impressão ao longo do dia mantém uma instância presa o expediente inteiro. Em setembro/2026
// esta rota respondia por ~75% das GB-hora do projeto (25–30 GB-h/dia) para avisar algo que o
// polling HTTP de 5 s descobre sozinho. `DESKTOP_AGENT_WS_ENABLED=true` religa; sem ela o
// handshake recebe 501, que o agent já trata como "sem canal em tempo real": recua 1s→2s→4s e,
// após três recusas, tenta de novo só a cada 5 min. O caminho de correção (claim/report) não
// passa por aqui.
//
// Fora do appApiHandler de propósito: o handler devolve a Response de upgrade do
// experimental_upgradeWebSocket, não um NextResponse.json — desvio consciente do padrão.
//
// A conexão é efêmera por design (fecha no limite de duração da function e a cada deploy);
// o agent reconecta com backoff. Instâncias não compartilham memória: este registro de
// conexões e o sweep são por instância, e o estado durável mora em print_jobs.

const NUDGE_SWEEP_INTERVAL_MS = 1_000;
// Cooldown por conexão: um job que ninguém consegue claimar (ex.: sem impressora configurada
// para a finalidade) não pode virar um loop de nudge+claim a cada sweep.
const NUDGE_MIN_INTERVAL_MS = 10_000;
// Ping do agent alimenta ultimo_acesso de forma amostrada (mesmo racional da autenticação HTTP).
const PING_LAST_ACCESS_SAMPLING_MS = 5 * 60 * 1_000;

type TAgentConnection = {
	ws: WebSocket;
	principalId: string;
	organizationId: string;
	lastNudgeAt: number;
	lastAccessWriteAt: number;
};

const connections = new Map<WebSocket, TAgentConnection>();
let nudgeSweepTimer: NodeJS.Timeout | null = null;

async function runNudgeSweep() {
	if (connections.size === 0) return;
	try {
		const organizationIds = Array.from(new Set(Array.from(connections.values()).map((connection) => connection.organizationId)));
		// Uma query por instância (não por agent), indexada por (organizacao, status, data):
		// só as organizações com socket conectado aqui.
		const rows = await db
			.selectDistinct({ organizacaoId: printJobs.organizacaoId })
			.from(printJobs)
			.where(and(inArray(printJobs.organizacaoId, organizationIds), claimablePrintJobsCondition(new Date())));
		const organizationsWithJobs = new Set(rows.map((row) => row.organizacaoId));

		const now = Date.now();
		for (const connection of connections.values()) {
			if (!organizationsWithJobs.has(connection.organizationId)) continue;
			if (now - connection.lastNudgeAt < NUDGE_MIN_INTERVAL_MS) continue;
			if (connection.ws.readyState !== WebSocket.OPEN) continue;
			connection.lastNudgeAt = now;
			// Nudge sem payload: granularidade por organização — o claim faz o roteamento exato,
			// e um claim vazio é inofensivo.
			connection.ws.send(JSON.stringify({ type: "print-jobs.available" }));
		}
	} catch (error) {
		console.error("[DESKTOP-AGENT WS] Erro no sweep de nudge", error);
	}
}

function ensureNudgeSweep() {
	if (!nudgeSweepTimer) nudgeSweepTimer = setInterval(runNudgeSweep, NUDGE_SWEEP_INTERVAL_MS);
}

function stopNudgeSweepIfIdle() {
	if (connections.size === 0 && nudgeSweepTimer) {
		clearInterval(nudgeSweepTimer);
		nudgeSweepTimer = null;
	}
}

async function touchPrincipalLastAccess(connection: TAgentConnection) {
	const now = Date.now();
	if (now - connection.lastAccessWriteAt < PING_LAST_ACCESS_SAMPLING_MS) return;
	connection.lastAccessWriteAt = now;
	try {
		await db.update(accessPrincipals).set({ ultimoAcesso: new Date() }).where(eq(accessPrincipals.id, connection.principalId));
	} catch (error) {
		console.error("[DESKTOP-AGENT WS] Erro ao registrar último acesso", error);
	}
}

function registerAgentConnection(ws: WebSocket, actor: TExternalActorContext) {
	const connection: TAgentConnection = {
		ws,
		principalId: actor.principalId,
		organizationId: actor.organizationId,
		// lastNudgeAt zerado: se havia job aguardando enquanto o agent estava offline,
		// o primeiro sweep após a conexão já nudga.
		lastNudgeAt: 0,
		lastAccessWriteAt: Date.now(),
	};
	connections.set(ws, connection);
	ensureNudgeSweep();

	ws.on("message", (raw) => {
		let message: unknown;
		try {
			message = JSON.parse(raw.toString());
		} catch {
			return;
		}
		if ((message as { type?: string }).type === "agent.ping") {
			void touchPrincipalLastAccess(connection);
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "agent.pong" }));
		}
	});
	ws.on("close", () => {
		connections.delete(ws);
		stopNudgeSweepIfIdle();
	});
	ws.on("error", (error) => {
		console.error("[DESKTOP-AGENT WS] Erro na conexão", error);
		connections.delete(ws);
		stopNudgeSweepIfIdle();
	});

	ws.send(JSON.stringify({ type: "connection.ready", principalId: actor.principalId }));
}

function isWebSocketChannelEnabled() {
	return process.env.DESKTOP_AGENT_WS_ENABLED === "true";
}

export async function GET(request: NextRequest) {
	// Antes da autenticação de propósito: a recusa não deve custar nem a consulta da credencial.
	if (!isWebSocketChannelEnabled()) {
		return NextResponse.json(
			{ data: null, message: "Canal WebSocket desativado neste ambiente. Utilize o polling HTTP." },
			{ status: 501 },
		);
	}

	// Autenticação no handshake: o upgrade é um GET normal e o Bearer rcm_ viaja no header.
	let actor: TExternalActorContext;
	try {
		actor = await authenticateExternalRequest(request);
	} catch (error) {
		if (isHttpError(error)) return NextResponse.json({ data: null, message: error.message }, { status: error.statusCode });
		throw error;
	}

	try {
		return await experimental_upgradeWebSocket((ws) => registerAgentConnection(ws, actor));
	} catch (error) {
		// Runtime sem suporte a upgrade (dev local, regressão da API experimental):
		// o agent degrada para o polling HTTP — latência maior, correção intacta.
		console.error("[DESKTOP-AGENT WS] Upgrade indisponível", error);
		return NextResponse.json({ data: null, message: "WebSocket indisponível neste ambiente. Utilize o polling HTTP." }, { status: 501 });
	}
}
