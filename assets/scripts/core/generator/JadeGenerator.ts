import { ColorDefinitionConfig, LoadedGameConfigs } from '../../config/GameConfigTypes';
import { ColorRegionData, CrackData, CrackType, JadePieceData, SamplePointData, Vec2Data } from '../../data/JadeTypes';
import { getBounds, pointInPolygon, polygonArea, smoothClosedPolygon } from '../geometry/Polygon2D';
import { SeededRandom } from '../random/SeededRandom';

export class JadeGenerator {
  public generate(configs: LoadedGameConfigs): JadePieceData {
    const seed = configs.demoLevel.seed;
    const random = new SeededRandom(seed);
    const sizeGrade = random.pickWeighted(configs.jade.sizeGrades);
    const qualityProfile = random.pickWeighted(configs.demoLevel.economy.qualityProfiles);
    const materialQuality = this.pickMaterialQuality(configs, random, qualityProfile.id);
    const colorRichness = configs.demoLevel.economy.colorRichnessByProfile[qualityProfile.id] ?? 0.8;
    const roughPriceRange = configs.demoLevel.economy.roughPriceMultiplierByProfile[qualityProfile.id] ?? [0.8, 1.2];
    const outlinePolygon = this.generateOutline(configs, random, sizeGrade.id);
    const area = polygonArea(outlinePolygon);
    const colorRegions = this.generateColorRegions(configs, random, outlinePolygon, sizeGrade.regionCountRange, colorRichness);
    const sampleGrid = this.generateSampleGrid(configs, outlinePolygon, colorRegions);
    const crackProfile = this.pickCrackProfile(configs, random, qualityProfile.id);
    const cracks = this.generateCracks(configs, random, sampleGrid, crackProfile);

    return {
      id: `jade_${seed}`,
      seed,
      sizeGradeId: sizeGrade.id,
      qualityProfileId: qualityProfile.id,
      qualityProfileDisplayName: qualityProfile.displayName,
      materialQualityId: materialQuality.id,
      materialQualityDisplayName: materialQuality.displayName,
      materialQualityFactor: random.range(materialQuality.factorRange[0], materialQuality.factorRange[1]),
      crackProfileId: crackProfile.id,
      crackProfileDisplayName: crackProfile.displayName,
      colorRichness,
      roughPriceMultiplier: random.range(roughPriceRange[0], roughPriceRange[1]),
      outlinePolygon,
      area,
      colorRegions,
      cracks,
      sampleGrid,
      sampleCellSize: configs.demoLevel.sampleGrid.sampleCellSize
    };
  }

  private pickCrackProfile(configs: LoadedGameConfigs, random: SeededRandom, qualityProfileId: string): { id: string; displayName: string; shallowCountRange: [number, number]; deepCountRange: [number, number] } {
    const profiles = configs.crack.crackProfiles;
    if (!profiles || profiles.length === 0) {
      const qualityCrackConfig = configs.crack.crackByQuality?.[qualityProfileId];
      const isCleanRoll = qualityCrackConfig ? random.chance(qualityCrackConfig.cleanProbability) : false;
      if (isCleanRoll) {
        return {
          id: 'clean_legacy',
          displayName: 'Clean',
          shallowCountRange: [0, 0],
          deepCountRange: [0, 0]
        };
      }

      return {
        id: 'legacy_mixed',
        displayName: 'Mixed',
        shallowCountRange: qualityCrackConfig?.shallowCountRange ?? configs.crack.shallow.countRange,
        deepCountRange: qualityCrackConfig?.deepCountRange ?? configs.crack.deep.countRange
      };
    }

    const qualityWeights = configs.crack.crackProfilesByQuality?.[qualityProfileId];
    const weightedProfiles = profiles.map((profile) => ({
      ...profile,
      probability: qualityWeights?.[profile.id] ?? profile.probability
    }));
    const picked = random.pickWeighted(weightedProfiles);

    if (configs.demoLevel.debug.crackTestMode || configs.demoLevel.debug.debugForceDeepCrack) {
      const testProfile = profiles.find((profile) => profile.id === 'shallow_and_deep') ?? picked;
      return {
        ...testProfile,
        deepCountRange: [Math.max(1, testProfile.deepCountRange[0]), Math.max(1, testProfile.deepCountRange[1])]
      };
    }

    return picked;
  }

  private pickMaterialQuality(configs: LoadedGameConfigs, random: SeededRandom, profileId: string): { id: string; displayName: string; probability: number; factorRange: [number, number] } {
    const profileWeights = configs.demoLevel.economy.materialQualityByProfile[profileId];
    if (!profileWeights) {
      return random.pickWeighted(configs.demoLevel.economy.materialQualities);
    }

    const weightedQualities = configs.demoLevel.economy.materialQualities.map((quality) => ({
      ...quality,
      probability: profileWeights[quality.id] ?? 0
    }));
    return random.pickWeighted(weightedQualities);
  }

  private generateOutline(configs: LoadedGameConfigs, random: SeededRandom, sizeGradeId: string): Vec2Data[] {
    const sizeGrade = configs.jade.sizeGrades.find((item) => item.id === sizeGradeId) ?? configs.jade.sizeGrades[0];
    const radius = random.range(sizeGrade.radiusRange[0], sizeGrade.radiusRange[1]);
    const aspectRatio = random.range(sizeGrade.aspectRatioRange[0], sizeGrade.aspectRatioRange[1]);
    const vertexCount = random.int(sizeGrade.vertexCountRange[0], sizeGrade.vertexCountRange[1]);
    const points: Vec2Data[] = [];

    for (let index = 0; index < vertexCount; index += 1) {
      const angle = (Math.PI * 2 * index) / vertexCount;
      const noise = random.range(configs.jade.radiusNoise.min, configs.jade.radiusNoise.max);
      const localRadius = radius * noise;
      points.push({
        x: Math.cos(angle) * localRadius * aspectRatio,
        y: Math.sin(angle) * localRadius
      });
    }

    return smoothClosedPolygon(points, configs.jade.outlineSmoothPasses);
  }

  private generateColorRegions(
    configs: LoadedGameConfigs,
    random: SeededRandom,
    outlinePolygon: Vec2Data[],
    regionCountRange: [number, number],
    colorRichness: number
  ): ColorRegionData[] {
    const bounds = getBounds(outlinePolygon);
    const extraRegionChance = clamp((colorRichness - 1) * 0.45, 0, 0.45);
    const regionCount = Math.max(1, random.int(regionCountRange[0], regionCountRange[1]) + (random.chance(extraRegionChance) ? 1 : 0));
    const colorPalette = this.pickColorPalette(configs, random, colorRichness, regionCount);
    const regions: ColorRegionData[] = [];

    for (let index = 0; index < regionCount; index += 1) {
      const color = colorPalette[index % colorPalette.length] ?? this.pickColorByRichness(configs, random, colorRichness);
      const center = this.pickPointInside(random, bounds, outlinePolygon);
      const radiusScale = random.range(color.radiusScaleRange[0], color.radiusScaleRange[1]) * clamp(0.78 + colorRichness * 0.22, 0.72, 1.2);
      const concentrationPeak = clamp(
        random.range(color.concentrationRange[0], color.concentrationRange[1]) * clamp(0.66 + colorRichness * 0.34, 0.58, 1.32),
        0.03,
        1
      );
      const baseRadius = Math.sqrt(polygonArea(outlinePolygon)) * radiusScale;

      regions.push({
        id: `color_region_${index}`,
        colorId: color.id,
        center,
        radiusX: baseRadius * random.range(0.75, 1.45),
        radiusY: baseRadius * random.range(0.55, 1.2),
        rotation: random.range(0, Math.PI * 2),
        concentrationPeak,
        valueMultiplier: color.valueMultiplier,
        displayColor: color.displayColor
      });
    }

    return regions;
  }

  private pickColorPalette(configs: LoadedGameConfigs, random: SeededRandom, colorRichness: number, regionCount: number): ColorDefinitionConfig[] {
    const weights = configs.color.regionColorCountWeights?.length > 0 ? configs.color.regionColorCountWeights : [{ count: 1, probability: 1 }];
    const targetColorCount = clamp(random.pickWeighted(weights).count, 1, Math.max(1, Math.min(regionCount, configs.color.colors.length)));
    const palette: ColorDefinitionConfig[] = [];
    const usedColorIds = new Set<string>();

    for (let index = 0; index < targetColorCount; index += 1) {
      const color = this.pickColorByRichness(configs, random, colorRichness, usedColorIds);
      palette.push(color);
      usedColorIds.add(color.id);
    }

    return palette;
  }

  private pickColorByRichness(configs: LoadedGameConfigs, random: SeededRandom, colorRichness: number, excludedColorIds?: Set<string>): ColorDefinitionConfig {
    const availableColors = configs.color.colors.filter((color) => !excludedColorIds?.has(color.id));
    const colorPool = availableColors.length > 0 ? availableColors : configs.color.colors;
    const weightedColors = colorPool.map((color) => {
      const valueBias = Math.pow(Math.max(0.25, color.valueMultiplier), colorRichness - 0.8);
      return {
        ...color,
        probability: color.probability * valueBias
      };
    });

    return random.pickWeighted(weightedColors);
  }

  private generateSampleGrid(configs: LoadedGameConfigs, outlinePolygon: Vec2Data[], regions: ColorRegionData[]): SamplePointData[] {
    const bounds = getBounds(outlinePolygon);
    const cellSize = configs.demoLevel.sampleGrid.sampleCellSize;
    const samples: SamplePointData[] = [];

    for (let y = bounds.minY; y <= bounds.maxY; y += cellSize) {
      for (let x = bounds.minX; x <= bounds.maxX; x += cellSize) {
        const point = { x, y };
        if (!pointInPolygon(point, outlinePolygon)) {
          continue;
        }

        samples.push(this.createSamplePoint(point, regions));
      }
    }

    return samples;
  }

  private createSamplePoint(point: Vec2Data, regions: ColorRegionData[]): SamplePointData {
    let bestRegion: ColorRegionData | undefined;
    let bestConcentration = 0;

    for (const region of regions) {
      const concentration = this.getRegionConcentration(point, region);
      if (concentration > bestConcentration) {
        bestConcentration = concentration;
        bestRegion = region;
      }
    }

    return {
      x: point.x,
      y: point.y,
      colorRegionId: bestRegion?.id,
      colorId: bestRegion?.colorId,
      concentration: bestConcentration
    };
  }

  private getRegionConcentration(point: Vec2Data, region: ColorRegionData): number {
    const cos = Math.cos(-region.rotation);
    const sin = Math.sin(-region.rotation);
    const dx = point.x - region.center.x;
    const dy = point.y - region.center.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const normalized = (localX * localX) / (region.radiusX * region.radiusX) + (localY * localY) / (region.radiusY * region.radiusY);

    if (normalized > 1) {
      return 0;
    }

    return (1 - normalized) * region.concentrationPeak;
  }

  private generateCracks(
    configs: LoadedGameConfigs,
    random: SeededRandom,
    sampleGrid: SamplePointData[],
    crackProfile: { id: string; shallowCountRange: [number, number]; deepCountRange: [number, number] }
  ): CrackData[] {
    const cracks: CrackData[] = [];
    cracks.push(...this.generateCrackType('shallow', configs, random, sampleGrid, crackProfile.shallowCountRange));
    cracks.push(...this.generateCrackType('deep', configs, random, sampleGrid, crackProfile.deepCountRange));
    return cracks;
  }

  private generateCrackType(
    type: CrackType,
    configs: LoadedGameConfigs,
    random: SeededRandom,
    sampleGrid: SamplePointData[],
    countRange: [number, number]
  ): CrackData[] {
    const crackConfig = configs.crack[type];
    const forceDeepCrack = type === 'deep' && (configs.demoLevel.debug.crackTestMode || configs.demoLevel.debug.debugForceDeepCrack);
    const cracks: CrackData[] = [];
    const minCount = forceDeepCrack ? Math.max(1, countRange[0]) : countRange[0];
    const maxCount = forceDeepCrack ? Math.max(1, countRange[1]) : countRange[1];
    const count = random.int(minCount, maxCount);

    for (let index = 0; index < count; index += 1) {
      const start = sampleGrid[random.int(0, sampleGrid.length - 1)];
      const end = sampleGrid[random.int(0, sampleGrid.length - 1)];
      const segmentCount = random.int(crackConfig.segmentCountRange[0], crackConfig.segmentCountRange[1]);
      const width = random.range(crackConfig.widthRange[0], crackConfig.widthRange[1]) * (configs.demoLevel.debug.crackTestMode && type === 'deep' ? 1.18 : 1);

      cracks.push({
        id: `${type}_crack_${index}`,
        type,
        points: this.createJaggedPolyline(start, end, segmentCount, crackConfig.jaggedOffsetRange, random),
        width,
        severity: type === 'deep' ? 1 : 0.45,
        displayColor: crackConfig.displayColor,
        displayAlpha: crackConfig.displayAlpha
      });
    }

    return cracks;
  }

  private createJaggedPolyline(
    start: Vec2Data,
    end: Vec2Data,
    segmentCount: number,
    offsetRange: [number, number],
    random: SeededRandom
  ): Vec2Data[] {
    const points: Vec2Data[] = [];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const normalX = -dy / length;
    const normalY = dx / length;

    for (let index = 0; index <= segmentCount; index += 1) {
      const t = index / segmentCount;
      const offset = index === 0 || index === segmentCount ? 0 : random.range(offsetRange[0], offsetRange[1]) * (random.chance(0.5) ? -1 : 1);
      points.push({
        x: start.x + dx * t + normalX * offset,
        y: start.y + dy * t + normalY * offset
      });
    }

    return points;
  }

  private pickPointInside(
    random: SeededRandom,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    outlinePolygon: Vec2Data[]
  ): Vec2Data {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const point = {
        x: random.range(bounds.minX, bounds.maxX),
        y: random.range(bounds.minY, bounds.maxY)
      };

      if (pointInPolygon(point, outlinePolygon)) {
        return point;
      }
    }

    return { x: 0, y: 0 };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
