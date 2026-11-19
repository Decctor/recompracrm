export function resolveFiscalProductProfile<T extends { produtoId: string; produtoVarianteId?: string | null }>(
	profiles: T[],
	item: { produtoId: string; produtoVarianteId?: string | null },
) {
	return (
		(item.produtoVarianteId
			? profiles.find((profile) => profile.produtoId === item.produtoId && profile.produtoVarianteId === item.produtoVarianteId)
			: undefined) ?? profiles.find((profile) => profile.produtoId === item.produtoId && profile.produtoVarianteId == null)
	);
}
