import { getAttendancePermissions, getQuotePermissions, resolveConversationsAccess } from "./access";
import ConversationsInboxPage from "./inbox-page";

export default async function ConversationsInbox() {
	const access = await resolveConversationsAccess();
	if (access.denied) return access.denied;

	return (
		<ConversationsInboxPage
			user={access.user}
			organizationId={access.membership.organizacao.id}
			attendancePermissions={getAttendancePermissions(access.membership)}
			quotePermissions={getQuotePermissions(access.membership)}
		/>
	);
}
