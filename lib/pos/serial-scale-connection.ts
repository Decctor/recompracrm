import { getErrorMessage } from "@/lib/errors";
import {
	createScaleFrameParser,
	createStableWeightConfirmer,
	DEFAULT_SERIAL_SCALE_SETTINGS,
	describeStableWeightFailure,
	SERIAL_SCALE_COMMAND_BYTES,
	SERIAL_SCALE_DETECTION_FRAMINGS,
	type TScaleFrame,
	type TSerialScaleCommand,
	type TSerialScaleSettings,
} from "./serial-scale-protocol";
import { getWebSerial, type TWebSerialPort, type TWebSerialPortInfo } from "./web-serial";

// Conexão do navegador com a balança do caixa. Uma instância só por aba (`serialScale`): a porta
// serial é exclusiva — só um dono por vez — e as telas do PDV (nova venda, checkout, edição) se
// revezam sem fechar e reabrir a porta a cada navegação.
//
// A balança é de cada computador, não da organização: o navegador autoriza a porta por computador, e
// dois caixas da mesma loja podem ter balanças diferentes. O pareamento escolhe a porta, detecta o
// protocolo (velocidade, enquadramento, comando) e guarda o perfil neste navegador. Computador sem
// perfil não tem balança — o PDV não mostra nada dela.
//
// Enquanto alguém usa a balança, a porta fica aberta e o PDV pede o peso quatro vezes por segundo:
// é o que mantém o peso "ao vivo" na tela e faz a pesagem do clique sair em ~0,5 s. Pedido e
// resposta são locais (cabo serial); não há servidor nem agente no caminho.

export type TSerialScaleStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

export type TSerialScalePairingOutcome =
	| { kind: "FOUND"; settings: TSerialScaleSettings }
	| { kind: "NOT_FOUND" }
	/** O operador fechou o seletor de porta sem escolher. */
	| { kind: "CANCELLED" }
	| { kind: "FAILED"; error: string };

export type TSerialScaleProfile = { settings: TSerialScaleSettings; port: TWebSerialPortInfo };

export type TSerialScaleStatusSnapshot = {
	status: TSerialScaleStatus;
	/** Este computador tem balança pareada (perfil salvo). Sem perfil, o PDV não mostra nada. */
	isPaired: boolean;
	/** A balança respondeu desde que a porta abriu: é o "detectada" que libera os botões de pesar. */
	hasAnswered: boolean;
	settings: TSerialScaleSettings | null;
	/** Mensagem para o operador quando a porta caiu ou não abriu. */
	error: string | null;
	/** Detecção em andamento: o que está sendo testado agora ("4800 bps · ENQ"). */
	detecting: string | null;
};

export type TSerialScaleLiveSnapshot = {
	frame: TScaleFrame | null;
	/** `Date.now()` do último quadro: um peso velho não pode parecer atual quando a balança desliga. */
	receivedAt: number | null;
};

const POLL_INTERVAL_MS = 250;
/** Linha de texto sem terminador é lida depois desse silêncio (ver `flush` do parser). */
const LINE_IDLE_FLUSH_MS = 120;
/** Folga ao sair de uma tela do PDV para outra antes de soltar a porta. */
const RELEASE_GRACE_MS = 15_000;
const DEFAULT_STABLE_TIMEOUT_MS = 5_000;
/** Silêncio inicial na detecção: quem transmite sem ser perguntado é modo contínuo. */
const DETECT_LISTEN_MS = 400;
const DETECT_COMMAND_MS = 600;
/** Quadros válidos para aceitar uma combinação: um só poderia ser lixo da velocidade errada. */
const DETECT_FRAMES_REQUIRED = 2;
const PROFILE_STORAGE_KEY = "recompra:balanca-caixa:perfil";

const PARITY: Record<TSerialScaleSettings["paridade"], "none" | "even" | "odd"> = { NENHUMA: "none", PAR: "even", IMPAR: "odd" };
const DETECTION_COMMANDS: Exclude<TSerialScaleCommand, "CONTINUO">[] = ["ENQ", "W", "P"];

function readStoredProfile(): TSerialScaleProfile | null {
	try {
		if (typeof window === "undefined") return null;
		const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<TSerialScaleProfile>;
		if (!parsed.settings || typeof parsed.settings.velocidade !== "number") return null;
		return { settings: { ...DEFAULT_SERIAL_SCALE_SETTINGS, ...parsed.settings }, port: parsed.port ?? {} };
	} catch {
		return null;
	}
}

function writeStoredProfile(profile: TSerialScaleProfile | null) {
	try {
		if (profile) window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
		else window.localStorage.removeItem(PROFILE_STORAGE_KEY);
	} catch {
		// Sem storage, o pareamento vale só até a aba fechar; nada a fazer.
	}
}

function pickGrantedPort(ports: TWebSerialPort[], info: TWebSerialPortInfo | undefined) {
	if (ports.length === 0) return null;
	if (info?.usbVendorId !== undefined) {
		const match = ports.find((port) => {
			const candidate = port.getInfo();
			return candidate.usbVendorId === info.usbVendorId && candidate.usbProductId === info.usbProductId;
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

function describeAttempt(settings: TSerialScaleSettings) {
	const parity = settings.paridade === "NENHUMA" ? "N" : settings.paridade === "PAR" ? "E" : "O";
	return `${settings.velocidade} bps · ${settings.bitsDados}${parity}${settings.bitsParada} · ${settings.comando === "CONTINUO" ? "contínuo" : settings.comando}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class SerialScaleConnection {
	private profile: TSerialScaleProfile | null = null;
	private profileLoaded = false;
	/** Parâmetros com que a porta está aberta agora (na detecção, a combinação em teste). */
	private active: TSerialScaleSettings | null = null;
	private port: TWebSerialPort | null = null;
	private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
	private parser = createScaleFrameParser({ casasDecimais: 3 });
	/** Incrementa a cada abertura; um laço de leitura de uma sessão antiga para sozinho. */
	private session = 0;
	private readLoopDone: Promise<void> = Promise.resolve();
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private releaseTimer: ReturnType<typeof setTimeout> | null = null;
	private users = 0;
	private isDetecting = false;
	private pending: Promise<unknown> = Promise.resolve();
	private serialListenersBound = false;

	private statusSnapshot: TSerialScaleStatusSnapshot = {
		status: "DISCONNECTED",
		isPaired: false,
		hasAnswered: false,
		settings: null,
		error: null,
		detecting: null,
	};
	private liveSnapshot: TSerialScaleLiveSnapshot = { frame: null, receivedAt: null };
	private statusListeners = new Set<() => void>();
	private liveListeners = new Set<() => void>();
	private frameListeners = new Set<(frame: TScaleFrame) => void>();

	// ------------------------------------------------------------------ stores (useSyncExternalStore)

	subscribeStatus = (listener: () => void) => {
		this.ensureProfileLoaded();
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	};
	getStatusSnapshot = () => {
		this.ensureProfileLoaded();
		return this.statusSnapshot;
	};

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

	private ensureProfileLoaded() {
		if (this.profileLoaded || typeof window === "undefined") return;
		this.profileLoaded = true;
		this.profile = readStoredProfile();
		this.statusSnapshot = { ...this.statusSnapshot, isPaired: !!this.profile, settings: this.profile?.settings ?? null };
	}

	private setProfile(profile: TSerialScaleProfile | null) {
		this.profile = profile;
		writeStoredProfile(profile);
		this.setStatus({ isPaired: !!profile, settings: profile?.settings ?? null });
	}

	/** Serializa abrir/fechar/detectar: duas aberturas simultâneas da mesma porta falham. */
	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		const run = this.pending.then(task, task);
		this.pending = run.catch(() => undefined);
		return run;
	}

	// ------------------------------------------------------------------ ciclo de vida

	/** Marca um usuário da balança (uma tela montada). Devolve a função que o libera. */
	retain() {
		this.ensureProfileLoaded();
		this.users += 1;
		if (this.releaseTimer) {
			clearTimeout(this.releaseTimer);
			this.releaseTimer = null;
		}
		this.bindSerialEvents();
		if (this.users === 1 && !this.port && this.profile) void this.reconnect({ interactive: false });
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

	/**
	 * Reabre a balança pareada. Sem clique (`interactive: false`) só funciona se o navegador ainda
	 * guarda a autorização da porta; com clique, pede a porta de novo se a autorização sumiu.
	 */
	async reconnect({ interactive }: { interactive: boolean }): Promise<boolean> {
		this.ensureProfileLoaded();
		const serial = getWebSerial();
		const profile = this.profile;
		if (!serial || !profile) return false;
		if (this.port && this.statusSnapshot.status === "CONNECTED") return true;
		let port: TWebSerialPort | null;
		try {
			port = pickGrantedPort(await serial.getPorts(), profile.port);
			if (!port && interactive) port = await serial.requestPort();
		} catch (error) {
			if (error instanceof Error && error.name === "NotFoundError") return false;
			this.setStatus({ status: "ERROR", error: describeOpenError(error) });
			return false;
		}
		if (!port) {
			this.setStatus({ status: "DISCONNECTED", error: "A autorização da porta da balança foi removida neste navegador. Pareie de novo." });
			return false;
		}
		const chosen = port;
		return this.enqueue(async () => {
			if (this.port === chosen && this.statusSnapshot.status === "CONNECTED") return true;
			if (this.port) await this.closePort();
			return this.openPort(chosen, profile.settings);
		});
	}

	/**
	 * Pareamento: escolhe a porta (precisa vir de um clique), procura o protocolo e guarda o perfil
	 * deste computador. Sem resposta a nada, a porta fica aberta com o ponto de partida, para o
	 * ajuste manual.
	 */
	async pair(): Promise<TSerialScalePairingOutcome> {
		const serial = getWebSerial();
		if (!serial) return { kind: "FAILED", error: "Este navegador não acessa a porta serial." };
		this.bindSerialEvents();
		// O seletor precisa ser chamado ainda dentro do gesto do clique: nada de fila antes dele.
		let port: TWebSerialPort;
		try {
			port = await serial.requestPort();
		} catch (error) {
			if (error instanceof Error && error.name === "NotFoundError") return { kind: "CANCELLED" };
			const message = describeOpenError(error);
			this.setStatus({ status: "ERROR", error: message });
			return { kind: "FAILED", error: message };
		}
		return this.enqueue(() => this.detectAndKeep(port));
	}

	/** Detecta de novo na porta já aberta (troca de balança, cabo, configuração da balança). */
	redetect(): Promise<TSerialScalePairingOutcome> {
		return this.enqueue(async () => {
			const port = this.port;
			if (!port) return { kind: "FAILED", error: "A balança não está conectada." };
			return this.detectAndKeep(port);
		});
	}

	private async detectAndKeep(port: TWebSerialPort): Promise<TSerialScalePairingOutcome> {
		if (this.port) await this.closePort();
		const found = await this.detectOn(port);
		if (found) this.setProfile({ settings: found, port: port.getInfo() });
		if (this.port !== port) await this.openPort(port, found ?? this.profile?.settings ?? DEFAULT_SERIAL_SCALE_SETTINGS);
		if (found) return { kind: "FOUND", settings: found };
		if (this.statusSnapshot.status === "ERROR") return { kind: "FAILED", error: this.statusSnapshot.error ?? "Não foi possível abrir a porta." };
		return { kind: "NOT_FOUND" };
	}

	/** Ajuste manual (casas decimais, ou um protocolo que a detecção não achou): salva e reabre. */
	updateSettings(partial: Partial<TSerialScaleSettings>) {
		return this.enqueue(async () => {
			const port = this.port;
			const base = this.profile?.settings ?? this.active ?? DEFAULT_SERIAL_SCALE_SETTINGS;
			const settings = { ...base, ...partial };
			this.setProfile({ settings, port: port?.getInfo() ?? this.profile?.port ?? {} });
			if (port) {
				await this.closePort();
				await this.openPort(port, settings);
			}
		});
	}

	/** Esquece a balança deste computador: o PDV deixa de mostrar qualquer coisa dela. */
	forget() {
		return this.enqueue(async () => {
			await this.closePort();
			this.setProfile(null);
			this.setStatus({ status: "DISCONNECTED", error: null, hasAnswered: false });
		});
	}

	disconnect() {
		return this.enqueue(async () => {
			await this.closePort();
			this.setStatus({ status: "DISCONNECTED", error: null, hasAnswered: false });
		});
	}

	private bindSerialEvents() {
		if (this.serialListenersBound) return;
		const serial = getWebSerial();
		if (!serial) return;
		this.serialListenersBound = true;
		// Cabo reconectado (ou balança religada no USB): volta sozinho se alguém está usando.
		serial.addEventListener("connect", () => {
			if (this.users > 0 && !this.port && this.profile) void this.reconnect({ interactive: false });
		});
		serial.addEventListener("disconnect", (event) => {
			if (event.target !== this.port) return;
			void this.enqueue(async () => {
				await this.closePort();
				this.setStatus({ status: "ERROR", error: "A balança foi desconectada do computador.", hasAnswered: false });
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
			this.active = null;
			this.setStatus({ status: "ERROR", error: describeOpenError(error), hasAnswered: false });
			return false;
		}
		this.port = port;
		this.active = settings;
		this.session += 1;
		this.parser = createScaleFrameParser({ casasDecimais: settings.casasDecimais });
		this.writer = port.writable?.getWriter() ?? null;
		this.readLoopDone = this.readLoop(port, this.session);
		this.startPolling();
		this.setLive({ frame: null, receivedAt: null });
		this.setStatus({ status: "CONNECTED", error: null, hasAnswered: false });
		return true;
	}

	private async closePort() {
		const port = this.port;
		if (!port) return;
		this.session += 1;
		this.stopPolling();
		if (this.flushTimer) clearTimeout(this.flushTimer);
		this.flushTimer = null;
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
		this.active = null;
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
			if (this.flushTimer) clearTimeout(this.flushTimer);
			this.flushTimer = null;
			// Solta o writer e fecha a porta perdida: sem isso o objeto fica "aberto" e o `open()` da
			// reconexão (cabo religado) falha com InvalidStateError, que aparece como "porta em uso".
			try {
				this.writer?.releaseLock();
			} catch {
				// Writer já morto com a porta.
			}
			this.writer = null;
			try {
				await port.close();
			} catch {
				// Porta perdida pode recusar o close; o navegador a descarta sozinho.
			}
			this.port = null;
			this.active = null;
			this.parser.reset();
			this.setLive({ frame: null, receivedAt: null });
			this.setStatus({ status: "ERROR", error: "A conexão com a balança caiu.", hasAnswered: false });
		}
	}

	private handleBytes(chunk: Uint8Array) {
		this.emitFrames(this.parser.push(chunk));
		if (this.flushTimer) clearTimeout(this.flushTimer);
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			this.emitFrames(this.parser.flush());
		}, LINE_IDLE_FLUSH_MS);
	}

	private emitFrames(frames: TScaleFrame[]) {
		if (frames.length === 0) return;
		for (const frame of frames) for (const listener of this.frameListeners) listener(frame);
		this.setLive({ frame: frames[frames.length - 1], receivedAt: Date.now() });
		if (!this.statusSnapshot.hasAnswered && !this.isDetecting) this.setStatus({ hasAnswered: true });
	}

	private startPolling() {
		this.stopPolling();
		this.pollTimer = setInterval(() => {
			// Aba em segundo plano não pesa nada; a balança descansa até o operador voltar.
			if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
			void this.sendCommand();
		}, POLL_INTERVAL_MS);
	}

	private stopPolling() {
		if (this.pollTimer) clearInterval(this.pollTimer);
		this.pollTimer = null;
	}

	private async sendCommand(command: TSerialScaleCommand | undefined = this.active?.comando) {
		if (!command || command === "CONTINUO") return;
		try {
			await this.writer?.write(Uint8Array.of(SERIAL_SCALE_COMMAND_BYTES[command]));
		} catch {
			// Porta caindo: a leitura decide o estado, não a escrita.
		}
	}

	/**
	 * Testa as combinações conhecidas até a balança responder. Em cada enquadramento, primeiro só
	 * escuta (modo contínuo), depois pede o peso com cada comando. Roda dentro da fila.
	 */
	private async detectOn(port: TWebSerialPort): Promise<TSerialScaleSettings | null> {
		this.isDetecting = true;
		const decimals = this.profile?.settings.casasDecimais ?? DEFAULT_SERIAL_SCALE_SETTINGS.casasDecimais;
		try {
			for (const framing of SERIAL_SCALE_DETECTION_FRAMINGS) {
				const listening: TSerialScaleSettings = { ...framing, comando: "CONTINUO", casasDecimais: decimals };
				this.setStatus({ detecting: describeAttempt(listening) });
				if (!(await this.openPort(port, listening))) return null;
				let frames = 0;
				const onFrame = () => {
					frames += 1;
				};
				this.frameListeners.add(onFrame);
				try {
					await sleep(DETECT_LISTEN_MS);
					if (frames >= DETECT_FRAMES_REQUIRED) return listening;
					for (const comando of DETECTION_COMMANDS) {
						const attempt: TSerialScaleSettings = { ...listening, comando };
						this.active = attempt;
						this.setStatus({ detecting: describeAttempt(attempt) });
						frames = 0;
						const until = Date.now() + DETECT_COMMAND_MS;
						while (Date.now() < until && frames < DETECT_FRAMES_REQUIRED) {
							await this.sendCommand(comando);
							await sleep(POLL_INTERVAL_MS / 2);
						}
						if (frames >= DETECT_FRAMES_REQUIRED) return attempt;
					}
				} finally {
					this.frameListeners.delete(onFrame);
				}
				await this.closePort();
			}
			return null;
		} finally {
			this.isDetecting = false;
			this.setStatus({ detecting: null, hasAnswered: false });
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
			void this.sendCommand();
		});
	}
}

export const serialScale = new SerialScaleConnection();
