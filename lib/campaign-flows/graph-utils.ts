import type { DBTransaction } from "@/services/drizzle";
import type { TCampaignFlowEdgeEntity, TCampaignFlowNodeEntity } from "@/services/drizzle/schema";
import { campaignFlowEdges, campaignFlowNodes } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// TYPES
// ============================================================================

export type FlowGraph = {
	nodes: TCampaignFlowNodeEntity[];
	edges: TCampaignFlowEdgeEntity[];
	getNode: (nodeId: string) => TCampaignFlowNodeEntity | undefined;
	getEntryNode: () => TCampaignFlowNodeEntity | undefined;
	getOutgoingEdges: (nodeId: string) => TCampaignFlowEdgeEntity[];
};

export type NodeResult = {
	sucesso: boolean;
	pulado?: boolean;
	condicaoResultado?: boolean;
	dados?: Record<string, unknown>;
	erro?: string;
};

// ============================================================================
// GRAPH LOADING
// ============================================================================

/**
 * Loads the full graph (nodes + edges) for a campaign flow.
 */
export async function loadFlowGraph({
	tx,
	campanhaId,
}: {
	tx: DBTransaction;
	campanhaId: string;
}): Promise<FlowGraph> {
	const [nodes, edges] = await Promise.all([
		tx.select().from(campaignFlowNodes).where(eq(campaignFlowNodes.campanhaId, campanhaId)),
		tx.select().from(campaignFlowEdges).where(eq(campaignFlowEdges.campanhaId, campanhaId)),
	]);

	return createGraph(nodes, edges);
}

function createGraph(nodes: TCampaignFlowNodeEntity[], edges: TCampaignFlowEdgeEntity[]): FlowGraph {
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));
	const outgoingEdgeMap = new Map<string, TCampaignFlowEdgeEntity[]>();

	for (const edge of edges) {
		const existing = outgoingEdgeMap.get(edge.noOrigemId) ?? [];
		existing.push(edge);
		outgoingEdgeMap.set(edge.noOrigemId, existing);
	}

	// Sort outgoing edges by `ordem` for deterministic traversal
	for (const [, edgeList] of outgoingEdgeMap) {
		edgeList.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
	}

	return {
		nodes,
		edges,
		getNode: (nodeId: string) => nodeMap.get(nodeId),
		getEntryNode: () => nodes.find((n) => n.tipo === "GATILHO"),
		getOutgoingEdges: (nodeId: string) => outgoingEdgeMap.get(nodeId) ?? [],
	};
}

// ============================================================================
// GRAPH TRAVERSAL
// ============================================================================

/**
 * Determines the next node to visit based on the current node's outgoing edges
 * and the result of the current node's processing.
 */
export function getNextNodeId(graph: FlowGraph, currentNodeId: string, result: NodeResult): string | null {
	const edges = graph.getOutgoingEdges(currentNodeId);

	if (edges.length === 0) return null;
	if (edges.length === 1) return edges[0].noDestinoId;

	// Branching: condition node with SIM/NAO edges
	if (result.condicaoResultado === true) {
		return edges.find((e) => e.condicaoLabel === "SIM")?.noDestinoId ?? null;
	}
	return edges.find((e) => e.condicaoLabel === "NAO")?.noDestinoId ?? null;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates a flow graph structure. Returns errors if any.
 */
export function validateFlowGraph(graph: FlowGraph): string[] {
	const errors: string[] = [];

	// Must have exactly one GATILHO node
	const triggerNodes = graph.nodes.filter((n) => n.tipo === "GATILHO");
	if (triggerNodes.length === 0) {
		errors.push("O fluxo deve ter pelo menos um nó gatilho.");
	} else if (triggerNodes.length > 1) {
		errors.push("O fluxo deve ter exatamente um nó gatilho.");
	}

	// GATILHO must have exactly one outgoing edge
	if (triggerNodes.length === 1) {
		const triggerEdges = graph.getOutgoingEdges(triggerNodes[0].id);
		if (triggerEdges.length !== 1) {
			errors.push("O nó gatilho deve ter exatamente uma saída.");
		}
	}

	// CONDICAO nodes must have exactly 2 outgoing edges (SIM and NAO)
	const conditionNodes = graph.nodes.filter((n) => n.tipo === "CONDICAO");
	for (const condNode of conditionNodes) {
		const condEdges = graph.getOutgoingEdges(condNode.id);
		if (condEdges.length !== 2) {
			errors.push(`Nó condição "${condNode.rotulo ?? condNode.id}" deve ter exatamente duas saídas (SIM e NÃO).`);
			continue;
		}
		const labels = condEdges.map((e) => e.condicaoLabel).sort();
		if (!labels.includes("NAO") || !labels.includes("SIM")) {
			errors.push(`Nó condição "${condNode.rotulo ?? condNode.id}" deve ter saídas "SIM" e "NAO".`);
		}
	}

	// Check for orphan nodes (no incoming edges and not the trigger)
	const nodesWithIncoming = new Set(graph.edges.map((e) => e.noDestinoId));
	for (const node of graph.nodes) {
		if (node.tipo === "GATILHO") continue;
		if (!nodesWithIncoming.has(node.id)) {
			errors.push(`Nó "${node.rotulo ?? node.id}" não está conectado ao fluxo.`);
		}
	}

	return errors;
}
