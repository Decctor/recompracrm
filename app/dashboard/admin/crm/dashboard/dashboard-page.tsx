"use client";
import CrmStatsCards from "@/components/CRM/CrmStatsCards";
import FunnelChart from "@/components/CRM/FunnelChart";
import type { TAuthUserSession } from "@/lib/authentication/types";
import dayjs from "dayjs";
import { useState } from "react";

type DashboardPageProps = {
	user: TAuthUserSession["user"];
};

export default function DashboardPage({ user }: DashboardPageProps) {
	const [periodAfter] = useState(dayjs().startOf("month").toISOString());
	const [periodBefore] = useState(dayjs().endOf("month").toISOString());

	return (
		<div className="w-full flex flex-col gap-4">
			<h1 className="text-lg font-semibold">Dashboard CRM</h1>

			<CrmStatsCards periodAfter={periodAfter} periodBefore={periodBefore} />

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<FunnelChart periodAfter={periodAfter} periodBefore={periodBefore} />
			</div>
		</div>
	);
}
