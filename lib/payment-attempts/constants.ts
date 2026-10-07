// Código do cliente nativo em NATIVE_ACCESS_CLIENTS (lib/access/clients-catalog.ts). Importado
// daqui para que o módulo de tentativas não dependa do catálogo inteiro (que importa o banco).
export const PAYMENT_TERMINAL_CLIENT_CODE = "RECOMPRA_PAYMENT_TERMINAL";

// Janela em que um terminal conta como "online" para atribuição: o app reporta heartbeat a cada
// minuto em uso; três minutos absorvem uma falha de rede sem esconder um terminal desligado.
export const PAYMENT_TERMINAL_ONLINE_WINDOW_MS = 3 * 60 * 1000;
