import { ColorConfig, SettlementConfig } from '../config/GameConfigTypes';
import { PlacedCarvingData } from '../data/CarvingTypes';
import { JadePieceData, SamplePointData, Vec2Data } from '../data/JadeTypes';
import { CarvingEstimateBreakdown, LayoutSettlementResult } from '../data/SettlementTypes';
import { distancePointToPolyline } from '../core/geometry/Polyline2D';
import { transformPoint } from '../core/geometry/Transform2D';

export class SettlementCalculator {
  private readonly colorValueById = new Map<string, number>();
  private readonly sampleGridIndex = new Map<string, SamplePointData[]>();
  private readonly sampleIndexCellSize: number;

  public constructor(
    private readonly jade: JadePieceData,
    colorConfig: ColorConfig,
    private readonly settlementConfig: SettlementConfig
  ) {
    this.sampleIndexCellSize = Math.max(4, jade.sampleCellSize);
    for (const color of colorConfig.colors) {
      this.colorValueById.set(color.id, color.valueMultiplier);
    }
    this.indexJadeSamples();
  }

  public calculate(placedCarvings: PlacedCarvingData[]): LayoutSettlementResult {
    const itemEstimates = placedCarvings.map((carving) => this.calculateItem(carving));
    const totalEstimate = roundMoney(itemEstimates.reduce((sum, item) => sum + item.finalEstimate, 0));
    const jadeCost = this.calculateJadeCost();
    const validArea = itemEstimates.filter((item) => item.isValidForSale).reduce((sum, item) => sum + item.occupiedArea, 0);
    const yieldRate = clamp(validArea / Math.max(1, this.jade.area), 0, 1);
    const highValueColorUtilization = this.calculateLayoutHighValueUtilization(placedCarvings);

    return {
      jadeCost,
      currentMarketValue: totalEstimate,
      currentProfit: roundMoney(totalEstimate - jadeCost),
      totalEstimate,
      yieldRate,
      highValueColorUtilization,
      placedCount: placedCarvings.length,
      validCount: itemEstimates.filter((item) => item.isValidForSale).length,
      invalidCount: itemEstimates.filter((item) => !item.isValidForSale).length,
      itemEstimates
    };
  }

  private calculateItem(carving: PlacedCarvingData): CarvingEstimateBreakdown {
    const occupiedArea = carving.geometry.approximateArea * carving.scale * carving.scale;
    const coverage = this.collectCoverage(carving);
    const isValidForSale = carving.validationState !== 'invalid';
    const sizeCoefficient = this.calculateSizeCoefficient(carving, occupiedArea);
    const materialQualityCoefficient = this.calculateMaterialQualityCoefficient();
    const colorValueCoefficient = this.calculateColorValueCoefficient(coverage.averageColorValue);
    const concentrationCoefficient = this.calculateConcentrationCoefficient(coverage.averageConcentration);
    const themeColorCoefficient = this.calculateThemeColorCoefficient(carving, coverage.averageThemeWeight, coverage.averageConcentration);
    const shallowCrackCoverage = this.calculateShallowCrackCoverage(carving);
    const crackPenaltyCoefficient = this.calculateCrackPenaltyCoefficient(carving, shallowCrackCoverage);
    const layoutSkillBonus = this.calculateLayoutSkillBonus(carving, coverage);
    const jackpotMultiplier = this.calculateJackpotMultiplier(carving, coverage, crackPenaltyCoefficient);
    const finalEstimate = isValidForSale
      ? roundMoney(
          carving.shape.basePrice *
            sizeCoefficient *
            materialQualityCoefficient *
            colorValueCoefficient *
            concentrationCoefficient *
            themeColorCoefficient *
            crackPenaltyCoefficient *
            layoutSkillBonus *
            jackpotMultiplier
        )
      : this.settlementConfig.pricing.invalidEstimateValue;

    return {
      carvingId: carving.id,
      shapeId: carving.shape.id,
      displayName: carving.shape.displayName,
      basePrice: carving.shape.basePrice,
      occupiedArea,
      sizeCoefficient,
      materialQualityCoefficient,
      colorValueCoefficient,
      concentrationCoefficient,
      themeColorCoefficient,
      crackPenaltyCoefficient,
      finalEstimate,
      colorCoverage: coverage.colorCoverage,
      averageConcentration: coverage.averageConcentration,
      highValueColorUtilization: coverage.highValueColorUtilization,
      shallowCrackCoverage,
      isValidForSale,
      reasons: [...carving.validationReasons]
    };
  }

  private collectCoverage(carving: PlacedCarvingData): {
    averageColorValue: number;
    averageConcentration: number;
    averageThemeWeight: number;
    colorCoverage: Record<string, number>;
    highValueColorUtilization: number;
  } {
    const colorCounts = new Map<string, number>();
    const preferredWeights = new Map(carving.shape.preferredColors.map((item): [string, number] => [item.colorId, item.weight]));
    let coveredCount = 0;
    let highValueCount = 0;
    let colorValueSum = 0;
    let concentrationSum = 0;
    let themeWeightSum = 0;

    for (const localSample of carving.geometry.localSamples) {
      const worldPoint = transformPoint(localSample, carving.position, carving.rotation, carving.scale);
      const jadeSample = this.findNearestSample(worldPoint);
      if (!jadeSample) {
        continue;
      }

      coveredCount += 1;
      const colorId = jadeSample.colorId ?? 'base';
      const colorValue = this.getColorValue(colorId);
      const preferredWeight = preferredWeights.get(colorId) ?? 1;

      colorCounts.set(colorId, (colorCounts.get(colorId) ?? 0) + 1);
      colorValueSum += colorValue;
      concentrationSum += jadeSample.concentration;
      themeWeightSum += preferredWeight;

      if (colorValue >= this.settlementConfig.pricing.highValueColorMultiplierThreshold) {
        highValueCount += 1;
      }
    }

    const colorCoverage: Record<string, number> = {};
    for (const [colorId, count] of colorCounts) {
      colorCoverage[colorId] = count / Math.max(1, coveredCount);
    }

    return {
      averageColorValue: coveredCount > 0 ? colorValueSum / coveredCount : 0.22,
      averageConcentration: coveredCount > 0 ? concentrationSum / coveredCount : 0,
      averageThemeWeight: coveredCount > 0 ? themeWeightSum / coveredCount : 1,
      colorCoverage,
      highValueColorUtilization: coveredCount > 0 ? highValueCount / coveredCount : 0
    };
  }

  private calculateJadeCost(): number {
    const config = this.settlementConfig.jadeCost;
    const averageColorValue = this.jade.sampleGrid.reduce((sum, sample) => sum + this.getColorValue(sample.colorId), 0) / Math.max(1, this.jade.sampleGrid.length);
    const colorPremium = Math.max(0, averageColorValue - 1) * config.colorValueWeight;
    const materialCostFactor = clamp(0.48 + this.calculateMaterialQualityCoefficient() * 0.38, 0.28, 1.4);
    const crackDiscount = clamp(
      this.jade.cracks.filter((crack) => crack.type === 'shallow').length * config.shallowCrackDiscount +
        this.jade.cracks.filter((crack) => crack.type === 'deep').length * config.deepCrackDiscount,
      0,
      config.maxCrackDiscount
    );
    const cost =
      (config.baseCost + this.jade.area * config.areaCostFactor) *
      materialCostFactor *
      (1 + colorPremium) *
      (1 - crackDiscount) *
      this.jade.roughPriceMultiplier;

    return roundMoney(Math.max(config.minCost, cost));
  }

  private calculateLayoutHighValueUtilization(placedCarvings: PlacedCarvingData[]): number {
    const highValueJadeSamples = this.jade.sampleGrid.filter((sample) => this.getColorValue(sample.colorId) >= this.settlementConfig.pricing.highValueColorMultiplierThreshold);
    if (highValueJadeSamples.length === 0) {
      return 0;
    }

    const usedSampleKeys = new Set<string>();
    for (const carving of placedCarvings) {
      if (carving.validationState === 'invalid') {
        continue;
      }

      for (const localSample of carving.geometry.localSamples) {
        const worldPoint = transformPoint(localSample, carving.position, carving.rotation, carving.scale);
        const jadeSample = this.findNearestSample(worldPoint);
        if (jadeSample && this.getColorValue(jadeSample.colorId) >= this.settlementConfig.pricing.highValueColorMultiplierThreshold) {
          usedSampleKeys.add(getSampleKey(jadeSample));
        }
      }
    }

    return clamp(usedSampleKeys.size / highValueJadeSamples.length, 0, 1);
  }

  private calculateSizeCoefficient(carving: PlacedCarvingData, occupiedArea: number): number {
    const config = this.settlementConfig.pricing;
    const ratio = occupiedArea / Math.max(1, carving.shape.nominalArea);
    const coefficient = ratio < 1 ? Math.pow(ratio, config.sizeUnderPower) : 1 + (ratio - 1) * config.sizeOverGain;

    return clamp(coefficient, config.minSizeCoefficient, config.maxSizeCoefficient);
  }

  private calculateColorValueCoefficient(averageColorValue: number): number {
    const config = this.settlementConfig.pricing;
    if (averageColorValue <= 1) {
      return clamp(averageColorValue * 0.72, config.minColorValueCoefficient, config.maxColorValueCoefficient);
    }

    return clamp(0.78 + Math.pow(averageColorValue - 1, 1.28) * config.colorValueWeight, config.minColorValueCoefficient, config.maxColorValueCoefficient);
  }

  private calculateConcentrationCoefficient(averageConcentration: number): number {
    const config = this.settlementConfig.pricing;
    return clamp(1 + (averageConcentration - 0.5) * config.concentrationWeight, config.minConcentrationCoefficient, config.maxConcentrationCoefficient);
  }

  private calculateMaterialQualityCoefficient(): number {
    const config = this.settlementConfig.pricing;
    return clamp(this.jade.materialQualityFactor, config.minMaterialQualityCoefficient, config.maxMaterialQualityCoefficient);
  }

  private calculateThemeColorCoefficient(carving: PlacedCarvingData, averageThemeWeight: number, averageConcentration: number): number {
    const config = this.settlementConfig.pricing;
    const rules = carving.shape.themeColorRules;
    const colorMatch = 1 + (averageThemeWeight - 1) * rules.colorMatchWeight;
    const concentrationMatch = 1 + (averageConcentration - 0.5) * rules.concentrationWeight;
    const cleanlinessMatch = carving.validationState === 'warning' ? 1 - 0.12 * rules.cleanlinessWeight : 1 + 0.08 * rules.cleanlinessWeight;
    const weighted = 1 + (colorMatch * concentrationMatch * cleanlinessMatch - 1) * config.themeMatchWeight;

    return clamp(weighted, config.minThemeColorCoefficient, config.maxThemeColorCoefficient);
  }

  private calculateCrackPenaltyCoefficient(carving: PlacedCarvingData, shallowCrackCoverage: number): number {
    if (carving.validationState !== 'warning' || shallowCrackCoverage <= 0) {
      return 1;
    }

    const config = this.settlementConfig.pricing;
    const coveragePenalty = Math.min(0.68, shallowCrackCoverage * 2.6);
    const sensitivityPenalty = carving.shape.crackSensitivity * carving.shape.shallowCrackPenaltyMultiplier * config.shallowCrackBasePenalty;
    return clamp(1 - coveragePenalty - sensitivityPenalty, config.minCrackPenaltyCoefficient, 1);
  }

  private calculateLayoutSkillBonus(
    carving: PlacedCarvingData,
    coverage: { averageConcentration: number; averageColorValue: number; highValueColorUtilization: number }
  ): number {
    const range = this.settlementConfig.pricing.layoutSkillBonusRange ?? [1, 1.25];
    const colorUseScore = clamp(coverage.highValueColorUtilization * 1.15, 0, 1);
    const concentrationScore = clamp(coverage.averageConcentration, 0, 1);
    const cleanScore = carving.validationState === 'valid' ? 1 : 0.35;
    const colorValueScore = clamp((coverage.averageColorValue - 0.8) / 3.8, 0, 1);
    const skillScore = clamp(colorUseScore * 0.38 + concentrationScore * 0.22 + cleanScore * 0.2 + colorValueScore * 0.2, 0, 1);
    return range[0] + (range[1] - range[0]) * skillScore;
  }

  private calculateJackpotMultiplier(
    carving: PlacedCarvingData,
    coverage: { averageColorValue: number; averageConcentration: number; highValueColorUtilization: number },
    crackPenaltyCoefficient: number
  ): number {
    if (carving.validationState === 'invalid' || crackPenaltyCoefficient < 0.82) {
      return 1;
    }

    const config = this.settlementConfig.pricing;
    const colorScore = clamp((coverage.averageColorValue - config.highValueColorMultiplierThreshold) / 2.8, 0, 1);
    const concentrationScore = clamp((coverage.averageConcentration - 0.55) / 0.45, 0, 1);
    const materialScore = clamp((this.jade.materialQualityFactor - 0.85) / 1.45, 0, 1);
    const utilizationScore = clamp(coverage.highValueColorUtilization * 1.35, 0, 1);
    const jackpotScore = clamp(colorScore * 0.36 + concentrationScore * 0.2 + materialScore * 0.24 + utilizationScore * 0.2, 0, 1);
    if (jackpotScore <= 0.2) {
      return 1;
    }

    const roll = deterministicUnit(`${this.jade.seed}:${carving.id}:jackpot`);
    const probability = (config.jackpotProbabilityBase ?? 0.03) + jackpotScore * 0.28;
    if (roll > probability) {
      return 1;
    }

    const multiplierRange = jackpotScore > 0.82 ? config.superJackpotMultiplierRange ?? [8, 12] : config.jackpotMultiplierRange ?? [3, 6];
    const multiplierRoll = deterministicUnit(`${this.jade.seed}:${carving.id}:jackpot_multiplier`);
    return multiplierRange[0] + (multiplierRange[1] - multiplierRange[0]) * multiplierRoll;
  }

  private calculateShallowCrackCoverage(carving: PlacedCarvingData): number {
    const shallowCracks = this.jade.cracks.filter((crack) => crack.type === 'shallow');
    if (shallowCracks.length === 0 || carving.geometry.localSamples.length === 0) {
      return 0;
    }

    let checkedCount = 0;
    let hitCount = 0;
    const stride = Math.max(1, Math.floor(carving.geometry.localSamples.length / 180));

    for (let index = 0; index < carving.geometry.localSamples.length; index += stride) {
      checkedCount += 1;
      const worldPoint = transformPoint(carving.geometry.localSamples[index], carving.position, carving.rotation, carving.scale);

      for (const crack of shallowCracks) {
        if (distancePointToPolyline(worldPoint, crack.points) <= crack.width * 0.5 + 2) {
          hitCount += 1;
          break;
        }
      }
    }

    return checkedCount > 0 ? hitCount / checkedCount : 0;
  }

  private findNearestSample(point: Vec2Data): SamplePointData | null {
    let bestSample: SamplePointData | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const maxDistance = Math.max(5, this.jade.sampleCellSize * 1.45);
    const centerCellX = Math.floor(point.x / this.sampleIndexCellSize);
    const centerCellY = Math.floor(point.y / this.sampleIndexCellSize);

    for (let cellY = centerCellY - 1; cellY <= centerCellY + 1; cellY += 1) {
      for (let cellX = centerCellX - 1; cellX <= centerCellX + 1; cellX += 1) {
        const samples = this.sampleGridIndex.get(getCellKey(cellX, cellY));
        if (!samples) {
          continue;
        }

        for (const sample of samples) {
          const sampleDistance = Math.hypot(sample.x - point.x, sample.y - point.y);
          if (sampleDistance < bestDistance) {
            bestSample = sample;
            bestDistance = sampleDistance;
          }
        }
      }
    }

    return bestSample && bestDistance <= maxDistance ? bestSample : null;
  }

  private indexJadeSamples(): void {
    for (const sample of this.jade.sampleGrid) {
      const cellX = Math.floor(sample.x / this.sampleIndexCellSize);
      const cellY = Math.floor(sample.y / this.sampleIndexCellSize);
      const key = getCellKey(cellX, cellY);
      const samples = this.sampleGridIndex.get(key);

      if (samples) {
        samples.push(sample);
      } else {
        this.sampleGridIndex.set(key, [sample]);
      }
    }
  }

  private getColorValue(colorId: string | undefined): number {
    if (!colorId) {
      return 0.42;
    }

    if (colorId === 'base') {
      return 0.42;
    }

    return this.colorValueById.get(colorId) ?? 1;
  }
}

function getSampleKey(sample: SamplePointData): string {
  return `${Math.round(sample.x)}:${Math.round(sample.y)}`;
}

function getCellKey(cellX: number, cellY: number): string {
  return `${cellX}:${cellY}`;
}

function roundMoney(value: number): number {
  return Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function deterministicUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}
