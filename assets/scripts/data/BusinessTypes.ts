import { PlacedCarvingData } from './CarvingTypes';
import { JadePieceData } from './JadeTypes';

export interface MarketStoneData {
  id: string;
  jade: JadePieceData;
  previewJade: JadePieceData;
  price: number;
  sizeGradeId: string;
  isPurchased: boolean;
}

export interface EstimatedProductData {
  carvingId: string;
  styleId: string;
  displayName: string;
  estimatedPrice: number;
  colorSummary: string;
  crackPenalty: number;
}

export interface ProcessingJobData {
  id: string;
  sourceStoneId: string;
  placedCarvings: PlacedCarvingData[];
  estimatedProducts: EstimatedProductData[];
  finishDay: number;
}

export interface FinishedProductData {
  id: string;
  styleId: string;
  displayName: string;
  estimatedPrice: number;
  finalSellPrice: number;
  colorSummary: string;
  crackPenalty: number;
  sourceStoneId: string;
  isSold: boolean;
  canDisplay: boolean;
}

export interface DailySalesResult {
  soldCount: number;
  income: number;
  customerCount: number;
  completedProductCount: number;
  unsoldCount: number;
  soldProducts: FinishedProductData[];
}
