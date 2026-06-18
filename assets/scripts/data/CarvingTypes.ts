import { CarvingShapeConfig } from '../config/GameConfigTypes';
import { Vec2Data } from './JadeTypes';

export type CarvingValidationState = 'valid' | 'warning' | 'invalid';

export interface CarvingShapeGeometry {
  outerPolygon: Vec2Data[];
  innerPolygon?: Vec2Data[];
  localSamples: Vec2Data[];
  approximateArea: number;
}

export interface PlacedCarvingData {
  id: string;
  shape: CarvingShapeConfig;
  geometry: CarvingShapeGeometry;
  position: Vec2Data;
  rotation: number;
  scale: number;
  validationState: CarvingValidationState;
  validationReasons: string[];
}

export type CarvingEditMode = 'none' | 'drag' | 'rotate' | 'scale';
