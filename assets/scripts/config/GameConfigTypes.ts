export interface RangeConfig {
  0: number;
  1: number;
}

export interface DemoLevelConfig {
  seed: number;
  canvas: {
    width: number;
    height: number;
  };
  sampleGrid: {
    sampleCellSize: number;
    highQualitySampleCellSize: number;
    settlementSampleCellSize: number;
    debugShowSamples: boolean;
    maxDebugSamples: number;
    debugSampleAlpha?: number;
  };
  reveal: {
    defaultBrushSlider: number;
    minBrushRadius: number;
    maxBrushRadius: number;
    revealCellSize: number;
    strokeSpacingFactor: number;
    maxBrushStampsPerMove: number;
    quoteUpdateIntervalMs: number;
    remainingSkinAreaThresholdPx2: number;
    largestRemainingPatchThresholdPx2: number;
    clearRemainingOnComplete: boolean;
    completeTransitionDelay: number;
  };
  economy: {
    initialCoins: number;
    marketStoneCountRange: [number, number];
    initialShelfSlotCount: number;
    dailyCustomerCount: number;
    finalSellPriceMultiplierRange: [number, number];
    lowPriceSellBias: number;
    newPlayerProtectionDays?: number;
    marketDiscountForNewPlayer?: number;
    guaranteedPlayableStonePerDay?: number;
    qualityProfiles: {
      id: string;
      displayName: string;
      probability: number;
    }[];
    materialQualities: {
      id: string;
      displayName: string;
      probability: number;
      factorRange: [number, number];
    }[];
    materialQualityByProfile: Record<string, Record<string, number>>;
    colorRichnessByProfile: Record<string, number>;
    roughPriceMultiplierByProfile: Record<string, [number, number]>;
  };
  monetizationPlaceholders: {
    id: string;
    displayName: string;
    description: string;
  }[];
  debug: {
    showSeedLabel: boolean;
    showCrackHitDebug?: boolean;
    forceDeepCrackTestStone?: boolean;
    crackTestMode?: boolean;
    debugForceDeepCrack?: boolean;
    showColorGenerationDebug?: boolean;
    forceColorfulTestStone?: boolean;
  };
}

export interface JadeSizeGradeConfig {
  id: string;
  displayName: string;
  probability: number;
  radiusRange: [number, number];
  vertexCountRange: [number, number];
  aspectRatioRange: [number, number];
  regionCountRange: [number, number];
}

export interface JadeConfig {
  baseFillColor: string;
  baseStrokeColor: string;
  outlineSmoothPasses: number;
  sizeGrades: JadeSizeGradeConfig[];
  radiusNoise: {
    min: number;
    max: number;
  };
}

export interface ColorDefinitionConfig {
  id: string;
  displayName: string;
  probability: number;
  displayColor: string;
  valueMultiplier: number;
  concentrationRange: [number, number];
  radiusScaleRange: [number, number];
}

export interface ColorRegionCountWeightConfig {
  count: number;
  probability: number;
}

export interface ColorConfig {
  regionAlpha: number;
  concentrationRingCount: number;
  regionColorCountWeights: ColorRegionCountWeightConfig[];
  colors: ColorDefinitionConfig[];
}

export interface CrackTypeConfig {
  displayName: string;
  probability: number;
  countRange: [number, number];
  widthRange: [number, number];
  segmentCountRange: [number, number];
  jaggedOffsetRange: [number, number];
  displayColor: string;
  displayAlpha: number;
  penaltyPerLength?: number;
}

export interface CrackProfileConfig {
  id: string;
  displayName: string;
  probability: number;
  shallowCountRange: [number, number];
  deepCountRange: [number, number];
}

export interface CrackConfig {
  shallow: CrackTypeConfig;
  deep: CrackTypeConfig;
  crackProfiles?: CrackProfileConfig[];
  crackProfilesByQuality?: Record<string, Record<string, number>>;
  crackByQuality?: Record<
    string,
    {
      shallowProbability: number;
      shallowCountRange: [number, number];
      deepProbability: number;
      deepCountRange: [number, number];
      cleanProbability: number;
    }
  >;
}

export interface CarvingPreferredColorConfig {
  colorId: string;
  weight: number;
}

export interface CarvingThemeColorRulesConfig {
  mode: string;
  cleanlinessWeight: number;
  concentrationWeight: number;
  colorMatchWeight: number;
}

export interface CarvingGeometryConfig {
  width: number;
  height: number;
  innerRadiusRatio?: number | null;
  cornerRadius?: number;
  edgeCheckBandWidth?: number;
  polygonPreset: string;
}

export interface CarvingShapeConfig {
  id: string;
  displayName: string;
  shortDisplayName?: string;
  description: string;
  category: string;
  shapeKind: string;
  basePrice: number;
  carvingTime: number;
  nominalArea: number;
  minValidArea: number;
  maxValidArea: number;
  minScale: number;
  maxScale: number;
  crackSensitivity: number;
  deepCrackPolicy: string;
  shallowCrackPenaltyMultiplier: number;
  preferredColors: CarvingPreferredColorConfig[];
  themeColorRules: CarvingThemeColorRulesConfig;
  geometry: CarvingGeometryConfig;
  futureExtensions?: Record<string, boolean>;
}

export interface CarvingConfig {
  shapes: CarvingShapeConfig[];
}

export interface SettlementConfig {
  jadeCost: {
    baseCost: number;
    minCost: number;
    areaCostFactor: number;
    colorValueWeight: number;
    shallowCrackDiscount: number;
    deepCrackDiscount: number;
    maxCrackDiscount: number;
  };
  pricing: {
    invalidEstimateValue: number;
    highValueColorMultiplierThreshold: number;
    sizeUnderPower: number;
    sizeOverGain: number;
    minSizeCoefficient: number;
    maxSizeCoefficient: number;
    minMaterialQualityCoefficient: number;
    maxMaterialQualityCoefficient: number;
    colorValueWeight: number;
    minColorValueCoefficient: number;
    maxColorValueCoefficient: number;
    concentrationWeight: number;
    minConcentrationCoefficient: number;
    maxConcentrationCoefficient: number;
    themeMatchWeight: number;
    minThemeColorCoefficient: number;
    maxThemeColorCoefficient: number;
    shallowCrackBasePenalty: number;
    minCrackPenaltyCoefficient: number;
    layoutSkillBonusRange?: [number, number];
    jackpotMultiplierRange?: [number, number];
    superJackpotMultiplierRange?: [number, number];
    jackpotProbabilityBase?: number;
  };
  revealPricing: {
    unknownAreaUnitValue: number;
    revealedBaseUnitValue: number;
    quoteScale: number;
    colorValueWeight: number;
    concentrationWeight: number;
    lowValuePenaltyWeight: number;
    shallowCrackPenaltyPerPx: number;
    deepCrackPenaltyPerPx: number;
    highValueCrackPenaltyMultiplier: number;
    maxCrackPenaltyRatio: number;
  };
}

export interface TextConfig {
  texts: Record<string, string>;
}

export interface CustomerTypeConfig {
  id: string;
  displayName: string;
  probability: number;
  budgetRange: [number, number];
  preferredStyleIds: string[];
  preferredColorIds: string[];
  priceSensitivity: number;
  qualitySensitivity: number;
  crackTolerance: number;
  buyProbabilityBase: number;
  messageKey: string;
}

export interface CustomerConfig {
  customerTypes: CustomerTypeConfig[];
}

export interface LoadedGameConfigs {
  demoLevel: DemoLevelConfig;
  jade: JadeConfig;
  color: ColorConfig;
  crack: CrackConfig;
  carving: CarvingConfig;
  settlement: SettlementConfig;
  customer: CustomerConfig;
  text: TextConfig;
}
