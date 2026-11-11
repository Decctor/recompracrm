import type { TAuthUserSession } from "@/lib/authentication/types";
import { OrganizationConfigurationSchema, OrganizationMemberPermissionsSchema, type TOrganizationConfiguration, type TOrganizationMemberPermissions } from "@/schemas/organizations";
import { fillFromSchema } from "./zod-fill";

// A loja dos Reels: a Sorveteria da Márcia. Cores e nome da organização de exemplo, todas as
// permissões ligadas (é a dona olhando a própria loja).
export const DEMO_ORGANIZATION_ID = "content-studio-sorveteria";

// Configuração com o ERP contratado: libera a aba Operacional dos resultados e o estoque do produto.
const DEMO_CONFIGURATION = fillFromSchema(OrganizationConfigurationSchema) as TOrganizationConfiguration;
DEMO_CONFIGURATION.recursos.erp.acesso = true;

export const DEMO_SESSION = {
	session: {
		id: "content-studio-session",
		usuarioId: "content-studio-marcia",
		usuarioDispositivo: null,
		usuarioNavegador: null,
		organizacaoAtivaId: DEMO_ORGANIZATION_ID,
		dataExpiracao: new Date("2030-01-01T00:00:00Z"),
	},
	user: {
		admin: false,
		id: "content-studio-marcia",
		nome: "Márcia",
		telefone: "",
		email: "marcia@sorveteria.example",
		avatarUrl: null,
	},
	membership: {
		id: "content-studio-membership",
		usuarioVendedorId: null,
		organizacao: {
			id: DEMO_ORGANIZATION_ID,
			nome: "Sorveteria da Márcia",
			slug: "sorveteria-da-marcia",
			cnpj: "",
			logoUrl: null,
			assinaturaAtiva: true,
			assinaturaPlano: null,
			corPrimaria: "#24549c",
			corPrimariaForeground: "#ffffff",
			corSecundaria: "#ffb900",
			corSecundariaForeground: "#1d2433",
			poiQrCodeKioskDataUrl: null,
			poiQrCodeMobileDataUrl: null,
			poiConfirmacaoValorObrigatoria: false,
			poiConfiguracao: null,
			configuracao: DEMO_CONFIGURATION,
			integracoes: [],
			dataOnboardingConclusao: new Date("2026-01-10T12:00:00Z"),
			fiscalEmissaoAutomatica: false,
		},
		permissoes: fillFromSchema(OrganizationMemberPermissionsSchema) as TOrganizationMemberPermissions,
	},
} satisfies TAuthUserSession;
