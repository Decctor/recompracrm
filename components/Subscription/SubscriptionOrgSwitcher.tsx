"use client";

import { brandLogoSource } from "@/components/Brand/BrandLogo";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchOrganization } from "@/lib/mutations/organizations";
import { useUserMemberships } from "@/lib/queries/organizations";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Plus, Shield } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

/** Fallback quando a organização não tem logo próprio. */
const LogoIcon = brandLogoSource("icon", "color-on-dark");

const AVATAR_SIZE = 24;

/**
 * Trocador de organização da página de assinatura. Existe porque bloqueio é por organização: quem
 * administra duas lojas pode ter uma suspensa e outra em dia, e sem isto a página seria um beco sem
 * saída. Numa página não há scrim, então o menu não disputa camada com nada.
 */
export default function SubscriptionOrgSwitcher({ isPlatformAdmin, disabled }: { isPlatformAdmin: boolean; disabled?: boolean }) {
	const { data: membershipsData, isLoading } = useUserMemberships();

	const switchOrgMutation = useMutation({
		mutationFn: switchOrganization,
		onSuccess: () => {
			window.location.reload();
		},
	});

	if (isLoading) {
		return <div className="h-9 w-44 animate-pulse rounded-2xl bg-border" aria-label="Carregando organizações" />;
	}

	const memberships = membershipsData?.memberships ?? [];
	const activeOrganizationId = membershipsData?.activeOrganizationId ?? null;
	const hasMultipleOrgs = memberships.length > 1;

	const currentOrg =
		memberships.find((m) => m.organizacao.id === activeOrganizationId)?.organizacao ?? (memberships.length === 1 ? memberships[0].organizacao : null);

	const orgAvatar = (
		<Image
			src={currentOrg?.logoUrl ?? LogoIcon}
			alt=""
			width={AVATAR_SIZE}
			height={AVATAR_SIZE}
			className="size-6 shrink-0 rounded-md object-cover"
		/>
	);

	if (!hasMultipleOrgs) {
		return (
			<div className={cn("inline-flex h-9 max-w-full items-center gap-2 rounded-2xl px-2.5", disabled && "pointer-events-none opacity-50")}>
				{orgAvatar}
				<span className="truncate text-sm font-medium">{currentOrg?.nome ?? "RecompraCRM"}</span>
			</div>
		);
	}

	const isSwitching = switchOrgMutation.isPending;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant="outline"
						disabled={disabled || isSwitching}
						aria-label="Trocar de organização"
						className="h-9 max-w-56 justify-between gap-2 rounded-2xl bg-card px-2.5 font-normal"
					>
						{orgAvatar}
						<span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{currentOrg?.nome ?? "Selecionar organização"}</span>
						{isSwitching ? (
							<Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
						) : (
							<ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
						)}
					</Button>
				}
			/>
			<DropdownMenuContent className="min-w-64 rounded-2xl" side="bottom" align="end" sideOffset={6}>
				<DropdownMenuGroup>
					<DropdownMenuLabel>Organizações</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					{memberships.map((membership) => {
						const isActive = membership.organizacao.id === activeOrganizationId;
						return (
							<DropdownMenuItem
								key={membership.id}
								disabled={isSwitching}
								className="cursor-pointer"
								onClick={() => {
									if (isActive || isSwitching) return;
									switchOrgMutation.mutate({ organizationId: membership.organizacao.id });
								}}
							>
								<div className="flex w-full items-center gap-2">
									<Image
										src={membership.organizacao.logoUrl ?? LogoIcon}
										alt=""
										width={AVATAR_SIZE}
										height={AVATAR_SIZE}
										className="size-6 shrink-0 rounded-md object-cover"
									/>
									<span className="flex-1 truncate">{membership.organizacao.nome}</span>
									{isActive && <Check className="size-4 text-foreground" aria-hidden />}
								</div>
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						className="cursor-pointer"
						render={
							<Link href="/onboarding">
								<Plus className="size-4 shrink-0" aria-hidden />
								<span className="flex-1 truncate">Nova organização</span>
							</Link>
						}
					/>
					{isPlatformAdmin && (
						<DropdownMenuItem
							className="cursor-pointer"
							render={
								<Link href="/admin-dashboard">
									<Shield className="size-4 shrink-0" aria-hidden />
									<span className="flex-1 truncate">Painel admin</span>
								</Link>
							}
						/>
					)}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
