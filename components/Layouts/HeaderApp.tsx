"use client";
import { getAppRouteDescription, getAppRouteTitle } from "@/config";
import SubscriptionStatusBanner from "@/components/Sidebar/SubscriptionStatusBanner";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "../ui/button";
import { SidebarTrigger } from "../ui/sidebar";
export default function AppHeader() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const title = getAppRouteTitle(pathname || "");
	const description = getAppRouteDescription(pathname || "");
	const redirectBackTo = searchParams?.get("redirectBackTo");
	return (
		<header className="flex flex-col gap-0.5">
			<div className="flex items-center justify-between w-full">
				<div className="flex items-center gap-2">
					<SidebarTrigger />
					{redirectBackTo ? (
						<Button variant="ghost" size="fit" asChild className="rounded-full hover:bg-brand/10 flex items-center gap-1 px-2 py-2 short:px-1.5 short:py-1">
							<Link href={redirectBackTo} className="flex items-center gap-1">
								<ArrowLeft className="w-5 h-5 short:w-3.5 short:h-3.5" />
								<span className="short:text-xs">VOLTAR</span>
							</Link>
						</Button>
					) : null}
					<h1 className="text-xl font-black leading-none tracking-tight md:text-2xl text-primary">{title}</h1>
				</div>
				<SubscriptionStatusBanner />
			</div>
			<p className="pl-2 text-sm text-muted-foreground">{description}</p>
		</header>
	);
}
