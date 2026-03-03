"use client";
import ClientMain from "@/components/Clients/ClientDetails/ClientDetailsMain";
import type { TAuthUserSession } from "@/lib/authentication/types";

type ClientPageProps = {
	user: TAuthUserSession["user"];
	id: string;
};
export default function ClientPage({ user, id }: ClientPageProps) {
	return (
		<div className="flex w-full max-w-full grow flex-col overflow-x-hidden bg-background px-6 lg:px-12 py-6">
			<h1 className="text-2xl font-black text-primary">Cliente</h1>
			<ClientMain id={id} user={user} />
		</div>
	);
}
