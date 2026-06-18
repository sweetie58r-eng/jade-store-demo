export interface CarvingEstimateBreakdown {
  carvingId: string;
  shapeId: string;
  displayName: string;
  basePrice: number;
  occupiedArea: number;
  sizeCoefficient: number;
  materialQualityCoefficient: number;
  colorValueCoefficient: number;
  concentrationCoefficient: number;
  themeColorCoefficient: number;
  crackPenaltyCoefficient: number;
  finalEstimate: number;
  colorCoverage: Record<string, number>;
  averageConcentration: number;
  highValueColorUtilization: number;
  shallowCrackCoverage: number;
  isValidForSale: boolean;
  reasons: string[];
}

export interface LayoutSettlementResult {
  jadeCost: number;
  currentMarketValue: number;
  currentProfit: number;
  totalEstimate: number;
  yieldRate: number;
  highValueColorUtilization: number;
  placedCount: number;
  validCount: number;
  invalidCount: number;
  itemEstimates: CarvingEstimateBreakdown[];
}
