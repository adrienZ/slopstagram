import { useNavigate } from "@tanstack/react-router";

export function useStorySearchParam() {
  const navigate = useNavigate();
  return (mediaPk?: string) => {
    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, story: mediaPk }),
      replace: true,
      resetScroll: false,
    });
  };
}
