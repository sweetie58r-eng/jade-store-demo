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
    graphics.fill();

    this.drawLowFrequencyClouds(graphics, jade, profile);
    this.drawSubsurfaceStrata(graphics, jade, profile);
    this.drawCottonFibers(graphics, jade, profile);
    this.drawFineCottonMist(graphics, jade, profile);
    this.drawInteriorGrain(graphics, jade, profile);
    this.drawInteriorHighlights(graphics, jade, profile);
    this.drawEdgeDepth(graphics, jade, jadeConfig, profile);

    drawPolygon(graphics, jade.outlinePolygon);
    graphics.strokeColor = parseHexColor(jadeConfig.baseStrokeColor, 235);
    graphics.lineWidth = profile.strokeWidth;
    graphics.stroke();
  }

  public static drawColorRegions(graphics: Graphics, jade: JadePieceData, colorConfig: ColorConfig): void {
    const colorById = new Map(colorConfig.colors.map((item) => [item.id, item.displayColor]));
    const layerSettings = [
      { threshold: 0.05, maxSamples: 150, radiusMultiplier: 1.42, alphaMultiplier: 0.13 },
      { threshold: 0.16, maxSamples: 190, radiusMultiplier: 1.08, alphaMultiplier: 0.23 },
      { threshold: 0.32, maxSamples: 230, radiusMultiplier: 0.76, alphaMultiplier: 0.36 },
      { threshold: 0.55, maxSamples: 260, radiusMultiplier: 0.52, alphaMultiplier: 0.52 }
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
          const colorVisual = getColorVisual(region.colorId);
          const alpha = Math.round(
            255 *
              colorConfig.regionAlpha *
              setting.alphaMultiplier *
              colorVisual.alphaBoost *
              clamp(sample.concentration * 1.3, 0.2, 1.0)
          );
          const radius = Math.max(
            1.8,
            jade.sampleCellSize * setting.radiusMultiplier * colorVisual.radiusScale * (0.82 + sample.concentration * 0.38)
          );
          const center = { x: sample.x + jitter.x, y: sample.y + jitter.y };
          const safeRadius = getSafeRadius(center, jade.outlinePolygon, radius, 1.2);
          if (safeRadius <= 0.65) {
            continue;
          }

          drawIrregularBlob(graphics, center, safeRadius, parseHexColor(regionColor, alpha), `${region.id}_${layerIndex}_${index}`);
        }
      }

      this.drawColorRoots(graphics, jade, region.id, region.colorId, regionSamples, regionColor, colorConfig.regionAlpha);

      if (region.colorId === 'mixed') {
        this.drawMixedColorAccents(graphics, jade, regionSamples, jade.sampleCellSize, colorConfig.regionAlpha, region.id);
      }
    }
  }

  public static drawRevealedInterior(
    graphics: Graphics,
    jade: JadePieceData,
    jadeConfig: JadeConfig,
    colorConfig: ColorConfig,
    demoLevelConfig: DemoLevelConfig,
    samples: RevealMaskPointData[],
    includeRevealPowder = false
  ): void {
    const colorById = new Map(colorConfig.colors.map((item) => [item.id, item.displayColor]));

    if (!includeRevealPowder) {
      this.drawJadeBody(graphics, jade, jadeConfig);
      this.drawColorRegions(graphics, jade, colorConfig);
      return;
    }

    for (const sample of samples) {
      this.drawInteriorSample(graphics, sample, jade, jadeConfig, colorConfig, demoLevelConfig, colorById, includeRevealPowder);
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
    jade: JadePieceData,
    jadeConfig: JadeConfig,
    colorConfig: ColorConfig,
    demoLevelConfig: DemoLevelConfig,
    colorById: Map<string, string>
  ): void {
    this.drawInteriorSample(graphics, sample, jade, jadeConfig, colorConfig, demoLevelConfig, colorById, true);
  }

  private static drawInteriorSample(
    graphics: Graphics,
    sample: RevealMaskPointData,
    jade: JadePieceData,
    jadeConfig: JadeConfig,
    colorConfig: ColorConfig,
    demoLevelConfig: DemoLevelConfig,
    colorById: Map<string, string>,
    includeRevealPowder: boolean
  ): void {
    const profile = getMaterialProfile(jade.materialQualityId);
    const baseRadius = Math.max(2.7, demoLevelConfig.reveal.revealCellSize * 0.8);
    const softRadius = getSafeRadius(sample, jade.outlinePolygon, baseRadius * 1.55, 0.6);
    const safeBaseRadius = getSafeRadius(sample, jade.outlinePolygon, baseRadius * 1.02, 0.4);
    const colorRadius = Math.max(2.5, demoLevelConfig.reveal.revealCellSize * 0.78);
    const sampleKey = `${jade.id}_${Math.round(sample.x)}_${Math.round(sample.y)}`;
    const sampleHash = hashString(sampleKey);
    const baseFill = colorToHex(mixHexColor(jadeConfig.baseFillColor, profile.baseTint, profile.tintAmount, 255));

    if (softRadius > 0.5) {
      const cloudTint = sampleHash % 3 === 0 ? '#edf3e7' : baseFill;
      drawIrregularBlob(graphics, sample, softRadius, mixHexColor(baseFill, cloudTint, 0.28, 42), `interior_soft_${sampleKey}`);
    }

    if (safeBaseRadius > 0.5) {
      const localTint = sampleHash % 5 === 0 ? '#f4f8ec' : sampleHash % 5 === 1 ? '#aab5a2' : profile.baseTint;
      drawIrregularBlob(graphics, sample, safeBaseRadius, mixHexColor(baseFill, localTint, 0.08 + (sampleHash % 12) / 180, 218), `interior_base_${sampleKey}`);
    }

    this.drawSampleJadeTexture(graphics, sample, jade, profile, sampleHash);

    if (sample.colorId && sample.concentration > 0.035) {
      this.drawSampleColor(graphics, sample, jade, colorConfig, colorById, colorRadius, sampleKey);
    }

    if (includeRevealPowder) {
      const powderAlpha = 16 + (sampleHash % 16);
      graphics.strokeColor = new Color(235, 239, 231, powderAlpha);
      graphics.lineWidth = 1;
      graphics.moveTo(sample.x - baseRadius * 0.9, sample.y + baseRadius * 0.38);
      graphics.lineTo(sample.x + baseRadius * 0.78, sample.y + baseRadius * 0.18);
      graphics.stroke();
    }
  }

  private static drawSampleJadeTexture(
    graphics: Graphics,
    sample: RevealMaskPointData,
    jade: JadePieceData,
    profile: MaterialVisualProfile,
    sampleHash: number
  ): void {
    const distance = getDistanceToOutline(sample, jade.outlinePolygon);
    if (distance < jade.sampleCellSize * 0.9) {
      return;
    }

    if (sampleHash % 2 === 0) {
      const angle = ((sampleHash % 180) * Math.PI) / 180;
      const length = Math.min(distance * 1.1, jade.sampleCellSize * (1.3 + ((sampleHash >> 6) % 8) * 0.18));
      const alpha = Math.round((profile.hazeAlpha + profile.highlightAlpha + 8) * (0.18 + ((sampleHash >> 11) % 60) / 380));
      drawSoftFiber(graphics, sample, angle, length, new Color(246, 249, 240, alpha), 0.55 + ((sampleHash >> 15) % 3) * 0.18);
    }

    if (sampleHash % 5 === 0) {
      const radius = getSafeRadius(sample, jade.outlinePolygon, 0.55 + ((sampleHash >> 4) % 4) * 0.08, 0.2);
      if (radius > 0.18) {
        graphics.circle(sample.x, sample.y, radius);
        graphics.fillColor = new Color(67, 76, 66, Math.round(profile.grainAlpha * 0.55));
        graphics.fill();
      }
    }
  }

  private static drawSampleColor(
    graphics: Graphics,
    sample: RevealMaskPointData,
    jade: JadePieceData,
    colorConfig: ColorConfig,
    colorById: Map<string, string>,
    colorRadius: number,
    sampleKey: string
  ): void {
    if (!sample.colorId) {
      return;
    }

    const regionColor = colorById.get(sample.colorId) ?? '#ff00ff';
    const colorVisual = getColorVisual(sample.colorId);
    const alpha = Math.round(255 * colorConfig.regionAlpha * colorVisual.alphaBoost * clamp(sample.concentration * 1.18, 0.14, 1) * 1.08);
    const radius = getSafeRadius(sample, jade.outlinePolygon, colorRadius * colorVisual.radiusScale * (1.0 + sample.concentration * 0.24), 0.5);

    if (radius > 0.5) {
      drawIrregularBlob(graphics, sample, radius * 1.18, parseHexColor(regionColor, Math.round(alpha * 0.24)), `interior_color_soft_${sampleKey}`);
      drawIrregularBlob(graphics, sample, radius, parseHexColor(regionColor, alpha), `interior_color_${sampleKey}`);
    }

    if (sample.concentration > 0.36) {
      const noise = hashString(`interior_root_${sampleKey}`);
      const distance = getDistanceToOutline(sample, jade.outlinePolygon);
      const angle = colorVisual.rootAngle + (((noise % 80) - 40) * Math.PI) / 180;
      const length = Math.min(distance * 1.05, jade.sampleCellSize * (1.2 + sample.concentration * 1.8));
      if (length > 1) {
        drawSoftFiber(
          graphics,
          sample,
          angle,
          length,
          mixHexColor(regionColor, colorVisual.rootTint, colorVisual.rootTintAmount, Math.round(alpha * colorVisual.rootAlpha)),
          Math.max(0.55, colorVisual.rootWidth * 0.72)
        );
      }
    }
  }

  public static drawCrackBand(graphics: Graphics, crack: CrackData): void {
    const bandPoints = createCrackBandPoints(crack);
    if (bandPoints.length < 3) {
      return;
    }

    drawPolygon(graphics, bandPoints);
    const bandAlpha = crack.type === 'deep' ? 0.055 : 0.035;
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
    const edgeAlpha = Math.round(255 * crack.displayAlpha * (crack.type === 'deep' ? 0.22 : 0.15) * alphaScale);
    const mainAlpha = Math.round(255 * crack.displayAlpha * (crack.type === 'deep' ? 0.56 : 0.4) * alphaScale);
    const coreAlpha = Math.round(255 * crack.displayAlpha * (crack.type === 'deep' ? 0.18 : 0.06) * alphaScale);

    graphics.strokeColor = crack.type === 'deep' ? new Color(218, 222, 213, edgeAlpha) : new Color(232, 235, 228, edgeAlpha);
    graphics.lineWidth = Math.max(1, mainWidth * (crack.type === 'deep' ? 1.32 : 1.16));
    drawRaggedLine(graphics, start, end, `${crack.id}_edge_${start.x}_${start.y}_${end.x}_${end.y}`, mainWidth * 0.18);

    graphics.strokeColor = parseHexColor(crack.displayColor, mainAlpha);
    graphics.lineWidth = Math.max(1, mainWidth * (crack.type === 'deep' ? 0.68 : 0.58));
    drawRaggedLine(graphics, start, end, `${crack.id}_main_${start.x}_${start.y}_${end.x}_${end.y}`, mainWidth * 0.26);

    graphics.strokeColor = parseHexColor('#000000', coreAlpha);
    graphics.lineWidth = Math.max(1, mainWidth * (crack.type === 'deep' ? 0.11 : 0.08));
    drawRaggedLine(graphics, start, end, `${crack.id}_core_${start.x}_${start.y}_${end.x}_${end.y}`, mainWidth * 0.18);
  }

  public static drawCrackBranch(graphics: Graphics, crack: CrackData, start: Vec2Data, end: Vec2Data): void {
    const width = Math.max(1, crack.width * (crack.type === 'deep' ? 0.22 : 0.16));
    this.drawCrackSegment(graphics, crack, start, end, width, { alphaScale: crack.type === 'deep' ? 0.68 : 0.5 });
  }

  private static drawLowFrequencyClouds(graphics: Graphics, jade: JadePieceData, profile: MaterialVisualProfile): void {
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / 125));
    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = hashString(`${jade.id}_cloud_${index}`);
      const distance = getDistanceToOutline(sample, jade.outlinePolygon);
      if (distance < jade.sampleCellSize * 1.4) {
        continue;
      }

      const angle = ((noise % 160) - 80) * (Math.PI / 180);
      const length = Math.min(distance * 1.35, jade.sampleCellSize * (5.2 + ((noise >> 4) % 8) * 0.45));
      const alpha = Math.round(profile.hazeAlpha * (0.35 + ((noise >> 9) % 100) / 210));
      const tint = noise % 2 === 0 ? '#edf4e8' : '#9eab99';
      drawSoftFiber(graphics, sample, angle, length, parseHexColor(tint, alpha), 2.2);
    }
  }

  private static drawSubsurfaceStrata(graphics: Graphics, jade: JadePieceData, profile: MaterialVisualProfile): void {
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / 90));
    const center = getCentroid(jade.outlinePolygon);

    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = hashString(`${jade.id}_strata_${index}`);
      const distance = getDistanceToOutline(sample, jade.outlinePolygon);
      if (distance < jade.sampleCellSize * 2.3) {
        continue;
      }

      const toCenterAngle = Math.atan2(center.y - sample.y, center.x - sample.x);
      const angle = toCenterAngle + Math.PI * 0.5 + (((noise % 55) - 27) * Math.PI) / 180;
      const length = Math.min(distance * 1.55, jade.sampleCellSize * (5.8 + ((noise >> 4) % 11) * 0.36));
      const alpha = Math.round((profile.hazeAlpha + profile.highlightAlpha) * (0.18 + ((noise >> 8) % 90) / 430));
      const color = noise % 3 === 0 ? new Color(83, 97, 80, alpha) : new Color(244, 248, 237, alpha);
      drawSoftFiber(graphics, sample, angle, length, color, 0.9 + ((noise >> 12) % 3) * 0.38);
    }
  }

  private static drawCottonFibers(graphics: Graphics, jade: JadePieceData, profile: MaterialVisualProfile): void {
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / 210));

    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = hashString(`${jade.id}_cotton_${index}`);
      const distance = getDistanceToOutline(sample, jade.outlinePolygon);
      if (distance < jade.sampleCellSize) {
        continue;
      }

      const angle = ((noise % 360) * Math.PI) / 180;
      const length = Math.min(distance * 1.25, jade.sampleCellSize * (2.2 + ((noise >> 3) % 9) * 0.28));
      const alpha = Math.round((profile.hazeAlpha + profile.grainAlpha) * 0.42);
      drawSoftFiber(graphics, sample, angle, length, new Color(245, 248, 238, alpha), 1);
    }
  }

  private static drawFineCottonMist(graphics: Graphics, jade: JadePieceData, profile: MaterialVisualProfile): void {
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / 220));

    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = hashString(`${jade.id}_fine_cotton_${index}`);
      const distance = getDistanceToOutline(sample, jade.outlinePolygon);
      if (distance < jade.sampleCellSize * 1.4) {
        continue;
      }

      const angle = ((noise % 360) * Math.PI) / 180;
      const length = Math.min(distance * 1.15, jade.sampleCellSize * (1.4 + ((noise >> 5) % 7) * 0.22));
      const alpha = Math.round((profile.hazeAlpha + 8) * (0.22 + ((noise >> 11) % 70) / 360));
      drawSoftFiber(graphics, sample, angle, length, new Color(247, 250, 241, alpha), 0.55);
    }
  }

  private static drawColorRoots(
    graphics: Graphics,
    jade: JadePieceData,
    regionId: string,
    colorId: string,
    samples: { x: number; y: number; concentration: number }[],
    regionColor: string,
    regionAlpha: number
  ): void {
    const strongSamples = samples.filter((sample) => sample.concentration > 0.36);
    const visual = getColorVisual(colorId);
    const step = Math.max(1, Math.ceil(strongSamples.length / 64));

    for (let index = 0; index < strongSamples.length; index += step) {
      const sample = strongSamples[index];
      const noise = hashString(`${regionId}_root_${index}`);
      const distance = getDistanceToOutline(sample, jade.outlinePolygon);
      if (distance < jade.sampleCellSize * 1.2) {
        continue;
      }

      const angle = visual.rootAngle + (((noise % 80) - 40) * Math.PI) / 180;
      const length = Math.min(distance * 1.05, jade.sampleCellSize * (1.6 + sample.concentration * 2.4 + ((noise >> 6) % 4) * 0.28));
      const alpha = Math.round(255 * regionAlpha * visual.rootAlpha * clamp(sample.concentration, 0.28, 0.92));
      const rootColor = mixHexColor(regionColor, visual.rootTint, visual.rootTintAmount, alpha);

      drawSoftFiber(graphics, sample, angle, length, rootColor, visual.rootWidth);
      if (sample.concentration > 0.62) {
        drawSoftFiber(
          graphics,
          { x: sample.x + Math.cos(angle + Math.PI * 0.5) * 1.1, y: sample.y + Math.sin(angle + Math.PI * 0.5) * 1.1 },
          angle + (((noise >> 9) % 25) - 12) * (Math.PI / 180),
          length * 0.55,
          mixHexColor(regionColor, '#ffffff', 0.18, Math.round(alpha * 0.42)),
          Math.max(0.55, visual.rootWidth * 0.56)
        );
      }
    }
  }

  private static drawInteriorGrain(graphics: Graphics, jade: JadePieceData, profile: MaterialVisualProfile): void {
    const maxMarks = Math.max(80, Math.round(260 * profile.grainDensity));
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / maxMarks));

    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = hashString(`${jade.id}_grain_${index}`);
      const radius = Math.min(getSafeRadius(sample, jade.outlinePolygon, 0.72 + (noise % 4) * 0.1, 0.2), 1.1);
      if (radius <= 0.22) {
        continue;
      }
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
      const distance = getDistanceToOutline(sample, jade.outlinePolygon);
      if (distance < jade.sampleCellSize * 1.2) {
        continue;
      }
      const angle = ((noise % 360) * Math.PI) / 180;
      const length = Math.min(distance * 1.2, jade.sampleCellSize * (2.4 + ((noise >> 5) % 5) * 0.5));

      graphics.strokeColor = new Color(255, 255, 248, Math.round(profile.highlightAlpha * (0.45 + ((noise >> 9) % 100) / 190)));
      graphics.lineWidth = 1.1;
      graphics.moveTo(sample.x - Math.cos(angle) * length * 0.5, sample.y - Math.sin(angle) * length * 0.5);
      graphics.lineTo(sample.x + Math.cos(angle) * length * 0.5, sample.y + Math.sin(angle) * length * 0.5);
      graphics.stroke();
    }
  }

  private static drawMixedColorAccents(
    graphics: Graphics,
    jade: JadePieceData,
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
      const center = { x: sample.x + jitter.x, y: sample.y + jitter.y };
      const radius = getSafeRadius(center, jade.outlinePolygon, sampleCellSize * (0.56 + sample.concentration * 0.38), 1);
      if (radius <= 0.5) {
        continue;
      }
      drawIrregularBlob(
        graphics,
        center,
        radius,
        parseHexColor(color, Math.round(255 * regionAlpha * clamp(sample.concentration, 0.22, 0.68) * 0.62)),
        `${regionId}_mixed_blob_${index}`,
        7
      );
    }
  }

  private static drawSkinSpeckles(graphics: Graphics, jade: JadePieceData): void {
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / 320));

    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const noise = hashString(`${jade.id}_skin_speckle_${index}`);
      const alpha = 18 + (noise % 38);
      const radius = getSafeRadius(sample, jade.outlinePolygon, 0.72 + ((noise >> 4) % 5) * 0.14, 0.2);
      if (radius <= 0.2) {
        continue;
      }
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
      const distance = getDistanceToOutline(sample, jade.outlinePolygon);
      if (distance < jade.sampleCellSize * 0.9) {
        continue;
      }
      const angle = ((noise % 180) * Math.PI) / 180;
      const length = Math.min(distance * 1.1, 7 + ((noise >> 4) % 9));
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
      const distance = getDistanceToOutline(sample, jade.outlinePolygon);
      if (distance < jade.sampleCellSize * 1.8) {
        continue;
      }
      const angle = ((noise % 360) * Math.PI) / 180;
      const length = Math.min(distance * 1.2, jade.sampleCellSize * (3.2 + (noise % 7) * 0.22));
      drawSoftFiber(graphics, sample, angle, length, new Color(107, 104, 96, 16 + ((noise >> 7) % 13)), 2.4);
    }
  }

  private static drawEdgeDepth(graphics: Graphics, jade: JadePieceData, jadeConfig: JadeConfig, profile: MaterialVisualProfile): void {
    const center = getCentroid(jade.outlinePolygon);
    const insetOne = insetPolygon(jade.outlinePolygon, center, 4.2);
    const insetTwo = insetPolygon(jade.outlinePolygon, center, 9.5);

    drawPolyline(graphics, insetOne, true);
    graphics.strokeColor = parseHexColor(jadeConfig.baseStrokeColor, jade.materialQualityId === 'stone' ? 92 : 64);
    graphics.lineWidth = Math.max(1.6, profile.strokeWidth * 0.82);
    graphics.stroke();

    drawPolyline(graphics, insetTwo, true);
    graphics.strokeColor = new Color(255, 255, 244, jade.materialQualityId === 'stone' ? 18 : 46);
    graphics.lineWidth = 1.7;
    graphics.stroke();

    const upperHighlight = insetPolygon(jade.outlinePolygon, { x: center.x - 36, y: center.y + 48 }, 7.8);
    drawOpenArcLikePolyline(graphics, upperHighlight, 0.08, 0.48);
    graphics.strokeColor = new Color(255, 255, 246, jade.materialQualityId === 'stone' ? 18 : 42);
    graphics.lineWidth = 2;
    graphics.stroke();
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

function drawPolyline(graphics: Graphics, points: Vec2Data[], closePath: boolean): void {
  if (points.length === 0) {
    return;
  }

  graphics.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    graphics.lineTo(points[index].x, points[index].y);
  }
  if (closePath) {
    graphics.close();
  }
}

function drawOpenArcLikePolyline(graphics: Graphics, points: Vec2Data[], startRatio: number, endRatio: number): void {
  if (points.length < 2) {
    return;
  }

  const startIndex = Math.floor(points.length * clamp(startRatio, 0, 1));
  const endIndex = Math.max(startIndex + 1, Math.floor(points.length * clamp(endRatio, 0, 1)));
  graphics.moveTo(points[startIndex].x, points[startIndex].y);
  for (let index = startIndex + 1; index <= endIndex && index < points.length; index += 1) {
    graphics.lineTo(points[index].x, points[index].y);
  }
}

function drawIrregularBlob(graphics: Graphics, center: Vec2Data, radius: number, color: Color, seed: string, pointCount = 9): void {
  if (radius <= 0) {
    return;
  }

  const hash = hashString(seed);
  const count = Math.max(5, pointCount);
  graphics.moveTo(center.x + radius, center.y);
  for (let index = 0; index <= count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const wobbleHash = hashString(`${hash}_${index}`);
    const wobble = 0.72 + (wobbleHash % 52) / 100;
    const localRadius = radius * wobble;
    const x = center.x + Math.cos(angle) * localRadius;
    const y = center.y + Math.sin(angle) * localRadius;
    if (index === 0) {
      graphics.moveTo(x, y);
    } else {
      graphics.lineTo(x, y);
    }
  }
  graphics.close();
  graphics.fillColor = color;
  graphics.fill();
}

function drawSoftFiber(graphics: Graphics, center: Vec2Data, angle: number, length: number, color: Color, width: number): void {
  if (length <= 0) {
    return;
  }

  const half = length * 0.5;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  graphics.strokeColor = color;
  graphics.lineWidth = width;
  graphics.moveTo(center.x - dx * half, center.y - dy * half);
  graphics.lineTo(center.x + dx * half, center.y + dy * half);
  graphics.stroke();
}

function drawRaggedLine(graphics: Graphics, start: Vec2Data, end: Vec2Data, seed: string, offset: number): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / length, y: dx / length };
  const hash = hashString(seed);
  const midOneT = 0.34 + ((hash & 0xff) / 255 - 0.5) * 0.08;
  const midTwoT = 0.68 + (((hash >> 8) & 0xff) / 255 - 0.5) * 0.08;
  const midOneOffset = (((hash >> 16) & 0xff) / 255 - 0.5) * offset;
  const midTwoOffset = (((hash >> 24) & 0xff) / 255 - 0.5) * offset;
  const midOne = {
    x: start.x + dx * midOneT + normal.x * midOneOffset,
    y: start.y + dy * midOneT + normal.y * midOneOffset
  };
  const midTwo = {
    x: start.x + dx * midTwoT + normal.x * midTwoOffset,
    y: start.y + dy * midTwoT + normal.y * midTwoOffset
  };

  graphics.moveTo(start.x, start.y);
  graphics.lineTo(midOne.x, midOne.y);
  graphics.lineTo(midTwo.x, midTwo.y);
  graphics.lineTo(end.x, end.y);
  graphics.stroke();
}

function getSafeRadius(center: Vec2Data, outline: Vec2Data[], desiredRadius: number, margin: number): number {
  if (!isPointInPolygon(center, outline)) {
    return 0;
  }
  return Math.max(0, Math.min(desiredRadius, getDistanceToOutline(center, outline) - margin));
}

function getDistanceToOutline(point: Vec2Data, outline: Vec2Data[]): number {
  let minDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < outline.length; index += 1) {
    const start = outline[index];
    const end = outline[(index + 1) % outline.length];
    minDistance = Math.min(minDistance, distanceToSegment(point, start, end));
  }
  return minDistance;
}

function distanceToSegment(point: Vec2Data, start: Vec2Data, end: Vec2Data): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  const projectedX = start.x + dx * t;
  const projectedY = start.y + dy * t;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

function isPointInPolygon(point: Vec2Data, polygon: Vec2Data[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function getCentroid(points: Vec2Data[]): Vec2Data {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  const sum = points.reduce(
    (accumulator, point) => ({ x: accumulator.x + point.x, y: accumulator.y + point.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function getColorVisual(colorId: string): {
  alphaBoost: number;
  radiusScale: number;
  rootAlpha: number;
  rootAngle: number;
  rootTint: string;
  rootTintAmount: number;
  rootWidth: number;
} {
  if (colorId === 'yellow') {
    return {
      alphaBoost: 1.45,
      radiusScale: 0.92,
      rootAlpha: 0.62,
      rootAngle: -0.22,
      rootTint: '#b98518',
      rootTintAmount: 0.28,
      rootWidth: 1.6
    };
  }

  if (colorId === 'purple') {
    return {
      alphaBoost: 1.18,
      radiusScale: 0.88,
      rootAlpha: 0.52,
      rootAngle: 0.48,
      rootTint: '#5f328a',
      rootTintAmount: 0.24,
      rootWidth: 1.45
    };
  }

  if (colorId === 'red') {
    return {
      alphaBoost: 1.2,
      radiusScale: 0.9,
      rootAlpha: 0.56,
      rootAngle: -0.68,
      rootTint: '#8c2d27',
      rootTintAmount: 0.28,
      rootWidth: 1.5
    };
  }

  if (colorId === 'ink') {
    return {
      alphaBoost: 1.06,
      radiusScale: 0.96,
      rootAlpha: 0.46,
      rootAngle: 0.18,
      rootTint: '#101716',
      rootTintAmount: 0.38,
      rootWidth: 1.3
    };
  }

  return {
    alphaBoost: 1,
    radiusScale: 0.96,
    rootAlpha: 0.4,
    rootAngle: 0.32,
    rootTint: '#1d6d4c',
    rootTintAmount: 0.18,
    rootWidth: 1.2
  };
}

function insetPolygon(points: Vec2Data[], center: Vec2Data, distance: number): Vec2Data[] {
  return points.map((point) => {
    const dx = center.x - point.x;
    const dy = center.y - point.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    return {
      x: point.x + (dx / length) * distance,
      y: point.y + (dy / length) * distance
    };
  });
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

function colorToHex(color: Color): string {
  return `#${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(color.b)}`;
}

function toHexByte(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
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
