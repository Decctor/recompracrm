import { NextResponse } from "next/server";

/**
 * @deprecated Use /api/point-of-interaction/new-transaction instead.
 */
export async function POST() {
	return NextResponse.json(
		{
			message:
				"Endpoint descontinuado. Utilize /api/point-of-interaction/new-transaction para processar novas vendas no Ponto de Interação.",
		},
		{ status: 410 },
	);
}
