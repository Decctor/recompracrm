import { resolveConversationsAccess } from "../access";
import ConversationsBoardPage from "./board-page";

export default async function ConversationsBoard() {
	const access = await resolveConversationsAccess();
	if (access.denied) return access.denied;

	return <ConversationsBoardPage organizationId={access.membership.organizacao.id} />;
}
