import net from "node:net";
import { isLoopbackHost } from "./guard";

const INSTALLED = Symbol.for("recompracrm.local-dev.network-guard");

function resolveTargetHost(args: unknown[]): string | null {
	const [first, second] = args;
	// `connect(options)`; undici and tls hand over an array-wrapped options object in some paths.
	const options = Array.isArray(first) ? first[0] : first;
	if (options && typeof options === "object") {
		const { path, host } = options as { path?: string; host?: string };
		if (path) return null; // unix socket / named pipe
		return host ?? "localhost";
	}
	if (typeof first === "string") return null; // connect(path)
	if (typeof first === "number") return typeof second === "string" ? second : "localhost";
	return "localhost";
}

/**
 * Local mode's second line of defence: the Node process may only open TCP connections to this
 * machine. Stub keys already make every external call fail, but a stub sent to a real endpoint is
 * still contact with a real service (Stripe, Resend, Meta, the fiscal provider). With this
 * installed the socket is never opened.
 *
 * It only covers the server process. The browser is kept away from real services by the stub
 * `NEXT_PUBLIC_*` values.
 */
export function installLocalNetworkGuard() {
	const globalRegistry = globalThis as Record<symbol, unknown>;
	if (globalRegistry[INSTALLED]) return;
	globalRegistry[INSTALLED] = true;

	const originalConnect = net.Socket.prototype.connect;
	net.Socket.prototype.connect = function guardedConnect(this: net.Socket, ...args: unknown[]) {
		const host = resolveTargetHost(args);
		if (host !== null && !isLoopbackHost(host)) {
			const error = new Error(`[local-dev] Outbound connection to "${host}" blocked: local mode only talks to this machine.`);
			process.nextTick(() => this.destroy(error));
			return this;
		}
		return (originalConnect as (...connectArgs: unknown[]) => net.Socket).apply(this, args);
	} as typeof net.Socket.prototype.connect;
}
