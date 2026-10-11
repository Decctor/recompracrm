"use client";

import { createRealtimeChannel, supabaseClient } from "@/services/supabase";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

type RealtimeFilter = {
	column: string;
	value: string;
};

type UseSupabaseRealtimeOptions<T> = {
	table: string;
	schema?: string;
	event?: RealtimeEvent;
	filter?: RealtimeFilter;
	enabled?: boolean;
	onInsert?: (payload: T) => void;
	onUpdate?: (payload: { old: T; new: T }) => void;
	onDelete?: (payload: T) => void;
	invalidateQueries?: QueryKey[];
};

/**
 * Hook to subscribe to Supabase Realtime changes on a table
 *
 * @example
 * // Subscribe to all changes on chats table
 * useSupabaseRealtime({
 *   table: 'chats',
 *   filter: { column: 'whatsapp_conexao_telefone_id', value: phoneId },
 *   invalidateQueries: [['chats']],
 * });
 *
 * @example
 * // Subscribe to new messages in a specific chat
 * useSupabaseRealtime({
 *   table: 'chat_messages',
 *   filter: { column: 'chat_id', value: chatId },
 *   onInsert: (message) => console.log('New message:', message),
 * });
 */
export function useSupabaseRealtime<T extends Record<string, unknown>>({
	table,
	schema = "public",
	event = "*",
	filter,
	enabled = true,
	onInsert,
	onUpdate,
	onDelete,
	invalidateQueries,
}: UseSupabaseRealtimeOptions<T>) {
	const queryClient = useQueryClient();
	const channelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null);

	// Use refs to store the latest callbacks and queries to avoid recreating the subscription
	const handlersRef = useRef({ onInsert, onUpdate, onDelete, invalidateQueries, queryClient });

	// Update refs when callbacks change
	useEffect(() => {
		handlersRef.current = { onInsert, onUpdate, onDelete, invalidateQueries, queryClient };
	}, [onInsert, onUpdate, onDelete, invalidateQueries, queryClient]);

	// Create a stable handleChange function that doesn't change between renders
	const handleChangeRef = useRef<((payload: RealtimePostgresChangesPayload<T>) => void) | null>(null);

	if (!handleChangeRef.current) {
		handleChangeRef.current = (payload: RealtimePostgresChangesPayload<T>) => {
			const { onInsert, onUpdate, onDelete, invalidateQueries, queryClient } = handlersRef.current;

			// DEBUG: Log incoming events
			console.log("[REALTIME] Event received:", {
				eventType: payload.eventType,
				table: payload.table,
				new: payload.new,
				old: payload.old,
			});

			// Call specific handlers
			switch (payload.eventType) {
				case "INSERT":
					console.log("[REALTIME] Calling onInsert handler");
					onInsert?.(payload.new as T);
					break;
				case "UPDATE":
					console.log("[REALTIME] Calling onUpdate handler");
					onUpdate?.({ old: payload.old as T, new: payload.new as T });
					break;
				case "DELETE":
					console.log("[REALTIME] Calling onDelete handler");
					onDelete?.(payload.old as T);
					break;
			}

			// Invalidate queries
			if (invalidateQueries) {
				console.log("[REALTIME] Invalidating queries:", invalidateQueries);
				for (const queryKey of invalidateQueries) {
					queryClient.invalidateQueries({ queryKey });
				}
			}
		};
	}

	// Memoize filter values to create stable dependencies
	// Use primitive values for comparison to avoid unnecessary recalculations
	const filterColumn = filter?.column;
	const filterValue = filter?.value;
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const channelName = useMemo(() => (filter ? `${table}_${filter.column}_${filter.value}` : table), [table, filterColumn, filterValue]);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const filterString = useMemo(() => (filter ? `${filter.column}=eq.${filter.value}` : undefined), [filterColumn, filterValue]);

	useEffect(() => {
		if (!enabled) {
			// Cleanup if disabled
			if (channelRef.current) {
				supabaseClient.removeChannel(channelRef.current);
				channelRef.current = null;
			}
			return;
		}

		// Create subscription
		if (!handleChangeRef.current) {
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// Nome único por inscrição: ver `createRealtimeChannel`.
		const channel = (createRealtimeChannel(channelName).on as any)(
			"postgres_changes",
			{
				event,
				schema,
				table,
				filter: filterString,
			},
			handleChangeRef.current,
		);

		channel.subscribe((status: string) => {
			// Only log errors or important status changes
			if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
				console.log("[REALTIME] Subscription status:", status, channelName);
			}
		});

		channelRef.current = channel;

		// Cleanup
		return () => {
			if (channelRef.current) {
				supabaseClient.removeChannel(channelRef.current);
				channelRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [table, schema, event, filterColumn, filterValue, enabled, channelName, filterString]);

	return {
		unsubscribe: () => {
			if (channelRef.current) {
				supabaseClient.removeChannel(channelRef.current);
				channelRef.current = null;
			}
		},
	};
}

/**
 * Hook to subscribe to chat list updates
 */
export function useChatsRealtime({ whatsappPhoneId, enabled = true }: { whatsappPhoneId: string | null; enabled?: boolean }) {
	// Memoize filter and invalidateQueries to prevent unnecessary re-subscriptions
	const filter = useMemo(() => (whatsappPhoneId ? { column: "whatsapp_conexao_telefone_id", value: whatsappPhoneId } : undefined), [whatsappPhoneId]);
	const invalidateQueries = useMemo(() => [["chats"]], []);

	return useSupabaseRealtime({
		table: "ampmais_chats",
		filter,
		enabled: enabled && !!whatsappPhoneId,
		invalidateQueries,
	});
}

/**
 * Hook to subscribe to messages in a specific chat
 */
export function useChatMessagesRealtime({
	chatId,
	enabled = true,
	onNewMessage,
}: {
	chatId: string | null;
	enabled?: boolean;
	onNewMessage?: (message: Record<string, unknown>) => void;
}) {
	// Memoize filter and invalidateQueries to prevent unnecessary re-subscriptions
	const filter = useMemo(() => (chatId ? { column: "chat_id", value: chatId } : undefined), [chatId]);
	const invalidateQueries = useMemo(() => [["chat-messages", chatId ?? ""]], [chatId]);

	return useSupabaseRealtime({
		table: "ampmais_chat_messages",
		filter,
		enabled: enabled && !!chatId,
		invalidateQueries,
		onInsert: onNewMessage,
	});
}

/**
 * Hook to subscribe to point-of-interaction transaction requests updates
 */
export function usePoiTransactionRequestsRealtime({
	orgId,
	enabled = true,
	queryKey,
}: {
	orgId: string | null;
	enabled?: boolean;
	queryKey: QueryKey;
}) {
	const filter = useMemo(() => (orgId ? { column: "organizacao_id", value: orgId } : undefined), [orgId]);
	const invalidateQueries = useMemo(() => [queryKey], [queryKey]);

	return useSupabaseRealtime({
		table: "ampmais_poi_transaction_requests",
		filter,
		enabled: enabled && !!orgId,
		invalidateQueries,
	});
}

/**
 * Hook to subscribe to action approval requests updates (fila de aprovações e o PDV solicitante
 * aguardando a decisão de uma solicitação remota).
 */
export function useActionApprovalsRealtime({ orgId, enabled = true, queryKey }: { orgId: string | null; enabled?: boolean; queryKey: QueryKey }) {
	const filter = useMemo(() => (orgId ? { column: "organizacao_id", value: orgId } : undefined), [orgId]);
	const invalidateQueries = useMemo(() => [queryKey], [queryKey]);

	return useSupabaseRealtime({
		table: "ampmais_action_approval_requests",
		filter,
		enabled: enabled && !!orgId,
		invalidateQueries,
	});
}
