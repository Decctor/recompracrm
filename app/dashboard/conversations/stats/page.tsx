import { getAttendancePermissions, resolveConversationsAccess } from "../access";
import ConversationsStatsPage from "./stats-page";

export default async function ConversationsStats() {
	const access = await resolveConversationsAccess();
	if (access.denied) return access.denied;

	return <ConversationsStatsPage canManageAttendances={getAttendancePermissions(access.membership).canManage} />;
}
