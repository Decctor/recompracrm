import PartnerPayoutPage from "./partner-payout-page";

export default async function PartnerPayout({ params }: { params: Promise<{ payoutId: string }> }) {
	const { payoutId } = await params;
	return <PartnerPayoutPage payoutId={payoutId} />;
}
