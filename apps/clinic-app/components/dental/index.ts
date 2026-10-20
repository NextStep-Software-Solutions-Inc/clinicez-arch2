export { ToothSurfaceDiagram, default as default } from './ToothSurfaceDiagram';
export type { ToothSurfaceDiagramProps, ToothConditionItem } from './ToothSurfaceDiagram';

export {
  ADULT_UPPER_RIGHT,
  ADULT_UPPER_LEFT,
  ADULT_LOWER_RIGHT,
  ADULT_LOWER_LEFT,
  CHILD_UPPER_RIGHT,
  CHILD_UPPER_LEFT,
  CHILD_LOWER_RIGHT,
  CHILD_LOWER_LEFT,
  CANONICAL_SURFACES,
  TOOTH_STATUS_OPTIONS,
  sortToothSurfaces,
  subtractToothSurfaces,
  getToothDescription,
  isRightQuadrant,
  getSurfacesForQuadrant,
  normalizeTeethToMultiRecord,
  resolveToothEffectiveState,
  canApplyConditionToTooth,
  applyStagedConditionToTooth,
  getDominantToothStatus,
  getConditionDotColor,
  getSurfaceZoneColor,
  calculateDmftMetrics,
} from './dentalUtils';

export type {
  ToothStatus,
  ToothSurfaceCode,
  DentalToothRecord,
  EffectiveToothState,
  DmftCalculationResult,
} from './dentalUtils';
