// Recorte da Web Serial API que a balança do caixa usa. O TypeScript não traz esses tipos no DOM
// (a API só existe no Chrome e no Edge de computador), então eles ficam aqui, sem augmentar o
// `Navigator` global: quem precisa da serial passa por `getWebSerial()`, que devolve `null` fora
// desses navegadores.

export type TWebSerialPortInfo = { usbVendorId?: number; usbProductId?: number };

export type TWebSerialOpenOptions = {
	baudRate: number;
	dataBits?: 7 | 8;
	stopBits?: 1 | 2;
	parity?: "none" | "even" | "odd";
	flowControl?: "none" | "hardware";
};

export type TWebSerialPort = EventTarget & {
	readonly readable: ReadableStream<Uint8Array> | null;
	readonly writable: WritableStream<Uint8Array> | null;
	open(options: TWebSerialOpenOptions): Promise<void>;
	close(): Promise<void>;
	getInfo(): TWebSerialPortInfo;
};

export type TWebSerial = EventTarget & {
	requestPort(options?: { filters?: TWebSerialPortInfo[] }): Promise<TWebSerialPort>;
	getPorts(): Promise<TWebSerialPort[]>;
};

export function getWebSerial(): TWebSerial | null {
	if (typeof navigator === "undefined") return null;
	return (navigator as Navigator & { serial?: TWebSerial }).serial ?? null;
}
