import * as React from "react"

const MOBILE_BREAKPOINT = 768

function suscribir(cb: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", cb)
  return () => mql.removeEventListener("change", cb)
}

export function useIsMobile() {
  return React.useSyncExternalStore(suscribir, () => window.innerWidth < MOBILE_BREAKPOINT, () => false)
}
