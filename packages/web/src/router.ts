import { useSyncExternalStore } from "react";

export interface Route { path: string; query: URLSearchParams }

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const snapshot = () => window.location.hash;

export function parseHash(hash: string): Route {
  const [p = "", q = ""] = hash.replace(/^#/, "").split("?");
  return { path: "/" + p.replace(/^\/+|\/+$/g, ""), query: new URLSearchParams(q) };
}

/** Hash routing in ~10 lines: no router library for a local app with a handful of routes. */
export function useRoute(): Route {
  return parseHash(useSyncExternalStore(subscribe, snapshot));
}

export const go = (to: string) => { window.location.hash = to; };
