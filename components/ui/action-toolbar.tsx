"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import * as React from "react";

import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";

import { Button, type ButtonProps } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

type ActionToolbarIconProps = {
	icon?: LucideIcon;
};

type ActionToolbarPrimaryProps = ButtonProps &
	ActionToolbarIconProps & {
		children: React.ReactNode;
	};

type ActionToolbarActionProps = ButtonProps &
	ActionToolbarIconProps & {
		children: React.ReactNode;
	};

function renderIcon(Icon: LucideIcon | undefined) {
	if (!Icon) return null;
	return <Icon className="h-4 w-4 min-h-4 min-w-4" />;
}

function mergeAsChildButton({
	icon: Icon,
	children,
	className,
}: {
	icon?: LucideIcon;
	children: React.ReactElement<{ children?: React.ReactNode; className?: string }>;
	className?: string;
}) {
	return React.cloneElement(children, {
		className: cn("flex items-center gap-2", className, children.props.className),
		children: (
			<>
				{renderIcon(Icon)}
				{children.props.children}
			</>
		),
	});
}

function ActionToolbarPrimary({ icon: Icon, children, className, size = "sm", variant = "default", asChild, ...props }: ActionToolbarPrimaryProps) {
	if (asChild && React.isValidElement(children)) {
		return (
			<Button variant={variant} size={size} className={cn("flex items-center gap-2", className)} asChild {...props}>
				{mergeAsChildButton({
					icon: Icon,
					children: children as React.ReactElement<{ children?: React.ReactNode; className?: string }>,
				})}
			</Button>
		);
	}

	return (
		<Button variant={variant} size={size} className={cn("flex items-center gap-2", className)} {...props}>
			{renderIcon(Icon)}
			{children}
		</Button>
	);
}
ActionToolbarPrimary.displayName = "ActionToolbarPrimary";

function ActionToolbarAction({ icon: Icon, children, className, size = "sm", variant = "ghost", asChild, ...props }: ActionToolbarActionProps) {
	if (asChild && React.isValidElement(children)) {
		return (
			<Button variant={variant} size={size} className={cn("flex items-center gap-2", className)} asChild {...props}>
				{mergeAsChildButton({
					icon: Icon,
					children: children as React.ReactElement<{ children?: React.ReactNode; className?: string }>,
				})}
			</Button>
		);
	}

	return (
		<Button variant={variant} size={size} className={cn("flex items-center gap-2", className)} {...props}>
			{renderIcon(Icon)}
			{children}
		</Button>
	);
}
ActionToolbarAction.displayName = "ActionToolbarAction";

function splitActionToolbarChildren(children: React.ReactNode) {
	const primary: React.ReactElement<ActionToolbarPrimaryProps>[] = [];
	const secondary: React.ReactElement<ActionToolbarActionProps>[] = [];
	const ordered: React.ReactElement[] = [];

	React.Children.forEach(children, (child) => {
		if (!React.isValidElement(child)) return;

		ordered.push(child);

		if (child.type === ActionToolbarPrimary) {
			primary.push(child as React.ReactElement<ActionToolbarPrimaryProps>);
			return;
		}

		if (child.type === ActionToolbarAction) {
			secondary.push(child as React.ReactElement<ActionToolbarActionProps>);
		}
	});

	return { primary, secondary, ordered };
}

function ActionToolbarOverflowItem({ icon: Icon, children, asChild, onClick }: ActionToolbarActionProps) {
	if (asChild && React.isValidElement(children)) {
		const child = children as React.ReactElement<{ children?: React.ReactNode; className?: string }>;
		return (
			<DropdownMenuItem
				render={React.cloneElement(child, {
					className: cn("flex cursor-pointer items-center gap-2", child.props.className),
					children: (
						<>
							{renderIcon(Icon)}
							{child.props.children}
						</>
					),
				})}
			/>
		);
	}

	return (
		<DropdownMenuItem onClick={onClick as React.MouseEventHandler<HTMLDivElement> | undefined} className="flex items-center gap-2">
			{renderIcon(Icon)}
			{children}
		</DropdownMenuItem>
	);
}

function ActionToolbarOverflowMenu({ actions }: { actions: React.ReactElement<ActionToolbarActionProps>[] }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" size="icon-sm" aria-label="Mais ações">
						<ChevronDown className="h-4 w-4" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				{actions.map((action, index) => (
					<ActionToolbarOverflowItem key={index} {...action.props} />
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function resolveSecondaryMobileRender({
	primary,
	secondary,
}: {
	primary: React.ReactElement<ActionToolbarPrimaryProps>[];
	secondary: React.ReactElement<ActionToolbarActionProps>[];
}) {
	if (secondary.length === 0) return null;
	if (primary.length === 0 && secondary.length === 1) return secondary;
	return <ActionToolbarOverflowMenu actions={secondary} />;
}

function ActionToolbarRoot({
	children,
	className,
	collapseSecondary = false,
}: {
	children: React.ReactNode;
	className?: string;
	collapseSecondary?: boolean;
}) {
	const isDesktop = useMediaQuery("(min-width: 1024px)");
	const { primary, secondary, ordered } = splitActionToolbarChildren(children);

	return (
		<div className={cn("flex shrink-0 items-center gap-2", className)} data-slot="action-toolbar">
			{isDesktop && !collapseSecondary ? (
				ordered
			) : (
				<>
					{primary}
					{collapseSecondary ? (
						secondary.length > 0 ? (
							<ActionToolbarOverflowMenu actions={secondary} />
						) : null
					) : (
						resolveSecondaryMobileRender({ primary, secondary })
					)}
				</>
			)}
		</div>
	);
}

export const ActionToolbar = Object.assign(ActionToolbarRoot, {
	Primary: ActionToolbarPrimary,
	Action: ActionToolbarAction,
});
