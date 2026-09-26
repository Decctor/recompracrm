// O canal WebSocket de nudge do agente desktop fica desligado por padrão (ver
// `app/api/desktop-agent/ws/route.ts` para o porquê: a function ficava provisionada o expediente
// inteiro). A mesma decisão é servida em `/api/desktop-agent/configuration` como
// `realtime.websocket`, para que o agent nem tente o handshake quando a rota vai responder 501.
export function isDesktopAgentWebSocketEnabled() {
	return process.env.DESKTOP_AGENT_WS_ENABLED === "true";
}
