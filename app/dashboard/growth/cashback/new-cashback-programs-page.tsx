"use client";
import NewCashbackProgram from "@/components/Modals/CashbackPrograms/NewCashbackProgram";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { BadgePercent, Settings } from "lucide-react";
import { useState } from "react";

type NewCashbackProgramsPageProps = {
	user: TAuthUserSession["user"];
	userOrg: Exclude<TAuthUserSession["membership"], null>["organizacao"];
	/** cashback.configurar: sem ela não há como criar o programa — fica o aviso. */
	canConfigure: boolean;
};

export default function NewCashbackProgramsPage({ user, userOrg, canConfigure }: NewCashbackProgramsPageProps) {
	const [newCashbackProgramModalIsOpen, setNewCashbackProgramModalIsOpen] = useState<boolean>(false);

	return (
		<div className="w-full h-full flex items-center justify-center p-4">
			<Card className="w-full max-w-lg border-dashed shadow-none bg-muted/30">
				<CardHeader className="flex flex-col items-center text-center space-y-4 pb-2">
					<div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
						<BadgePercent className="w-8 h-8 text-foreground" />
					</div>
					<div className="space-y-2">
						<CardTitle className="text-xl">Programa de Cashback não configurado</CardTitle>
						<CardDescription className="text-base max-w-sm mx-auto">
							{canConfigure
								? "Você ainda não definiu as regras do seu programa de fidelidade. Configure agora para começar a recompensar seus clientes."
								: "O programa de fidelidade ainda não foi configurado. Peça a quem administra a empresa para configurá-lo."}
						</CardDescription>
					</div>
				</CardHeader>
				{canConfigure ? (
					<CardContent className="flex flex-col items-center justify-center pb-8 pt-4">
						<Button size={"lg"} className="flex items-center gap-2 font-semibold" onClick={() => setNewCashbackProgramModalIsOpen(true)}>
							<Settings className="w-4 h-4" />
							CONFIGURAR PROGRAMA
						</Button>
					</CardContent>
				) : null}
			</Card>

			{newCashbackProgramModalIsOpen ? (
				<NewCashbackProgram
					user={user}
					userOrg={userOrg}
					closeModal={() => setNewCashbackProgramModalIsOpen(false)}
					callbacks={{
						onSettled: () => window.location.reload(),
					}}
				/>
			) : null}
		</div>
	);
}
