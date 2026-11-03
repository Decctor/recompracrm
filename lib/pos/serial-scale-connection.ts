import { getErrorMessage } from "@/lib/errors";
import {
	createScaleFrameParser,
	createStableWeightConfirmer,
	describeStableWeightFailure,
	SCALE_ENQ,
	type TScaleFrame,
	type TSerialScaleSettings,
} from "./serial-scale-protocol";
import { getWebSerial, type TWebSerialPort, type TWebSerialPortInfo } from "./web-serial";

// Conexão do navegador com a balança do caixa. Uma instância só por aba (`serialScale`): a porta
// serial é exclusiva — só um dono por vez — e as telas do PDV (nova venda, checkout, edição) se
// revezam sem fechar e reabrir a porta a cada navegação.
//
// Enquanto alguém usa a balança, a porta fica aberta e o PDV pergunta o peso (ENQ) quatro vezes por
// segundo: é o que mantém o peso "ao vivo" na tela e o que faz a pesagem do clique sair em ~0,5 s.
// Pergunta e resposta são locais (cabo serial); não há servidor nem agente no caminho.

export type TSerialScaleStatus = "UNSUPPORTED" | "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

export type TSerialScaleStatusSnapshot = {
	status: TSerialScaleStatus;
	/** Mensagem para o operador quando a porta caiu ou não abriu. */
	error: string | null;
	/** Velocidade com que a porta está aberta agora (pode diferir da configurada durante a detecção). */
	velocidade: number | null;
};

export type TSerialScaleLiveSnapshot = {
	frame: TScaleFrame | null;
	/** `Date.now()` do último quadro: um peso velho não pode parecer atual quando a balança desliga. */
	receivedAt: number | null;
};

export type TSerialScaleConnectMode =
	/** Só reabre uma porta já autorizada neste navegador; nunca abre o seletor (não há gesto do usuário). */
	| "AUTO"
	/** Reabre a porta autorizada; sem nenhuma, abre o seletor. Precisa vir de um clique. */
	| "INTERACTIVE"
	/** Sempre abre o seletor, para trocar de porta. Precisa vir de um clique. */
	| "CHOOSE";

const POLL_INTERVAL_MS = 250;
/** Folga ao sair de uma tela do PDV para outra antes de soltar a porta. */
const RELEASE_GRACE_MS = 15_000;
const DEFAULT_STABLE_TIMEOUT_MS = 5_000;
const DETECT_WINDOW_MS = 1_500;
const PORT_STORAGE_KEY = "recompra:balanca-caixa:porta";

const PARITY: Record<TSerialScaleSettings["paridade"], "none" | "even" | "odd"> = { NENHUMA: "none", PAR: "even", IMPAR: "odd" };

function sameSettings(a: TSerialScaleSettings | null, b: TSerialScaleSettings) {
	return (
		!!a &&
		a.velocidade === b.velocidade &&
		a.bitsDados === b.bitsDados &&
		a.paridade === b.paridade &&
		a.bitsParada === b.bitsParada &&
		a.casasDecimais === b.casasDecimais
	);
}

function readStoredPortInfo(): TWebSerialPortInfo | null {
	try {
		const raw = window.localStorage.getItem(PORT_STORAGE_KEY);
		return raw ? (JSON.parse(raw) as TWebSerialPortInfo) : null;
	} catch {
		return null;
	}
}

function storePortInfo(info: TWebSerialPortInfo) {
	try {
		window.localStorage.setItem(PORT_STORAGE_KEY, JSON.stringify(info));
	} catch {
		// Sem storage, a próxima abertura pega a primeira porta autorizada; nada a fazer.
	}
}

function pickGrantedPort(ports: TWebSerialPort[]) {
	if (ports.length === 0) return null;
	const stored = readStoredPortInfo();
	if (stored?.usbVendorId !== undefined) {
		const match = ports.find((port) => {
			const info = port.getInfo();
			return info.usbVendorId === stored.usbVendorId && info.usbProductId === stored.usbProductId;
		});
		if (match) return match;
	}
	return ports[0];
}

function describeOpenError(error: unknown) {
	const name = error instanceof Error ? error.name : "";
	if (name === "NetworkError" || name === "InvalidStateError") {
		return "Não foi possível abrir a porta da balança: ela pode estar em uso por outra aba do PDV ou por outro programa.";
	}
	if (name === "SecurityError") return "O navegador bloqueou o acesso à porta serial nesta página.";
	return `Não foi possível abrir a porta da balança: ${getErrorMessage(error)}`;
}

class SerialScaleConnection {
	private settings: TSerialScaleSettings | null = null;
	private port: TWebSerialPort | null = null;
	private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
	private parser = createScaleFrameParser({ casasDecimais: 3 });
	/** Incrementa a cada abertura; um laço de leitura de uma sessão antiga para sozinho. */
	private session = 0;
	private readLoopDone: Promise<void> = Promise.resolve();
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private releaseTimer: ReturnType<typeof setTimeout> | null = null;
	private users = 0;
	private detecting = false;
	private pending: Promise<unknown> = Promise.resolve();
	private serialListenersBound = false;

	private statusSnapshot: TSerialScaleStatusSnapshot = { status: "DISCONNECTED", error: null, velocidade: null };
	private liveSnapshot: TSerialScaleLiveSnapshot = { frame: null, receivedAt: null };
	private statusListeners = new Set<() => void>();
	private liveListeners = new Set<() => void>();
	private frameListeners = new Set<(frame: TScaleFrame) => void>();

	// ------------------------------------------------------------------ stores (useSyncExternalStore)

	subscribeStatus = (listener: () => void) => {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	};
	getStatusSnapshot = () => this.statusSnapshot;

	subscribeLive = (listener: () => void) => {
		this.liveListeners.add(listener);
		return () => this.liveListeners.delete(listener);
	};
	getLiveSnapshot = () => this.liveSnapshot;

	private setStatus(partial: Partial<TSerialScaleStatusSnapshot>) {
		this.statusSnapshot = { ...this.statusSnapshot, ...partial };
		for (const listener of this.statusListeners) listener();
	}

	private setLive(next: TSerialScaleLiveSnapshot) {
		this.liveSnapshot = next;
		for (const listener of this.liveListeners) listener();
	}

	/** Serializa abrir/fechar/reconfigurar: duas aberturas simultâneas da mesma porta falham. */
	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		const run = this.pending.then(task, task);
		this.pending = run.catch(() => undefined);
		return run;
	}

	// ------------------------------------------------------------------ ciclo de vida

	/** Marca um usuário da balança (uma tela montada). Devolve a função que o libera. */
	retain() {
		this.users += 1;
		if (this.releaseTimer) {
			clearTimeout(this.releaseTimer);
			this.releaseTimer = null;
		}
		this.bindSerialEvents();
		if (this.users === 1 && !this.port) void this.connect({ mode: "AUTO" });
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.users = Math.max(0, this.users - 1);
			if (this.users > 0) return;
			this.releaseTimer = setTimeout(() => {
				this.releaseTimer = null;
				if (this.users === 0) void this.disconnect();
			}, RELEASE_GRACE_MS);
		};
	}

	/** Parâmetros da organização. Mudou com a porta aberta: reabre com os novos. */
	configure(settings: TSerialScaleSettings) {
		if (sameSettings(this.settings, settings)) return;
		const firstSettings = this.settings === null;
		this.settings = settings;
		this.parser = createScaleFrameParser({ casasDecimais: settings.casasDecimais });
		// Uma tela pediu a balança antes de a configuração chegar: a abertura automática fica para agora.
		if (firstSettings && this.users > 0 && !this.port) {
			void this.connect({ mode: "AUTO" });
			return;
		}
		if (this.port && !this.detecting) {
			const port = this.port;
			void this.enqueue(async () => {
				await this.closePort();
				await this.openPort(port, settings);
			});
		}
	}

	async connect({ mode }: { mode: TSerialScaleConnectMode }): Promise<boolean> {
		const serial = getWebSerial();
		if (!serial) {
			this.setStatus({ status: "UNSUPPORTED", error: null });
			return false;
		}
		const settings = this.settings;
		if (!settings) return false;
		this.bindSerialEvents();

		// O seletor precisa ser chamado ainda dentro do gesto do clique: nada de fila antes dele.
		let chosen: TWebSerialPort | null = null;
		try {
			if (mode === "CHOOSE") chosen = await serial.requestPort();
			else {
				if (this.port && this.statusSnapshot.status === "CONNECTED") return true;
				chosen = pickGrantedPort(await serial.getPorts());
				if (!chosen && mode === "INTERACTIVE") chosen = await serial.requestPort();
			}
		} catch (error) {
			// O operador fechou o seletor sem escolher: não é erro de balança.
			if (error instanceof Error && error.name === "NotFoundError") return false;
			this.setStatus({ status: "ERROR", error: describeOpenError(error) });
			return false;
		}
		if (!chosen) return false;
		storePortInfo(chosen.getInfo());

		const port = chosen;
		return this.enqueue(async () => {
			if (this.port === port && this.statusSnapshot.status === "CONNECTED") return true;
			if (this.port) await this.closePort();
			return this.openPort(port, this.settings ?? settings);
		});
	}

	disconnect() {
		return this.enqueue(async () => {
			await this.closePort();
			this.setStatus({ status: "DISCONNECTED", error: null, velocidade: null });
		});
	}

	private bindSerialEvents() {
		if (this.serialListenersBound) return;
		const serial = getWebSerial();
		if (!serial) return;
		this.serialListenersBound = true;
		// Cabo reconectado (ou balança religada no USB): volta sozinho se alguém está usando.
		serial.addEventListener("connect", () => {
			if (this.users > 0 && !this.port) void this.connect({ mode: "AUTO" });
		});
		serial.addEventListener("disconnect", (event) => {
			if (event.target !== this.port) return;
			void this.enqueue(async () => {
				await this.closePort();
				this.setStatus({ status: "ERROR", error: "A balança foi desconectada do computador.", velocidade: null });
			});
		});
	}

	private async openPort(port: TWebSerialPort, settings: TSerialScaleSettings) {
		this.setStatus({ status: "CONNECTING", error: null });
		try {
			await port.open({
				baudRate: settings.velocidade,
				dataBits: settings.bitsDados,
				stopBits: settings.bitsParada,
				parity: PARITY[settings.paridade],
				flowControl: "none",
			});
		} catch (error) {
			this.port = null;
			this.setStatus({ status: "ERROR", error: describeOpenError(error), velocidade: null });
			return false;
		}
		this.port = port;
		this.session += 1;
		this.parser = createScaleFrameParser({ casasDecimais: settings.casasDecimais });
		this.writer = port.writable?.getWriter() ?? null;
		this.readLoopDone = this.readLoop(port, this.session);
		this.startPolling();
		this.setLive({ frame: null, receivedAt: null });
		this.setStatus({ status: "CONNECTED", error: null, velocidade: settings.velocidade });
		return true;
	}

	private async closePort() {
		const port = this.port;
		if (!port) return;
		this.session += 1;
		this.stopPolling();
		try {
			await this.reader?.cancel();
		} catch {
			// O leitor já pode ter morrido com a porta.
		}
		await this.readLoopDone;
		try {
			this.writer?.releaseLock();
		} catch {
			// Idem.
		}
		this.writer = null;
		try {
			await port.close();
		} catch {
			// Porta perdida (cabo puxado) não fecha; o navegador a descarta sozinho.
		}
		this.port = null;
		this.parser.reset();
		this.setLive({ frame: null, receivedAt: null });
	}

	private async readLoop(port: TWebSerialPort, session: number) {
		// Erro de enquadramento/paridade troca o `readable` e o laço segue; perda do dispositivo
		// zera o `readable` e o laço termina.
		while (port.readable && this.session === session) {
			const reader = port.readable.getReader();
			this.reader = reader;
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					if (value && this.session === session) this.handleBytes(value);
				}
			} catch {
				// Erro não fatal: o próximo giro pega o novo `readable`.
			} finally {
				reader.releaseLock();
				if (this.reader === reader) this.reader = null;
			}
		}
		if (this.session === session && this.port === port) {
			this.stopPolling();
			this.port = null;
			this.setStatus({ status: "ERROR", error: "A conexão com a balança caiu.", velocidade: null });
		}
	}

	private handleBytes(chunk: Uint8Array) {
		const frames = this.parser.push(chunk);
		if (frames.length === 0) return;
		for (const frame of frames) for (const listener of this.frameListeners) listener(frame);
		this.setLive({ frame: frames[frames.length - 1], receivedAt: Date.now() });
	}

	private startPolling() {
		this.stopPolling();
		this.pollTimer = setInterval(() => {
			// Aba em segundo plano não pesa nada; a balança descansa até o operador voltar.
			if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
			void this.sendEnq();
		}, POLL_INTERVAL_MS);
	}

	private stopPolling() {
		if (this.pollTimer) clearInterval(this.pollTimer);
		this.pollTimer = null;
	}

	private async sendEnq() {
		try {
			await this.writer?.write(Uint8Array.of(SCALE_ENQ));
		} catch {
			// Balança em modo contínuo ou porta caindo: a leitura decide o estado, não a escrita.
		}
	}

	// ------------------------------------------------------------------ leituras

	/**
	 * Espera um peso estável e maior que zero, lido depois da chamada (nunca o último peso guardado).
	 * Rejeita com a mensagem para o operador quando não fecha a tempo.
	 */
	readStableWeight({ timeoutMs = DEFAULT_STABLE_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<number> {
		if (this.statusSnapshot.status !== "CONNECTED") return Promise.reject(new Error("A balança não está conectada."));
		return new Promise((resolve, reject) => {
			const confirmer = createStableWeightConfirmer();
			const finish = (outcome: { weightKg: number } | { error: string }) => {
				clearTimeout(timer);
				this.frameListeners.delete(onFrame);
				unsubscribeStatus();
				if ("weightKg" in outcome) resolve(outcome.weightKg);
				else reject(new Error(outcome.error));
			};
			const onFrame = (frame: TScaleFrame) => {
				const progress = confirmer.push(frame);
				if (progress.status === "CONFIRMED") finish({ weightKg: progress.weightKg });
				else if (progress.status === "FAILED") finish({ error: describeStableWeightFailure(progress) ?? "Leitura recusada pela balança." });
			};
			const unsubscribeStatus = this.subscribeStatus(() => {
				if (this.statusSnapshot.status !== "CONNECTED") finish({ error: this.statusSnapshot.error ?? "A balança foi desconectada." });
			});
			const timer = setTimeout(() => {
				finish({ error: describeStableWeightFailure(confirmer.current()) ?? "A balança não respondeu." });
			}, timeoutMs);
			this.frameListeners.add(onFrame);
			void this.sendEnq();
		});
	}

	/**
	 * Procura a velocidade em que a balança responde: reabre a porta em cada uma e espera qualquer
	 * quadro válido. Devolve a que respondeu (e deixa a porta nela) ou `null`, voltando à configurada.
	 */
	detectBaudRate(candidates: readonly number[]): Promise<number | null> {
		return this.enqueue(async () => {
			const port = this.port;
			const settings = this.settings;
			if (!port || !settings) return null;
			this.detecting = true;
			try {
				for (const velocidade of candidates) {
					await this.closePort();
					const opened = await this.openPort(port, { ...settings, velocidade });
					if (!opened) continue;
					const answered = await new Promise<boolean>((resolve) => {
						const onFrame = () => {
							clearTimeout(timer);
							this.frameListeners.delete(onFrame);
							resolve(true);
						};
						const timer = setTimeout(() => {
							this.frameListeners.delete(onFrame);
							resolve(false);
						}, DETECT_WINDOW_MS);
						this.frameListeners.add(onFrame);
					});
					if (answered) return velocidade;
				}
				await this.closePort();
				await this.openPort(port, this.settings ?? settings);
				return null;
			} finally {
				this.detecting = false;
			}
		});
	}
}

export const serialScale = new SerialScaleConnection();
