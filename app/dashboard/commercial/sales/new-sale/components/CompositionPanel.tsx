import GroupsBlock from "./composition/GroupsBlock";
import SearchBlock from "./composition/SearchBlock";

type CompositionPanelProps = {
	groups: string[];
	selectedGroup: string | null;
	onGroupSelect: (group: string | null) => void;
	searchValue: string;
	onSearchChange: (value: string) => void;
	isLoading?: boolean;
};

export default function CompositionPanel({ groups, selectedGroup, onGroupSelect, searchValue, onSearchChange, isLoading }: CompositionPanelProps) {
	return (
		<div className="flex flex-col gap-4 h-full">
			<SearchBlock searchValue={searchValue} onSearchChange={onSearchChange} isLoading={isLoading} />
			<GroupsBlock groups={groups} selectedGroup={selectedGroup} onGroupSelect={onGroupSelect} isLoading={isLoading} />
		</div>
	);
}
