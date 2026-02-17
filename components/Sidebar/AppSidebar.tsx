import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";
import type { TAuthUserSession } from "@/lib/authentication/types";
import type { TUserSession } from "@/schemas/users";
import {
	BadgePercent,
	Goal,
	Grid3X3,
	Handshake,
	Home,
	Megaphone,
	MessageCircle,
	Package,
	ShoppingCart,
	Tag,
	UserRound,
	Users,
	UsersRound,
} from "lucide-react";
import AppSidebarContentGroup from "./AppSidebarContentGroup";
import AppSidebarFooter from "./AppSidebarFooter";
import AppSidebarHeader from "./AppSidebarHeader";

export type TSidebarConfigItem = {
	group: string;
	items: TSidebarItem[];
};

export type TSidebarItem = {
	title: string;
	url: string | null;
	icon: React.ReactNode;
	items: TSidebarItem[] | null;
};

type TSidebarConfigItemWithAccess = {
	group: string;
	items: TSidebarItemWithAccess[];
};

type TSidebarItemWithAccess = TSidebarItem & {
	checkAccess: (organization: NonNullable<TAuthUserSession["membership"]>["organizacao"]) => boolean;
};
const SidebarConfig: TSidebarConfigItemWithAccess[] = [
	{
		group: "Geral",
		items: [
			{
				title: "Dashboard",
				url: "/dashboard",
				icon: <Home className="w-4 h-4" />,
				items: null,
				checkAccess: () => true,
			},
		],
	},
	{
		group: "Comercial",
		items: [
			{
				title: "Vendas",
				url: "/dashboard/commercial/sales",
				icon: <ShoppingCart className="w-4 h-4" />,
				items: null,
				checkAccess: () => true,
			},
			{
				title: "Matriz RFM",
				url: "/dashboard/commercial/segments",
				icon: <Grid3X3 className="w-4 h-4" />,
				items: null,
				checkAccess: () => true,
			},
			{
				title: "Clientes",
				url: "/dashboard/commercial/clients",
				icon: <UsersRound className="w-4 h-4" />,
				items: null,
				checkAccess: () => true,
			},
			{
				title: "Vendedores",
				url: "/dashboard/team/sellers",
				icon: <UserRound className="w-4 h-4" />,
				items: null,
				checkAccess: () => true,
			},
			{
				title: "Parceiros",
				url: "/dashboard/commercial/partners",
				icon: <Handshake className="w-4 h-4" />,
				items: null,
				checkAccess: () => true,
			},
			{
				title: "Produtos",
				url: "/dashboard/commercial/products",
				icon: <Package className="w-4 h-4" />,
				items: null,
				checkAccess: () => true,
			},
		],
	},
	{
		group: "Turbine suas Vendas",
		items: [
			{
				title: "Metas",
				url: "/dashboard/team/goals",
				icon: <Goal className="w-4 h-4" />,
				items: null,
				checkAccess: () => true,
			},
			{
				title: "Campanhas de Vendas",
				url: "/dashboard/commercial/campaigns",
				icon: <Megaphone className="w-4 h-4" />,
				items: null,
				checkAccess: () => true,
			},
			{
				title: "Programas de Cashback",
				url: "/dashboard/commercial/cashback-programs",
				icon: <BadgePercent className="w-4 h-4" />,
				items: null,
				checkAccess: () => true,
			},
		],
	},

	{
		group: "Atendimentos",
		items: [
			{
				title: "Whatsapp Hub",
				url: "/dashboard/chats",
				icon: <MessageCircle className="w-4 h-4" />,
				items: null,
				checkAccess: (org) => org.configuracao.recursos.hubAtendimentos.acesso,
			},
		],
	},
];
function filterSidebarConfig(
	config: TSidebarConfigItemWithAccess[],
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"],
): TSidebarConfigItem[] {
	return config
		.map((group) => ({
			group: group.group,
			items: group.items
				.filter((item) => item.checkAccess(organization))
				.map(({ checkAccess, ...rest }) => rest),
		}))
		.filter((group) => group.items.length > 0);
}

export function AppSidebar({
	user,
	organization,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	user: TAuthUserSession["user"];
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"];
}) {
	const filteredConfig = filterSidebarConfig(SidebarConfig, organization);
	return (
		<Sidebar variant="inset" collapsible="icon" {...props}>
			<SidebarHeader>
				<AppSidebarHeader sessionUserOrg={organization} user={user} />
			</SidebarHeader>
			<SidebarContent>
				{filteredConfig.map((group) => (
					<AppSidebarContentGroup key={group.group} group={group} />
				))}
			</SidebarContent>
			<SidebarFooter>
				<AppSidebarFooter user={user} organization={organization} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
