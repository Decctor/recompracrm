"use client";

import type { TGetProductsOutputById } from "@/app/api/products/route";
import type { TAuthUserSession } from "@/lib/authentication/types";
import ProductAddOnsInformation from "./_components/AddOnsInformation";
import ProductFiscalProfilesInformation from "./_components/FiscalProfilesInformation";
import ProductGeneralInformation from "./_components/GeneralInformation";
import MainSupplierSection from "./_components/MainSupplierSection";
import PricesAndChannelsSection from "./_components/PricesAndChannelsSection";
import ProductVariantsInformation from "./_components/VariantsInformation";

type ProductRegistryTabProps = {
	sessionUserMembership: NonNullable<TAuthUserSession["membership"]>;
	product: TGetProductsOutputById;
	callbacks: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function ProductRegistryTab({ sessionUserMembership, product, callbacks }: ProductRegistryTabProps) {
	const orgHasERPAccess = sessionUserMembership?.organizacao.configuracao.recursos.erp.acesso;
	const userHasFiscalViewPermission = sessionUserMembership?.permissoes.fiscal.visualizar;
	const userHasFiscalConfigurePermission = sessionUserMembership?.permissoes.fiscal.configurar;
	const userHasPurchasesViewPermission = sessionUserMembership?.permissoes.compras.visualizar;

	return (
		<div className="flex w-full flex-col gap-6">
			<ProductGeneralInformation product={product} callbacks={callbacks} />
			<PricesAndChannelsSection product={product} orgHasERPAccess={orgHasERPAccess} callbacks={callbacks} />
			<MainSupplierSection product={product} userHasPurchasesViewPermission={userHasPurchasesViewPermission} callbacks={callbacks} />
			<ProductVariantsInformation product={product} callbacks={callbacks} />
			<ProductAddOnsInformation product={product} callbacks={callbacks} />
			{orgHasERPAccess ? (
				<ProductFiscalProfilesInformation
					product={product}
					userHasFiscalViewPermission={userHasFiscalViewPermission}
					userHasFiscalConfigurePermission={userHasFiscalConfigurePermission}
					callbacks={callbacks}
				/>
			) : null}
		</div>
	);
}
