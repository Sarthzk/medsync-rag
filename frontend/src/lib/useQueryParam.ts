import { useSyncExternalStore } from "react";

/** Reads a URL query parameter on the client only (null during SSR), without needing Suspense. */
export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get(name),
    () => null
  );
}
