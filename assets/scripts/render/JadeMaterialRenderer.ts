import { Color, Graphics } from 'cc';

import { ColorConfig, DemoLevelConfig, JadeConfig } from '../config/GameConfigTypes';
import { CrackData, JadePieceData, RevealMaskPointData, Vec2Data } from '../data/JadeTypes';

interface MaterialVisualProfile {
  baseTint: string;
  tintAmount: number;
  hazeAlpha: number;
  grainAlpha: number;
  grainDensity: number;
  highlightAlpha: number;
  highlightDensity: number;
  strokeWidth: number;
}

interface CrackSegmentStyleOptions {
  alphaScale?: number;
  widthScale?: number;
}

export class JadeMaterialRenderer {
  public static drawJadeBody(graphics: Graphics, jade: JadePieceData, jadeConfig: JadeConfig): void {
    const profile = getMaterialProfile(jade.materialQualityId);
    drawPolygon(graphics, jade.outlinePolygon);
    graphics.fillColor = mixHexColor(jadeConfig.baseFillColor, profile.baseTint, profile.tintAmount, 255);
    graphics.strokeColor = parseHexColor(jadeConfig.baseStrokeColor, 255);
    graphics.lineWidth = profile.strokeWidth;
    graphics.fill();
    graphics.stroke();

    this.drawInteriorHaze(graphics, jade, profile);
    this.drawInteriorGrain(graphics, jade, profile);
    this.drawInteriorHighlights(graphics, jade, profile);
  }

  public static drawColorRegions(graphics: Graphics, jade: JadePieceData, colorConfig: ColorConfig): void {
    const colorById = new Map(colorConfig.colors.map((item) => [item.id, item.displayColor]));
    const layerSettings = [
      { threshold: 0.05, maxSamples: 190, radiusMultiplier: 2.35, alphaMultiplier: 0.18 },
      { threshold: 0.14, maxSamples: 240, radiusMultiplier: 1.75, alphaMultiplier: 0.28 },
      { threshold: 0.28, maxSamples: 300, radiusMultiplier: 1.25, alphaMultiplier: 0.42 },
      { threshold: 0.48, maxSamples: 360, radiusMultiplier: 0.86, alphaMultiplier: 0.58 }
    ];

    for (const region of jade.colorRegions) {
      const regionSamples = jade.sampleGrid.filter((sample) => sample.colorRegionId === region.id && sample.concentration > 0.04);
      const regionColor = colorById.get(region.colorId) ?? region.displayColor ?? '#ff00ff';

      for (let layerIndex = 0; layerIndex < layerSettings.length; layerIndex += 1) {
        const setting = layerSettings[layerIndex];
        const samples = regionSamples.filter((sample) => sample.concentration >= setting.threshold);
        const step = Math.max(1, Math.ceil(samples.length / setting.maxSamples));

        for (let index = 0; index < samples.length; index += step) {
          const sample = samples[index];
          const jitter = getJitter(`${region.id}_${layerIndex}_${index}`, jade.sampleCellSize * 0.22);
          const alpha = Math.round(
            255 *
              colorConfig.regionAlpha *
              setting.alphaMultiplier *
              clamp(sample.concentration * 1.3, 0.2, 1.0)
          );
          const radius = Math.max(
            2.5,
            jade.sampleCellSize * setting.radiusMultiplier * (0.82 + sample.concentration * 0.38)
          );

          graphics.circle(sample.x + jitter.x, sample.y + jitter.y, radius);
          graphics.fillColor = parseHexColor(regionColor, alpha);
          graphics.fill();
        }
      }

      if (region.colorId === 'mixed') {
        this.drawMixedColorAccents(graphics, regionSamples, jade.sampleCellSize, colorConfig.regionAlpha, region.id);
      }
    }
  }

  public static drawJadeSkin(graphics: Graphics, jade: JadePieceData): void {
    drawPolygon(graphics, jade.outlinePolygon);
    graphics.fillColor = getSkinBaseColor(jade.materialQualityId);
    graphics.strokeColor = new Color(38, 37, 34, 225);
    graphics.lineWidth = 5;
    graphics.fill();
    graphics.stroke();

    this.drawSkinSpeckles(graphics, jade);
    this.drawSkinScratches(graphics, jade);
    this.drawSkinClouds(graphics, jade);
  }

  public static drawRevealPoint(
    graphics: Graphics,
    sample: RevealMaskPointData,
    jadeConfig: JadeConfig,
    colorConfig: ColorConfig,
    demoLevelConfig: DemoLevelConfig,
    colorById: Map<string, string>
  ): void {
    const baseRadius = Math.max(2.7, demoLevelConfig.reveal.revealCellSize * 0.8);
    const softRadius = baseRadius * 1.95;
    const colorRadius = Math.max(2.5, demoLevelConfig.reveal.revealCellSize * 0.78);

    graphics.circle(sample.x, sample.y, softRadius);
    graphics.fillColor = parseHexColor(jadeConfig.baseFillColor, 60);
    graphics.fill();

    graphics.circle(sample.x, sample.y, baseRadius * 1.12);
    graphics.fillColor = parseHexColor(jadeConfig.baseFillColor, 218);
    graphics.fill();

    if (sample.colorId && sample.concentration > 0.035) {
      const regionColor = colorById.get(sample.colorId) ?? '#ff00ff';
      const alpha = Math.round(255 * colorConfig.regionAlpha * clamp(sample.concentration * 1.18, 0.14, 1) * 1.08);
      const radius = colorRadius * (1.1 + sample.concentration * 0.34);

      graphics.circle(sample.x, sample.y, radius * 1.55);
      graphics.fillColor = parseHexColor(regionColor, Math.round(alpha * 0.32));
      graphics.fill();

      graphics.circle(sample.x, sample.y, radius);
      graphics.fillColor = parseHexColor(regionColor, alpha);
      graphics.fill();
    }

    const powderAlpha = 16 + (hashString(`${Math.round(sample.x)}_${Math.round(sample.y)}`) % 16);
    graphics.strokeColor = new Color(235, 239, 231, powderAlpha);
    graphics.lineWidth = 1;
    graphics.moveTo(sample.x - baseRadius * 0.9, sample.y + baseRadius * 0.38);
    graphics.lineTo(sample.x + baseRadius * 0.78, sample.y + baseRadius * 0.18);
    graphics.stroke();
  }

  public static drawCrackBand(graphics: Graphics, crack: CrackData): void {
    const bandPoints = createCrackBandPoints(crack);
    if (bandPoints.length < 3) {
      return;
    }

    drawPolygon(graphics, bandPoints);
    const bandAlpha = crack.type === 'deep' ? 0.16 : 0.07;
    graphics.fillColor = parseHexColor(crack.displayColor, Math.round(255 * crack.displayAlpha * bandAlpha));
    graphics.fill();
  }

  public static drawCrackSegment(
    graphics: Graphics,
    crack: CrackData,
    start: Vec2Data,
    end: Vec2Data,
    width: number,
    options: CrackSegmentStyleOptions = {}
  ): void {
    const alphaScale = options.alphaScale ?? 1;
    const widthScale = options.widthScale ?? 1;
    const mainWidth = Math.max(1, width * widthScale);
    const edgeAlpha = Math.round(255 * crack.displayAlpha * (crack.type === 'deep' ? 0.34 : 0.22) * alphaScale);
    const mainAlpha = Math.round(255 * crack.displayAlpha * (crack.type === 'deep' ? 0.98 : 0.76) * alphaScale);
    const coreAlpha = Math.round(255 * crack.displayAlpha * (crack.type === 'deep' ? 0.45 : 0.16) * alphaScale);

    graphics.strokeColor = crack.type === 'deep' ? new Color(218, 222, 213, edgeAlpha) : new Color(232, 235, 228, edgeAlpha);
    graphics.lineWidth = Math.max(1, mainWidth * (crack.type === 'deep' ? 1.72 : 1.42));
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
    graphics.stroke();

    graphics.strokeColor = parseHexColor(crack.displayColor, mainAlpha);
    graphics.lineWidth = mainWidth;
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
    graphics.stroke();

    graphics.strokeColor = parseHexColor('#000000', coreAlpha);
    graphics.lineWidth = Math.max(1, mainWidth * (crack.type === 'deep' ? 0.34 : 0.2));
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
    graphics.stroke();
  }

  public static drawCrackBranch(graphics: Graphics, crack: CrackData, start: Vec2Data, end: Vec2Data): void {
    const width = Math.max(1, crack.width * (crack.type === 'deep' ? 0.22 : 0.16));
    this.drawCrackSegment(graphics, crack, start, end, width, { alphaScale: crack.type === 'deep' ? 0.68 : 0.5 });
  }

  private static drawInteriorHaze(graphics: Graphics, jade: JadePieceData, profile: MaterialVisualProfile): void {
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / 160));
    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = (hashString(`${jade.id}_haze_${index}`) % 1000) / 1000;
      const radius = jade.sampleCellSize * (2.4 + noise * 3.2);
      const tint = noise > 0.52 ? '#eff6ea' : '#aebba8';
      graphics.circle(sample.x, sample.y, radius);
      graphics.fillColor = parseHexColor(tint, Math.round(profile.hazeAlpha * (0.45 + noise * 0.55)));
      graphics.fill();
    }
  }

  private static drawInteriorGrain(graphics: Graphics, jade: JadePieceData, profile: MaterialVisualProfile): void {
    const maxMarks = Math.max(80, Math.round(260 * profile.grainDensity));
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / maxMarks));

    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = hashString(`${jade.id}_grain_${index}`);
      const radius = 0.7 + (noise % 5) * 0.16;
      const alpha = Math.round(profile.grainAlpha * (0.55 + ((noise >> 4) % 100) / 210));
      graphics.circle(sample.x, sample.y, radius);
      graphics.fillColor = new Color(76, 84, 75, alpha);
      graphics.fill();
    }
  }

  private static drawInteriorHighlights(graphics: Graphics, jade: JadePieceData, profile: MaterialVisualProfile): void {
    if (profile.highlightAlpha <= 0) {
      return;
    }

    const maxMarks = Math.round(90 * profile.highlightDensity);
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / Math.max(1, maxMarks)));

    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = hashString(`${jade.id}_highlight_${index}`);
      const angle = ((noise % 360) * Math.PI) / 180;
      const length = jade.sampleCellSize * (2.4 + ((noise >> 5) % 5) * 0.5);

      graphics.strokeColor = new Color(255, 255, 248, Math.round(profile.highlightAlpha * (0.45 + ((noise >> 9) % 100) / 190)));
      graphics.lineWidth = 1.1;
      graphics.moveTo(sample.x - Math.cos(angle) * length * 0.5, sample.y - Math.sin(angle) * length * 0.5);
      graphics.lineTo(sample.x + Math.cos(angle) * length * 0.5, sample.y + Math.sin(angle) * length * 0.5);
      graphics.stroke();
    }
  }

  private static drawMixedColorAccents(
    graphics: Graphics,
    samples: { x: number; y: number; concentration: number }[],
    sampleCellSize: number,
    regionAlpha: number,
    regionId: string
  ): void {
    const mixedPalette = ['#46b883', '#d9bb55', '#9b6ac8', '#c95652', '#303734'];
    const step = Math.max(1, Math.ceil(samples.length / 110));

    for (let index = 0; index < samples.length; index += step) {
      const sample = samples[index];
      const hash = hashString(`${regionId}_mixed_${index}`);
      const color = mixedPalette[hash % mixedPalette.length];
      const jitter = getJitter(`${regionId}_mixed_jitter_${index}`, sampleCellSize * 0.42);
      graphics.circle(sample.x + jitter.x, sample.y + jitter.y, sampleCellSize * (0.78 + sample.concentration * 0.55));
      graphics.fillColor = parseHexColor(color, Math.round(255 * regionAlpha * clamp(sample.concentration, 0.22, 0.72) * 0.7));
      graphics.fill();
    }
  }

  private static drawSkinSpeckles(graphics: Graphics, jade: JadePieceData): void {
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / 320));

    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = hashString(`${jade.id}_skin_speckle_${index}`);
      const alpha = 18 + (noise % 38);
      const radius = 0.9 + ((noise >> 4) % 5) * 0.22;
      const color = noise % 3 === 0 ? new Color(82, 80, 75, alpha) : new Color(204, 199, 187, alpha);
      graphics.circle(sample.x, sample.y, radius);
      graphics.fillColor = color;
      graphics.fill();
    }
  }

  private static drawSkinScratches(graphics: Graphics, jade: JadePieceData): void {
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / 135));

    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = hashString(`${jade.id}_skin_line_${index}`);
      const angle = ((noise % 180) * Math.PI) / 180;
      const length = 7 + ((noise >> 4) % 9);
      const alpha = 22 + ((noise >> 8) % 34);

      graphics.strokeColor = noise % 2 === 0 ? new Color(88, 85, 78, alpha) : new Color(224, 219, 205, alpha);
      graphics.lineWidth = 1;
      graphics.moveTo(sample.x - Math.cos(angle) * length * 0.5, sample.y - Math.sin(angle) * length * 0.5);
      graphics.lineTo(sample.x + Math.cos(angle) * length * 0.5, sample.y + Math.sin(angle) * length * 0.5);
      graphics.stroke();
    }
  }

  private static drawSkinClouds(graphics: Graphics, jade: JadePieceData): void {
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / 90));

    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = hashString(`${jade.id}_skin_cloud_${index}`);
      const radius = jade.sampleCellSize * (1.9 + (noise % 7) * 0.22);
      graphics.circle(sample.x, sample.y, radius);
      graphics.fillColor = new Color(107, 104, 96, 10 + ((noise >> 7) % 13));
      graphics.fill();
    }
  }
}

function getMaterialProfile(materialQualityId: string): MaterialVisualProfile {
  if (materialQualityId === 'glass') {
    return {
      baseTint: '#f3fbf4',
      tintAmount: 0.24,
      hazeAlpha: 10,
      grainAlpha: 5,
      grainDensity: 0.28,
      highlightAlpha: 42,
      highlightDensity: 1.15,
      strokeWidth: 3.2
    };
  }

  if (materialQualityId === 'icy') {
    return {
      baseTint: '#edf7ef',
      tintAmount: 0.18,
      hazeAlpha: 12,
      grainAlpha: 7,
      grainDensity: 0.4,
      highlightAlpha: 34,
      highlightDensity: 1,
      strokeWidth: 3.5
    };
  }

  if (materialQualityId === 'fine') {
    return {
      baseTint: '#deecd9',
      tintAmount: 0.11,
      hazeAlpha: 16,
      grainAlpha: 10,
      grainDensity: 0.58,
      highlightAlpha: 24,
      highlightDensity: 0.75,
      strokeWidth: 3.8
    };
  }

  if (materialQualityId === 'stone') {
    return {
      baseTint: '#9ea796',
      tintAmount: 0.26,
      hazeAlpha: 30,
      grainAlpha: 28,
      grainDensity: 1.22,
      highlightAlpha: 8,
      highlightDensity: 0.3,
      strokeWidth: 4.6
    };
  }

  return {
    baseTint: '#bcc9b4',
    tintAmount: 0.18,
    hazeAlpha: 22,
    grainAlpha: 18,
    grainDensity: 0.88,
    highlightAlpha: 14,
    highlightDensity: 0.52,
    strokeWidth: 4.2
  };
}

function getSkinBaseColor(materialQualityId: string): Color {
  if (materialQualityId === 'stone') {
    return new Color(126, 126, 119, 255);
  }
  if (materialQualityId === 'glass' || materialQualityId === 'icy') {
    return new Color(151, 154, 145, 250);
  }
  return new Color(139, 142, 134, 255);
}

function drawPolygon(graphics: Graphics, points: Vec2Data[]): void {
  if (points.length === 0) {
    return;
  }

  graphics.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    graphics.lineTo(points[index].x, points[index].y);
  }
  graphics.close();
}

function createCrackBandPoints(crack: CrackData): Vec2Data[] {
  const leftSide: Vec2Data[] = [];
  const rightSide: Vec2Data[] = [];

  for (let index = 0; index < crack.points.length; index += 1) {
    const point = crack.points[index];
    const previous = crack.points[Math.max(0, index - 1)];
    const next = crack.points[Math.min(crack.points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const normalX = -dy / length;
    const normalY = dx / length;
    const t = index / Math.max(1, crack.points.length - 1);
    const centerWeight = Math.sin(Math.PI * clamp(t, 0, 1));
    const width = crack.width * (0.22 + centerWeight * 0.92) * (crack.type === 'deep' ? 1.16 : 0.82);
    const ragged = 0.72 + ((hashString(`${crack.id}_${index}`) % 22) / 100);
    const halfWidth = width * 0.5 * ragged;

    leftSide.push({ x: point.x + normalX * halfWidth, y: point.y + normalY * halfWidth });
    rightSide.push({ x: point.x - normalX * halfWidth * 0.84, y: point.y - normalY * halfWidth * 0.84 });
  }

  return [...leftSide, ...rightSide.reverse()];
}

function getJitter(seed: string, range: number): Vec2Data {
  const hash = hashString(seed);
  const x = (((hash & 0xff) / 255) * 2 - 1) * range;
  const y = ((((hash >> 8) & 0xff) / 255) * 2 - 1) * range;
  return { x, y };
}

function mixHexColor(startHex: string, endHex: string, amount: number, alpha: number): Color {
  const start = parseHexColor(startHex, alpha);
  const end = parseHexColor(endHex, alpha);
  const t = clamp(amount, 0, 1);
  return new Color(
    Math.round(start.r + (end.r - start.r) * t),
    Math.round(start.g + (end.g - start.g) * t),
    Math.round(start.b + (end.b - start.b) * t),
    alpha
  );
}

function parseHexColor(hex: string, alpha: number): Color {
  const normalized = hex.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return new Color(red, green, blue, alpha);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
