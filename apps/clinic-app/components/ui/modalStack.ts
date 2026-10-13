import React, { useState, useEffect, useRef } from 'react';

export const BASE_MODAL_Z_INDEX = 10000;
export const MODAL_Z_INDEX_STEP = 100;

export interface ModalStackItem {
  id: string;
  depth: number;
  zIndex: number;
  element?: any;
  onClose?: () => void;
}

let modalIdCounter = 0;
export function generateModalId(prefix = 'modal'): string {
  modalIdCounter += 1;
  return `${prefix}-${modalIdCounter}-${Date.now().toString(36)}`;
}

let activeModalStack: ModalStackItem[] = [];
const stackListeners = new Set<() => void>();

function notifyListeners(): void {
  stackListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

/**
 * Locate the portal root container that is a direct child of document.body.
 * In react-native-web, ModalPortal appends a `div` directly to document.body.
 */
export function findPortalContainer(node: any): any {
  if (!node || typeof document === 'undefined') return null;
  let curr = node;
  while (curr && curr.parentNode && curr.parentNode !== document.body) {
    curr = curr.parentNode;
  }
  return curr && curr.parentNode === document.body ? curr : null;
}

/**
 * Ensures the modal portal DOM node is moved to the end of document.body
 * and receives the assigned zIndex so it renders cleanly above prior modals.
 */
export function bringPortalToFront(portalEl: any, zIndex: number): void {
  if (!portalEl || typeof document === 'undefined' || !document.body) return;
  try {
    portalEl.style.position = 'relative';
    portalEl.style.zIndex = String(zIndex);

    // Also set zIndex on inner animation/modal-content elements if present
    const modalContent =
      portalEl.querySelector?.('[aria-modal="true"]') ||
      portalEl.firstElementChild;
    if (modalContent && modalContent.style) {
      modalContent.style.zIndex = String(zIndex);
    }

    // Re-append to document.body to ensure DOM order paints it on top
    if (document.body.lastElementChild !== portalEl) {
      document.body.appendChild(portalEl);
    }
  } catch {}
}

/**
 * Registers a modal as active in the stack. If already registered, it is
 * promoted to the topmost layer.
 */
export function registerModal(
  id: string,
  options?: {
    element?: any;
    onClose?: () => void;
    zIndexOverride?: number;
  }
): ModalStackItem {
  // If already in stack, remove prior entry so it can be re-added to top
  const existingIdx = activeModalStack.findIndex((m) => m.id === id);
  let priorElement = options?.element;
  if (existingIdx !== -1) {
    priorElement = priorElement || activeModalStack[existingIdx].element;
    activeModalStack.splice(existingIdx, 1);
  }

  const depth = activeModalStack.length;
  const zIndex =
    options?.zIndexOverride ?? (BASE_MODAL_Z_INDEX + depth * MODAL_Z_INDEX_STEP);

  const item: ModalStackItem = {
    id,
    depth,
    zIndex,
    element: priorElement,
    onClose: options?.onClose,
  };

  activeModalStack.push(item);

  if (item.element) {
    bringPortalToFront(item.element, zIndex);
  }

  notifyListeners();
  return item;
}

/**
 * Unregisters a modal from the active stack and re-synchronizes the remaining stack.
 */
export function unregisterModal(id: string): void {
  const idx = activeModalStack.findIndex((m) => m.id === id);
  if (idx === -1) return;

  activeModalStack.splice(idx, 1);

  // Recalculate depth and zIndex for remaining modals
  activeModalStack.forEach((item, index) => {
    item.depth = index;
    item.zIndex = BASE_MODAL_Z_INDEX + index * MODAL_Z_INDEX_STEP;
    if (item.element) {
      bringPortalToFront(item.element, item.zIndex);
    }
  });

  notifyListeners();
}

/**
 * Brings an existing active modal to the front of the stack.
 */
export function bringModalToFront(id: string): void {
  const idx = activeModalStack.findIndex((m) => m.id === id);
  if (idx === -1 || idx === activeModalStack.length - 1) return;

  const [item] = activeModalStack.splice(idx, 1);
  activeModalStack.push(item);

  activeModalStack.forEach((m, index) => {
    m.depth = index;
    m.zIndex = BASE_MODAL_Z_INDEX + index * MODAL_Z_INDEX_STEP;
    if (m.element) {
      bringPortalToFront(m.element, m.zIndex);
    }
  });

  notifyListeners();
}

export function getModalStack(): readonly ModalStackItem[] {
  return activeModalStack;
}

export function getModalStackDepth(id: string): number {
  return activeModalStack.findIndex((m) => m.id === id);
}

export function getModalZIndex(id: string, defaultBase = BASE_MODAL_Z_INDEX): number {
  const item = activeModalStack.find((m) => m.id === id);
  if (item) return item.zIndex;
  return defaultBase + activeModalStack.length * MODAL_Z_INDEX_STEP;
}

export function isTopModal(id: string): boolean {
  if (activeModalStack.length === 0) return false;
  return activeModalStack[activeModalStack.length - 1].id === id;
}

export function getTopModal(): ModalStackItem | undefined {
  if (activeModalStack.length === 0) return undefined;
  return activeModalStack[activeModalStack.length - 1];
}

export function getActiveModalCount(): number {
  return activeModalStack.length;
}

export function clearModalStack(): void {
  activeModalStack = [];
  notifyListeners();
}

export function subscribeModalStack(listener: () => void): () => void {
  stackListeners.add(listener);
  return () => {
    stackListeners.delete(listener);
  };
}

/**
 * React Context providing parent modal metadata down the tree.
 */
export interface ModalStackContextValue {
  parentDepth: number;
  parentModalId?: string;
}

export const ModalStackContext = React.createContext<ModalStackContextValue>({
  parentDepth: -1,
});

/**
 * React hook to register and track a modal's lifecycle within the global stack.
 */
export function useModalStack(
  visible: boolean,
  options?: {
    id?: string;
    onClose?: () => void;
    zIndex?: number;
    elementRef?: React.RefObject<any>;
  }
): {
  modalId: string;
  depth: number;
  zIndex: number;
  isTop: boolean;
  stackCount: number;
} {
  const stableIdRef = useRef<string | null>(null);
  if (!stableIdRef.current) {
    stableIdRef.current = options?.id || generateModalId();
  }
  const modalId = stableIdRef.current;

  const [state, setState] = useState(() => {
    const d = getModalStackDepth(modalId);
    return {
      depth: d >= 0 ? d : (visible ? activeModalStack.length : 0),
      zIndex: options?.zIndex ?? (d >= 0 ? getModalZIndex(modalId) : BASE_MODAL_Z_INDEX + (visible ? activeModalStack.length : 0) * MODAL_Z_INDEX_STEP),
      isTop: isTopModal(modalId),
      stackCount: activeModalStack.length,
    };
  });

  useEffect(() => {
    if (visible) {
      let domNode: any = null;
      if (options?.elementRef?.current) {
        domNode =
          (options.elementRef.current as any).node ||
          options.elementRef.current;
      }
      const portalEl = findPortalContainer(domNode);

      const item = registerModal(modalId, {
        element: portalEl,
        onClose: options?.onClose,
        zIndexOverride: options?.zIndex,
      });

      setState({
        depth: item.depth,
        zIndex: item.zIndex,
        isTop: true,
        stackCount: activeModalStack.length,
      });
    } else {
      unregisterModal(modalId);
      setState({
        depth: 0,
        zIndex: options?.zIndex ?? BASE_MODAL_Z_INDEX,
        isTop: false,
        stackCount: activeModalStack.length,
      });
    }

    const unsubscribe = subscribeModalStack(() => {
      const d = getModalStackDepth(modalId);
      if (d !== -1) {
        setState({
          depth: d,
          zIndex: options?.zIndex ?? getModalZIndex(modalId),
          isTop: isTopModal(modalId),
          stackCount: activeModalStack.length,
        });
      } else {
        setState((prev) => ({
          ...prev,
          stackCount: activeModalStack.length,
          isTop: false,
        }));
      }
    });

    return () => {
      unregisterModal(modalId);
      unsubscribe();
    };
  }, [visible, modalId, options?.zIndex]);

  return {
    modalId,
    depth: state.depth,
    zIndex: state.zIndex,
    isTop: state.isTop,
    stackCount: state.stackCount,
  };
}

/**
 * Global Web DOM MutationObserver for react-native-web modals.
 * Automatically catches any [aria-modal="true"] dialogs rendered via RNModal
 * and ensures newly mounted/opened modals are layered above existing modals.
 */
let observerInitialized = false;
let globalObserver: any = null;

export function initModalStackObserver(): () => void {
  if (
    observerInitialized ||
    typeof document === 'undefined' ||
    typeof MutationObserver === 'undefined'
  ) {
    return () => {};
  }
  observerInitialized = true;

  const handleDomMutations = () => {
    if (!document.body) return;

    // Scan for all active modal portals in document.body
    const ariaModalElements = Array.from(
      document.querySelectorAll('[aria-modal="true"]')
    );
    if (ariaModalElements.length === 0) return;

    ariaModalElements.forEach((ariaEl) => {
      const portal = findPortalContainer(ariaEl);
      if (!portal) return;

      const registered = activeModalStack.find((m) => m.element === portal);
      if (!registered) {
        // Tag and register in active stack
        const generatedId =
          portal.dataset.clinicezModalId || generateModalId('rnw-modal');
        portal.dataset.clinicezModalId = generatedId;
        registerModal(generatedId, { element: portal });
      } else {
        // Ensure portal DOM element is correctly positioned and styled
        bringPortalToFront(portal, registered.zIndex);
      }
    });

    // Cleanup portals that were unmounted from document.body
    const currentPortals = new Set(
      Array.from(document.body.children).filter((el) =>
        el.querySelector?.('[aria-modal="true"]')
      )
    );

    const staleItems = activeModalStack.filter(
      (item) => item.element && !currentPortals.has(item.element)
    );
    staleItems.forEach((stale) => unregisterModal(stale.id));
  };

  globalObserver = new MutationObserver(handleDomMutations);
  try {
    globalObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  } catch {}

  // Run once immediately
  handleDomMutations();

  return () => {
    if (globalObserver) {
      globalObserver.disconnect();
      globalObserver = null;
    }
    observerInitialized = false;
  };
}

// Auto-initialize in web browser environments
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initModalStackObserver();
}
