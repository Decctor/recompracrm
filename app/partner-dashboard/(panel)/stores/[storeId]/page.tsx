import PartnerStorePage from "./partner-store-page";

export default async function PartnerStore({ params }: { params: Promise<{ storeId: string }> }) {
	const { storeId } = await params;
	return <PartnerStorePage storeId={storeId} />;
}
