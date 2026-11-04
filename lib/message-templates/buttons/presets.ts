export const MESSAGE_TEMPLATE_BUTTON_PRESET_IDS = ["CLIENT_POI_PROFILE"] as const;

export type TMessageTemplateButtonPresetId = (typeof MESSAGE_TEMPLATE_BUTTON_PRESET_IDS)[number];
export type TMessageTemplateRedirectType = "client-poi-profile";
export type TMessageTemplateRuntimeParam = "clientId";

type BuildWhatsappTemplateUrlParams = {
	origin: string;
	orgId: string;
};

type BuildRuntimeUrlParams = BuildWhatsappTemplateUrlParams & {
	clientId: string;
	interactionId?: string | null;
};

export type TMessageTemplateButtonPreset = {
	id: TMessageTemplateButtonPresetId;
	label: string;
	description: string;
	defaultText: string;
	redirectType: TMessageTemplateRedirectType;
	requiredRuntimeParams: TMessageTemplateRuntimeParam[];
	buildWhatsappTemplateUrl: (params: BuildWhatsappTemplateUrlParams) => string;
	buildRuntimeUrl: (params: BuildRuntimeUrlParams) => string;
	resolveWhatsappParameterExample: () => string;
};

function normalizeOrigin(origin: string) {
	return origin.replace(/\/+$/, "");
}

function buildRedirectUrl({
	origin,
	type,
	orgId,
	clientId,
	interactionId,
}: {
	origin: string;
	type: TMessageTemplateRedirectType;
	orgId: string;
	clientId: string;
	interactionId?: string | null;
}) {
	const url = new URL("/redirects", normalizeOrigin(origin));
	url.searchParams.set("type", type);
	url.searchParams.set("orgId", orgId);
	url.searchParams.set("clientId", clientId);
	if (interactionId) url.searchParams.set("interactionId", interactionId);
	const serialized = url.toString();
	return clientId === "{{1}}" ? serialized.replace("clientId=%7B%7B1%7D%7D", "clientId={{1}}") : serialized;
}

export const MESSAGE_TEMPLATE_BUTTON_PRESETS = {
	CLIENT_POI_PROFILE: {
		id: "CLIENT_POI_PROFILE",
		label: "Perfil do cliente",
		description: "Abre o perfil externo do cliente no ponto de interação.",
		defaultText: "Ver meu perfil",
		redirectType: "client-poi-profile",
		requiredRuntimeParams: ["clientId"],
		buildWhatsappTemplateUrl: ({ origin, orgId }) =>
			buildRedirectUrl({
				origin,
				type: "client-poi-profile",
				orgId,
				clientId: "{{1}}",
			}),
		buildRuntimeUrl: ({ origin, orgId, clientId, interactionId }) =>
			buildRedirectUrl({
				origin,
				type: "client-poi-profile",
				orgId,
				clientId,
				interactionId,
			}),
		resolveWhatsappParameterExample: () => "cliente_exemplo_123",
	},
} satisfies Record<TMessageTemplateButtonPresetId, TMessageTemplateButtonPreset>;

export const MESSAGE_TEMPLATE_BUTTON_PRESET_OPTIONS = Object.values(MESSAGE_TEMPLATE_BUTTON_PRESETS);

export function getMessageTemplateButtonPreset(presetId: string): TMessageTemplateButtonPreset | null {
	if (MESSAGE_TEMPLATE_BUTTON_PRESET_IDS.includes(presetId as TMessageTemplateButtonPresetId)) {
		return MESSAGE_TEMPLATE_BUTTON_PRESETS[presetId as TMessageTemplateButtonPresetId];
	}
	return null;
}

const WHATSAPP_URL_PARAMETER = "{{1}}";
const WHATSAPP_URL_PARAMETER_PLACEHOLDER = "__WHATSAPP_URL_PARAMETER__";

export function hasWhatsappUrlParameter(url: string) {
	return /\{\{\s*\w+\s*\}\}/.test(url);
}

// A Meta devolve um botão de preset como URL comum terminando em `{{1}}`: o vínculo com o preset só
// existe localmente. Reconhece a URL gerada por `buildWhatsappTemplateUrl` (qualquer origem, qualquer
// organização) para que um sync não rebaixe o botão a uma URL fixa que o envio nunca preenche.
export function resolveMessageTemplateButtonPresetFromWhatsappUrl(url: string): TMessageTemplateButtonPreset | null {
	if (!url.includes(WHATSAPP_URL_PARAMETER)) return null;

	let parsed: URL;
	try {
		parsed = new URL(url.replace(WHATSAPP_URL_PARAMETER, WHATSAPP_URL_PARAMETER_PLACEHOLDER));
	} catch {
		return null;
	}
	if (parsed.pathname !== "/redirects") return null;
	if (parsed.searchParams.get("clientId") !== WHATSAPP_URL_PARAMETER_PLACEHOLDER) return null;

	const redirectType = parsed.searchParams.get("type");
	return MESSAGE_TEMPLATE_BUTTON_PRESET_OPTIONS.find((preset) => preset.redirectType === redirectType) ?? null;
}

export function getDefaultAppOrigin() {
	return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || "https://www.recompracrm.com.br";
}
