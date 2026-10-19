import type { TAdminPaymentAttemptActionInput, TAdminPaymentAttemptActionOutput } from "@/app/api/admin/payment-attempts/route";
import axios from "axios";

export async function resumePaymentAttemptEffectuation({ attemptId }: { attemptId: string }) {
	const { data } = await axios.post<TAdminPaymentAttemptActionOutput>("/api/admin/payment-attempts", {
		attemptId,
		action: "RETOMAR_EFETIVACAO",
	} satisfies TAdminPaymentAttemptActionInput);
	return data;
}
