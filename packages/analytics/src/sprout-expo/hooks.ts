import { useEffect, useRef } from "react";
// @ts-ignore -- expo-router is a peer dependency provided by the consuming app
import { usePathname } from "expo-router";
import { getSprout } from "./index.js";

/**
 * Screen-view autocapture for expo-router apps. Call once in the root
 * layout; every route change becomes a `screen` event.
 *
 *   export default function RootLayout() {
 *     useSproutScreenTracking();
 *     ...
 *   }
 */
export function useSproutScreenTracking(): void {
  const pathname: string | null = usePathname();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (pathname && pathname !== previous.current) {
      previous.current = pathname;
      void getSprout()?.screen(pathname);
    }
  }, [pathname]);
}
