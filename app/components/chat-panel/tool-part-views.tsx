import { MapPinIcon, MapPinnedIcon, SearchIcon, UserSearchIcon, UsersIcon } from "lucide-react";
import { AccountList } from "./account-list.tsx";
import { FeedUserSummariesDetails } from "./feed-user-summaries-details.tsx";
import { TaggedPlaceDetails, TaggedPlaceList } from "./tagged-places-details.tsx";
import { ToolTrace, type AssistantPart } from "./tool-trace.tsx";

type FeedUserSummariesPart = Extract<AssistantPart, { type: "tool-getFeedUserSummaries" }>;
type ListAccountsPart = Extract<AssistantPart, { type: "tool-listAccounts" }>;
type SearchAccountsPart = Extract<AssistantPart, { type: "tool-searchAccounts" }>;
type ListTaggedPlacesPart = Extract<AssistantPart, { type: "tool-listTaggedPlaces" }>;
type SearchTaggedPlacesPart = Extract<AssistantPart, { type: "tool-searchTaggedPlaces" }>;
type GetTaggedPlacePart = Extract<AssistantPart, { type: "tool-getTaggedPlace" }>;

/** The Assistant writes the answer from the summaries: the chat traces the read and keeps it. */
export function FeedUserSummariesPartView({ part }: { part: FeedUserSummariesPart }) {
  return (
    <ToolTrace icon={<UserSearchIcon />} part={part}>
      {part.state === "output-available" && <FeedUserSummariesDetails results={part.output} />}
    </ToolTrace>
  );
}

/** The Assistant writes the list from the accounts: the chat traces the read and keeps it. */
export function ListAccountsPartView({ part }: { part: ListAccountsPart }) {
  return (
    <ToolTrace icon={<UsersIcon />} part={part}>
      {part.state === "output-available" && <AccountList listed={part.output.accounts} />}
    </ToolTrace>
  );
}

/** The Assistant writes the answer from the matches: the chat traces the search and keeps it. */
export function SearchAccountsPartView({ part }: { part: SearchAccountsPart }) {
  return (
    <ToolTrace icon={<SearchIcon />} part={part}>
      {part.state === "output-available" && (
        <AccountList
          emptyLabel="Aucun compte trouvé."
          label="Comptes trouvés"
          listed={part.output.accounts}
        />
      )}
    </ToolTrace>
  );
}

/** The Assistant writes the list from the places: the chat traces the read and keeps it. */
export function ListTaggedPlacesPartView({ part }: { part: ListTaggedPlacesPart }) {
  return (
    <ToolTrace icon={<MapPinnedIcon />} part={part}>
      {part.state === "output-available" && (
        <TaggedPlaceList places={part.output.places} total={part.output.total} />
      )}
    </ToolTrace>
  );
}

/** The Assistant writes the answer from the matches: the chat traces the search and keeps it. */
export function SearchTaggedPlacesPartView({ part }: { part: SearchTaggedPlacesPart }) {
  return (
    <ToolTrace icon={<SearchIcon />} part={part}>
      {part.state === "output-available" && (
        <TaggedPlaceList
          emptyLabel="Aucun lieu trouvé."
          label="Lieux trouvés"
          places={part.output.places}
          total={part.output.total}
        />
      )}
    </ToolTrace>
  );
}

/** The Assistant writes the answer from the place: the chat traces the read and keeps it. */
export function GetTaggedPlacePartView({ part }: { part: GetTaggedPlacePart }) {
  return (
    <ToolTrace icon={<MapPinIcon />} part={part}>
      {part.state === "output-available" && <TaggedPlaceDetails read={part.output} />}
    </ToolTrace>
  );
}
