"use client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import AdminKPIsBlock from "./components/AdminKPIsBlock";
import AdminOrganizationsBlock from "./components/AdminOrganizationsBlock";
import NewOrganization from "./components/NewOrganization/NewOrganization";

export default function AdminDashboardPage() {
	const [newOrganizationModalOpen, setNewOrganizationModalOpen] = useState(false);

	return (
		<div className="w-full h-full flex flex-col gap-4">
			{/* Header with Action Button */}
			<div className="w-full flex items-center justify-between">
				<h1 className="text-2xl font-bold tracking-tight">Painel Administrativo</h1>
				<Button onClick={() => setNewOrganizationModalOpen(true)} className="flex items-center gap-2">
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					NOVA ORGANIZAÇÃO
				</Button>
			</div>

			{/* KPIs Block */}
			<AdminKPIsBlock />

			{/* Organizations Block */}
			<AdminOrganizationsBlock />

			{/* New Organization Modal */}
			{newOrganizationModalOpen && <NewOrganization closeModal={() => setNewOrganizationModalOpen(false)} />}
		</div>
	);
}
