export interface WorkstationShortcutHandlers {
  onNavigate?: (route: string) => void;
  onPrint?: () => void;
  onToggleSidebar?: () => void;
}

export function useWorkstationShortcuts(_handlers: WorkstationShortcutHandlers) {
  // No-op on native platforms
}
