import { Outlet } from '@tanstack/react-router'

/**
 * Simplified layout for Exoplanet Explorer — full-screen, no sidebar chrome.
 * The Explorer page manages its own sidebar and layout internally.
 */
export function AuthenticatedLayout() {
  return <Outlet />
}
