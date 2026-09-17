import { canManageIntegrations, canViewIntegrations } from "@/lib/integrations/mask";
import {
	canCreateFinances,
	canEditFinances,
	canReconcileFinances,
	canViewFinances,
} from "@/lib/permissions/finances";
import { resolveDiscountAuthority } from "@/lib/permissions/discounts";
import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

export const PERMISSION_ACTION_COLUMNS = [
	{ key: "visualizar", label: "Ver" },
	{ key: "criar", label: "Criar" },
	{ key: "editar", label: "Editar" },
	{ key: "excluir", label: "Excluir" },
] as const;

export type TMembershipPermissionPath = string;

export type TMembershipPermissionLeaf = {
	path: TMembershipPermissionPath;
	description: string;
	shortDescription: string;
};

export type TMembershipPermissionMatrixRow = {
	key: string;
	title: string;
	cells: (TMembershipPermissionLeaf | null)[];
	extras: TMembershipPermissionLeaf[];
	paths: TMembershipPermissionPath[];
	viewPath: TMembershipPermissionPath | null;
	searchIndex: string;
};

export type TMembershipPermissionChange = { path: TMembershipPermissionPath; value: boolean };

const ACCENTED_CHARACTERS = "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ";
const PLAIN_CHARACTERS = "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC";
const TRAILING_CONNECTORS = [" de", " da", " do", " dos", " das", " em"];

function normalize(value: string) {
	let normalized = "";
	for (const character of value) {
		const accentIndex = ACCENTED_CHARACTERS.indexOf(character);
		normalized += accentIndex === -1 ? character.toLowerCase() : (PLAIN_CHARACTERS[accentIndex] as string);
	}
	return normalized;
}

function buildShortDescription(description: string, moduleTitle: string) {
	const normalizedDescription = normalize(description);
	const normalizedTitle = normalize(moduleTitle);
	if (!normalizedDescription.endsWith(normalizedTitle)) return description;

	let shortened = description.slice(0, description.length - moduleTitle.length).trimEnd();
	let strippedConnector = true;
	while (strippedConnector) {
		strippedConnector = false;
		for (const connector of TRAILING_CONNECTORS) {
			if (!normalize(shortened).endsWith(connector)) continue;
			shortened = shortened.slice(0, shortened.length - connector.length).trimEnd();
			strippedConnector = true;
		}
	}
	return shortened.length > 0 ? shortened : description;
}

function leaf(path: TMembershipPermissionPath, description: string, moduleTitle: string): TMembershipPermissionLeaf {
	return { path, description, shortDescription: buildShortDescription(description, moduleTitle) };
}

function buildRow({
	key,
	title,
	cells,
	extras,
}: {
	key: string;
	title: string;
	cells: (TMembershipPermissionLeaf | null)[];
	extras: TMembershipPermissionLeaf[];
}): TMembershipPermissionMatrixRow {
	const columnPaths = new Set(cells.filter((cell) => !!cell).map((cell) => cell.path));
	const allLeafs = [...cells.filter((cell): cell is TMembershipPermissionLeaf => !!cell), ...extras];
	return {
		key,
		title,
		cells,
		extras,
		paths: allLeafs.map((item) => item.path),
		viewPath: cells[0]?.path ?? null,
		searchIndex: normalize([title, ...allLeafs.map((item) => item.description)].join(" ")),
	};
}

function buildMembershipPermissionMatrix({ organizationHasERPAccess }: { organizationHasERPAccess: boolean }): TMembershipPermissionMatrixRow[] {
	const rows: TMembershipPermissionMatrixRow[] = [
		buildRow({
			key: "empresa",
			title: "Empresa",
			cells: [
				leaf("empresa.visualizar", "Visualizar configurações da empresa", "Empresa"),
				null,
				leaf("empresa.editar", "Editar configurações da empresa", "Empresa"),
				null,
			],
			extras: [],
		}),
		buildRow({
			key: "resultados",
			title: "Resultados",
			cells: [leaf("resultados.visualizar", "Visualizar resultados", "Resultados"), null, null, null],
			extras: [leaf("resultados.visualizarSensiveis", "Visualizar dados sensíveis de resultados", "Resultados")],
		}),
		buildRow({
			key: "metas",
			title: "Metas",
			cells: [
				leaf("resultados.visualizarMetas", "Visualizar metas", "Metas"),
				leaf("resultados.criarMetas", "Criar metas", "Metas"),
				leaf("resultados.editarMetas", "Editar metas", "Metas"),
				leaf("resultados.excluirMetas", "Excluir metas", "Metas"),
			],
			extras: [],
		}),
		buildRow({
			key: "usuarios",
			title: "Usuários",
			cells: [
				leaf("usuarios.visualizar", "Visualizar usuários", "Usuários"),
				leaf("usuarios.criar", "Criar usuários", "Usuários"),
				leaf("usuarios.editar", "Editar usuários", "Usuários"),
				leaf("usuarios.excluir", "Excluir usuários", "Usuários"),
			],
			extras: [],
		}),
		buildRow({
			key: "atendimentos",
			title: "Atendimentos",
			cells: [
				leaf("atendimentos.visualizar", "Visualizar atendimentos", "Atendimentos"),
				leaf("atendimentos.iniciar", "Iniciar atendimentos", "Atendimentos"),
				leaf("atendimentos.responder", "Responder atendimentos", "Atendimentos"),
				leaf("atendimentos.finalizar", "Finalizar atendimentos", "Atendimentos"),
			],
			extras: [leaf("atendimentos.receberTransferencias", "Receber transferências de atendimentos", "Atendimentos")],
		}),
		buildRow({
			key: "integracoes",
			title: "Integrações",
			cells: [
				leaf("integracoes.visualizar", "Visualizar integrações", "Integrações"),
				null,
				leaf("integracoes.gerenciar", "Gerenciar integrações", "Integrações"),
				null,
			],
			extras: [],
		}),
	];

	if (organizationHasERPAccess) {
		rows.push(
			buildRow({
				key: "vendas",
				title: "Vendas",
				cells: [
					leaf("vendas.visualizar", "Visualizar vendas", "Vendas"),
					leaf("vendas.criar", "Criar vendas", "Vendas"),
					leaf("vendas.editar", "Editar vendas", "Vendas"),
					leaf("vendas.excluir", "Excluir vendas", "Vendas"),
				],
				extras: [
					leaf("vendas.descontos.aplicar", "Aplicar descontos em vendas", "Vendas"),
					leaf("vendas.descontos.aprovar", "Aprovar descontos de terceiros", "Vendas"),
				],
			}),
			buildRow({
				key: "compras",
				title: "Compras",
				cells: [
					leaf("compras.visualizar", "Visualizar compras", "Compras"),
					leaf("compras.criar", "Criar compras", "Compras"),
					leaf("compras.editar", "Editar compras", "Compras"),
					leaf("compras.excluir", "Excluir compras", "Compras"),
				],
				extras: [],
			}),
			buildRow({
				key: "fiscal",
				title: "Fiscal",
				cells: [leaf("fiscal.visualizar", "Visualizar recursos fiscais", "Fiscal"), null, null, null],
				extras: [
					leaf("fiscal.configurar", "Configurar recursos fiscais", "Fiscal"),
					leaf("fiscal.emitir", "Emitir documentos fiscais", "Fiscal"),
					leaf("fiscal.cancelar", "Cancelar documentos fiscais", "Fiscal"),
				],
			}),
			buildRow({
				key: "financeiro",
				title: "Financeiro",
				cells: [
					leaf("financeiro.visualizar", "Visualizar o financeiro", "Financeiro"),
					leaf("financeiro.criar", "Criar lançamentos financeiros", "Financeiro"),
					leaf("financeiro.editar", "Editar lançamentos financeiros", "Financeiro"),
					null,
				],
				extras: [leaf("financeiro.conciliar", "Realizar conciliação bancária", "Financeiro")],
			}),
		);
	}

	return rows;
}

export function getMembershipPermissionMatrix({ organizationHasERPAccess }: { organizationHasERPAccess: boolean }) {
	return buildMembershipPermissionMatrix({ organizationHasERPAccess });
}

export function getAllMembershipPermissionPaths({ organizationHasERPAccess }: { organizationHasERPAccess: boolean }) {
	return getMembershipPermissionMatrix({ organizationHasERPAccess }).flatMap((row) => row.paths);
}

export function filterMembershipPermissionMatrix({
	search,
	organizationHasERPAccess,
}: {
	search: string;
	organizationHasERPAccess: boolean;
}) {
	const term = normalize(search.trim());
	const matrix = getMembershipPermissionMatrix({ organizationHasERPAccess });
	if (!term) return matrix;
	return matrix.filter((row) => row.searchIndex.includes(term));
}

export function readMembershipPermissionValue(permissions: TOrganizationMemberPermissions, path: TMembershipPermissionPath): boolean {
	switch (path) {
		case "integracoes.visualizar":
			return canViewIntegrations(permissions);
		case "integracoes.gerenciar":
			return canManageIntegrations(permissions);
		case "financeiro.visualizar":
			return canViewFinances(permissions);
		case "financeiro.criar":
			return canCreateFinances(permissions);
		case "financeiro.editar":
			return canEditFinances(permissions);
		case "financeiro.conciliar":
			return canReconcileFinances(permissions);
		case "vendas.descontos.aplicar":
			return resolveDiscountAuthority(permissions).aplicar;
		case "vendas.descontos.aprovar":
			return resolveDiscountAuthority(permissions).aprovar;
		case "atendimentos.receberTransferencias":
			return !!permissions.atendimentos.receberTransferencias;
		default:
			return readNestedPermissionBoolean(permissions, path);
	}
}

function readNestedPermissionBoolean(permissions: TOrganizationMemberPermissions, path: string): boolean {
	const segments = path.split(".");
	let current: unknown = permissions;
	for (const segment of segments) {
		if (typeof current !== "object" || current === null || !(segment in current)) return false;
		current = (current as Record<string, unknown>)[segment];
	}
	return current === true;
}

function materializeIntegracoes(permissions: TOrganizationMemberPermissions) {
	return {
		visualizar: canViewIntegrations(permissions),
		gerenciar: canManageIntegrations(permissions),
	};
}

function materializeFinanceiro(permissions: TOrganizationMemberPermissions) {
	return {
		visualizar: canViewFinances(permissions),
		criar: canCreateFinances(permissions),
		editar: canEditFinances(permissions),
		conciliar: canReconcileFinances(permissions),
	};
}

function materializeDescontos(permissions: TOrganizationMemberPermissions) {
	return resolveDiscountAuthority(permissions);
}

function writeMembershipPermissionValue(
	permissions: TOrganizationMemberPermissions,
	path: TMembershipPermissionPath,
	value: boolean,
): TOrganizationMemberPermissions {
	const next: TOrganizationMemberPermissions = structuredClone(permissions);

	if (path.startsWith("integracoes.")) {
		const integracoes = materializeIntegracoes(permissions);
		const field = path.split(".")[1] as keyof typeof integracoes;
		next.integracoes = { ...integracoes, [field]: value };
		return next;
	}

	if (path.startsWith("financeiro.")) {
		const financeiro = materializeFinanceiro(permissions);
		const field = path.split(".")[1] as keyof typeof financeiro;
		next.financeiro = { ...financeiro, [field]: value };
		return next;
	}

	if (path.startsWith("vendas.descontos.")) {
		const descontos = materializeDescontos(permissions);
		const field = path.split(".")[2] as keyof typeof descontos;
		next.vendas = {
			...next.vendas,
			descontos: { ...descontos, [field]: value },
		};
		return next;
	}

	const segments = path.split(".");
	let current: Record<string, unknown> = next as unknown as Record<string, unknown>;
	for (let index = 0; index < segments.length - 1; index += 1) {
		const segment = segments[index] as string;
		const existing = current[segment];
		if (typeof existing !== "object" || existing === null) {
			current[segment] = {};
		}
		current = current[segment] as Record<string, unknown>;
	}
	current[segments[segments.length - 1] as string] = value;
	return next;
}

export function resolveMembershipPermissionToggle({
	row,
	path,
	value,
	permissions,
}: {
	row: TMembershipPermissionMatrixRow;
	path: TMembershipPermissionPath;
	value: boolean;
	permissions: TOrganizationMemberPermissions;
}): TMembershipPermissionChange[] {
	const isActive = (candidate: TMembershipPermissionPath) => readMembershipPermissionValue(permissions, candidate);

	if (value) {
		const changes: TMembershipPermissionChange[] = [{ path, value: true }];
		if (row.viewPath && row.viewPath !== path && !isActive(row.viewPath)) changes.push({ path: row.viewPath, value: true });
		return changes;
	}

	if (row.viewPath === path) {
		return row.paths.filter((rowPath) => rowPath === path || isActive(rowPath)).map((rowPath) => ({ path: rowPath, value: false }));
	}

	return [{ path, value: false }];
}

export function resolveMembershipRowToggle({ row, value }: { row: TMembershipPermissionMatrixRow; value: boolean }): TMembershipPermissionChange[] {
	return row.paths.map((path) => ({ path, value }));
}

export function resolveMembershipColumnToggle({
	rows,
	actionIndex,
	value,
	permissions,
}: {
	rows: TMembershipPermissionMatrixRow[];
	actionIndex: number;
	value: boolean;
	permissions: TOrganizationMemberPermissions;
}): TMembershipPermissionChange[] {
	return rows.flatMap((row) => {
		const leaf = row.cells[actionIndex];
		if (!leaf) return [];
		return resolveMembershipPermissionToggle({ row, path: leaf.path, value, permissions });
	});
}

export function applyMembershipPermissionChanges(
	permissions: TOrganizationMemberPermissions,
	changes: TMembershipPermissionChange[],
): TOrganizationMemberPermissions {
	return changes.reduce((current, change) => writeMembershipPermissionValue(current, change.path, change.value), permissions);
}

export function countGrantedMembershipPermissions({
	permissions,
	organizationHasERPAccess,
}: {
	permissions: TOrganizationMemberPermissions;
	organizationHasERPAccess: boolean;
}) {
	const paths = getAllMembershipPermissionPaths({ organizationHasERPAccess });
	return paths.reduce((total, path) => (readMembershipPermissionValue(permissions, path) ? total + 1 : total), 0);
}
