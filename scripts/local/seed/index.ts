import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertLocalDatabase } from "../../../lib/local-dev/guard";
import { LOCAL_STATE_DIR } from "../env";
import * as ids from "./ids";

export const SEED_MANIFEST_FILE = path.join(LOCAL_STATE_DIR, "seed-manifest.json");

/** Order matters: every scenario pack builds on `base`. */
const PACKS = {
	base: { description: "Demo store that can sell immediately (always loaded).", load: async () => (await import("./packs/base")).seedBasePack },
	coupons: { description: "One coupon of each benefit type in the demo store.", load: async () => (await import("./packs/coupons")).seedCouponsPack },
	"sales-history": {
		description: "About 90 days of confirmed sales in the demo store.",
		load: async () => (await import("./packs/sales-history")).seedSalesHistoryPack,
	},
	"crm-only": { description: "A paying store without the ERP.", load: async () => (await import("./packs/crm-only")).seedCrmOnlyPack },
	trial: { description: "A store in its free trial.", load: async () => (await import("./packs/trial")).seedTrialPack },
} as const;
export type TSeedPackName = keyof typeof PACKS;
const PACK_NAMES = Object.keys(PACKS) as TSeedPackName[];

function resolvePackSelection(requested: string[] | null): TSeedPackName[] {
	if (!requested) return PACK_NAMES;
	const unknown = requested.filter((name) => !(name in PACKS));
	if (unknown.length > 0) throw new Error(`[local-dev] Unknown seed pack(s): ${unknown.join(", ")}. Available: ${PACK_NAMES.join(", ")}.`);
	// `base` always runs, and packs always run in registry order.
	return PACK_NAMES.filter((name) => name === "base" || requested.includes(name));
}

function writeSeedManifest(packs: TSeedPackName[]) {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL as string;
	const manifest = {
		geradoEm: new Date().toISOString(),
		banco: assertLocalDatabase().database,
		appUrl,
		pacotes: packs,
		urls: {
			dashboard: `${appUrl}/dashboard`,
			pdv: `${appUrl}/dashboard/sales/new`,
			lojaDigital: `${appUrl}/shop/${ids.SEED_STORES.demo.slug}`,
		},
		usuarios: ids.SEED_USERS,
		lojas: ids.SEED_STORES,
		vendedores: ids.SEED_SELLERS,
		produtos: ids.SEED_PRODUCTS,
		variantes: ids.SEED_VARIANTS,
		adicionais: ids.SEED_ADD_ONS,
		clientes: ids.SEED_CLIENTS,
		tags: ids.SEED_CLIENT_TAGS,
		cashback: ids.SEED_CASHBACK_PROGRAM,
		caixaAberto: ids.SEED_SALES_SESSION,
		entregaLojaDigital: ids.SEED_SHOP_DELIVERY,
		cupons: ids.SEED_COUPONS,
	};
	mkdirSync(LOCAL_STATE_DIR, { recursive: true });
	writeFileSync(SEED_MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function runSeedPacks({ packs }: { packs: string[] | null }) {
	assertLocalDatabase();
	const selection = resolvePackSelection(packs);
	for (const name of selection) {
		const startedAt = Date.now();
		const seed = await PACKS[name].load();
		// The app's services log every step; a few hundred seeded sales would bury the output.
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			if (typeof args[0] === "string" && args[0].startsWith("[local-dev]")) originalLog(...args);
		};
		try {
			await seed();
		} finally {
			console.log = originalLog;
		}
		console.log(`[local-dev] Seed pack "${name}" loaded (${Date.now() - startedAt} ms).`);
	}
	writeSeedManifest(selection);
	console.log(`[local-dev] Manifest: ${path.relative(process.cwd(), SEED_MANIFEST_FILE)}`);

	// The app's pool would keep the script alive and block the template snapshot.
	const { connection } = await import("@/services/drizzle");
	await connection.end();
}
