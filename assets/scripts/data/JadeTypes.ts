export interface Vec2Data {
  x: number;
  y: number;
}

export interface ColorRegionData {
  id: string;
  colorId: string;
  center: Vec2Data;
  radiusX: number;
  radiusY: number;
  rotation: number;
  concentrationPeak: number;
  valueMultiplier: number;
  displayColor: string;
}

export type CrackType = 'shallow' | 'deep';

export interface CrackData {
  id: string;
  type: CrackType;
  points: Vec2Data[];
  width: number;
  severity: number;
  displayColor: string;
  displayAlpha: number;
}

export interface SamplePointData {
  x: number;
  y: number;
  colorRegionId?: string;
  colorId?: string;
  concentration: number;
}

export interface RevealMaskPointData {
  x: number;
  y: number;
  colorRegionId?: string;
  colorId?: string;
  concentration: number;
}

export interface JadePieceData {
  id: string;
  seed: number;
  sizeGradeId: string;
  qualityProfileId: string;
  qualityProfileDisplayName: string;
  materialQualityId: string;
  materialQualityDisplayName: string;
  materialQualityFactor: number;
  crackProfileId: string;
  crackProfileDisplayName: string;
  colorRichness: number;
  roughPriceMultiplier: number;
  outlinePolygon: Vec2Data[];
  area: number;
  colorRegions: ColorRegionData[];
  cracks: CrackData[];
  sampleGrid: SamplePointData[];
  sampleCellSize: number;
}
