export interface WorkstationShortcutHandlers {
  onNavigate?: (route: string) => void;
  onPrint?: () => void;
  onToggleSidebar?: () => void;
  onOpenSearch?: () => void;
}

export const ROUTE_MAP: Record<string, string> = {
  '1': 'Dashboard',
  '2': 'Patients',
  '3': 'Consultations',
  '4': 'Appointments',
  '5': 'Billing',
  '6': 'Yakap',
  '7': 'Settings',
};

export const WORKSTATION_ROUTE_MAP = ROUTE_MAP;

export function handleWorkstationKeyDown(
  _event: any,
  _handlers: WorkstationShortcutHandlers,
): boolean {
  return false;
}

export function useWorkstationShortcuts(_handlers: WorkstationShortcutHandlers) {
  // No-op on native platforms
}
