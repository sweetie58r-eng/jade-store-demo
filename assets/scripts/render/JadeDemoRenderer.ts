import { Color, Component, Graphics, Label, Node, UITransform, Vec3, _decorator } from 'cc';

import { ColorConfig, DemoLevelConfig, JadeConfig } from '../config/GameConfigTypes';
import { CrackData, JadePieceData, RevealMaskPointData, Vec2Data } from '../data/JadeTypes';
import { JadeMaterialRenderer } from './JadeMaterialRenderer';

const { ccclass, property } = _decorator;
const PORTRAIT_WIDTH = 720;
const PORTRAIT_HEIGHT = 1280;

@ccclass('JadeDemoRenderer')
export class JadeDemoRenderer extends Component {
  @property(Graphics)
  public graphics: Graphics | null = null;

  @property(Label)
  public seedLabel: Label | null = null;

  private revealSessionKey = '';
  private revealStaticGraphics: Graphics | null = null;
  private revealFillGraphics: Graphics | null = null;
  private revealCrackGraphics: Graphics | null = null;
  private revealBrushGraphics: Graphics | null = null;
  private drawnRevealKeys = new Set<string>();
  private drawnCrackSegmentKeys = new Set<string>();
  private revealedCrackMaskIndex = new Map<string, RevealMaskPointData[]>();
  private revealCrackIndexCellSize = 4;

  public render(jade: JadePieceData, jadeConfig: JadeConfig, colorConfig: ColorConfig, demoLevelConfig: DemoLevelConfig): void {
    this.clearRevealLayers();
    const graphics = this.getGraphics();
    console.log(`[JadeDemoRenderer] render called on node: ${this.node.name}`);
    graphics.clear();

    this.drawPortraitStage(graphics);
    this.drawFullyRevealedJade(graphics, jade, jadeConfig, colorConfig, demoLevelConfig);
    console.log('[JadeDemoBootstrap] jade layer drawn');
    console.log('[JadeDemoBootstrap] color regions drawn');
    this.drawCrackSegmentsOnly(graphics, jade);
    console.log('[JadeDemoBootstrap] cracks drawn');
    this.drawSampleDebug(graphics, jade, colorConfig, demoLevelConfig);
    console.log('[JadeDemoBootstrap] sample grid drawn');

    if (this.seedLabel) {
      this.seedLabel.string = `Seed: ${jade.seed} | Sample: ${jade.sampleCellSize}px | Samples: ${jade.sampleGrid.length}`;
    }
    console.log('[JadeDemoRenderer] draw completed');
  }

  public renderReveal(
    jade: JadePieceData,
    jadeConfig: JadeConfig,
    colorConfig: ColorConfig,
    demoLevelConfig: DemoLevelConfig,
    changedRevealPoints: RevealMaskPointData[],
    brushPoint: Vec2Data | null,
    brushRadius: number
  ): void {
    this.ensureRevealLayers(jade, jadeConfig);

    const fillGraphics = this.revealFillGraphics;
    const crackGraphics = this.revealCrackGraphics;
    const brushGraphics = this.revealBrushGraphics;
    if (!fillGraphics || !crackGraphics || !brushGraphics) {
      return;
    }

    this.drawRevealDelta(fillGraphics, jade, jadeConfig, colorConfig, demoLevelConfig, changedRevealPoints);
    this.indexRevealedMaskForCracks(changedRevealPoints, demoLevelConfig.reveal.revealCellSize);
    if (changedRevealPoints.length > 0) {
      this.drawRevealedCracks(crackGraphics, jade, demoLevelConfig);
    }

    brushGraphics.clear();
    if (brushPoint) {
      this.drawBrushCursor(brushGraphics, brushPoint, brushRadius);
    }

    if (this.seedLabel) {
      this.seedLabel.string = '';
    }

    this.arrangeRevealLayerOrder();
  }

  private ensureRevealLayers(jade: JadePieceData, jadeConfig: JadeConfig): void {
    const sessionKey = `${jade.id}_${jade.outlinePolygon.length}`;
    if (this.revealSessionKey === sessionKey && this.revealStaticGraphics && this.revealFillGraphics && this.revealCrackGraphics && this.revealBrushGraphics) {
      return;
    }

    this.getGraphics().clear();
    this.clearRevealLayers();
    this.revealSessionKey = sessionKey;
    this.drawnRevealKeys.clear();
    this.drawnCrackSegmentKeys.clear();

    this.revealStaticGraphics = this.createRevealLayer('RevealStaticLayer', 0);
    this.revealFillGraphics = this.createRevealLayer('RevealFillLayer', 1);
    this.revealCrackGraphics = this.createRevealLayer('RevealCrackLayer', 2);
    this.revealBrushGraphics = this.createRevealLayer('RevealBrushLayer', 3);
    this.arrangeRevealLayerOrder();

    this.drawPortraitStage(this.revealStaticGraphics);
    this.drawJadeSkin(this.revealStaticGraphics, jade);
    this.drawJadeSkinOutline(this.revealStaticGraphics, jade, jadeConfig);
  }

  private createRevealLayer(name: string, z: number): Graphics {
    const node = new Node(name);
    this.node.addChild(node);
    node.layer = this.node.layer;
    node.setPosition(new Vec3(0, 0, z));
    node.addComponent(UITransform).setContentSize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    return node.addComponent(Graphics);
  }

  private clearRevealLayers(): void {
    for (const name of ['RevealStaticLayer', 'RevealFillLayer', 'RevealCrackLayer', 'RevealBrushLayer']) {
      const child = this.node.getChildByName(name);
      if (child) {
        child.destroy();
      }
    }

    this.revealSessionKey = '';
    this.revealStaticGraphics = null;
    this.revealFillGraphics = null;
    this.revealCrackGraphics = null;
    this.revealBrushGraphics = null;
    this.drawnRevealKeys.clear();
    this.drawnCrackSegmentKeys.clear();
    this.revealedCrackMaskIndex.clear();
  }

  private arrangeRevealLayerOrder(): void {
    const orderedLayerNames = ['RevealStaticLayer', 'RevealFillLayer', 'RevealCrackLayer', 'RevealBrushLayer'];
    for (let index = 0; index < orderedLayerNames.length; index += 1) {
      const child = this.node.getChildByName(orderedLayerNames[index]);
      if (child) {
        child.setSiblingIndex(index);
      }
    }
  }

  private getGraphics(): Graphics {
    if (this.graphics) {
      return this.graphics;
    }

    const existing = this.getComponent(Graphics);
    if (existing) {
      this.graphics = existing;
      return existing;
    }

    this.graphics = this.node.addComponent(Graphics);
    return this.graphics;
  }

  private drawJadeSkin(graphics: Graphics, jade: JadePieceData): void {
    JadeMaterialRenderer.drawJadeSkin(graphics, jade);
  }

  private drawJadeSkinOutline(graphics: Graphics, jade: JadePieceData, jadeConfig: JadeConfig): void {
    this.drawPolygon(graphics, jade.outlinePolygon);
    graphics.strokeColor = parseHexColor(jadeConfig.baseStrokeColor, 255);
    graphics.lineWidth = 5;
    graphics.stroke();
  }

  private drawPortraitStage(graphics: Graphics): void {
    graphics.fillColor = new Color(154, 143, 136, 255);
    graphics.rect(-PORTRAIT_WIDTH * 0.5, -PORTRAIT_HEIGHT * 0.5, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    graphics.fill();
  }

  private drawFullyRevealedJade(
    graphics: Graphics,
    jade: JadePieceData,
    jadeConfig: JadeConfig,
    colorConfig: ColorConfig,
    demoLevelConfig: DemoLevelConfig
  ): void {
    JadeMaterialRenderer.drawRevealedInterior(graphics, jade, jadeConfig, colorConfig, demoLevelConfig, jade.sampleGrid);
    this.drawJadeSkinOutline(graphics, jade, jadeConfig);
  }

  private drawRevealDelta(
    graphics: Graphics,
    jade: JadePieceData,
    jadeConfig: JadeConfig,
    colorConfig: ColorConfig,
    demoLevelConfig: DemoLevelConfig,
    changedRevealPoints: RevealMaskPointData[]
  ): void {
    if (changedRevealPoints.length === 0) {
      return;
    }

    const colorById = new Map(colorConfig.colors.map((item) => [item.id, item.displayColor]));

    for (const sample of changedRevealPoints) {
      const key = getMaskKey(sample);
      if (this.drawnRevealKeys.has(key)) {
        continue;
      }

      JadeMaterialRenderer.drawRevealPoint(graphics, sample, jade, jadeConfig, colorConfig, demoLevelConfig, colorById);
      this.drawnRevealKeys.add(key);
    }
  }

  private drawSampleDebug(graphics: Graphics, jade: JadePieceData, colorConfig: ColorConfig, demoLevelConfig: DemoLevelConfig): void {
    if (!demoLevelConfig.sampleGrid.debugShowSamples) {
      return;
    }

    const maxSamples = demoLevelConfig.sampleGrid.maxDebugSamples;
    const step = Math.max(1, Math.ceil(jade.sampleGrid.length / maxSamples));
    const colorById = new Map(colorConfig.colors.map((item) => [item.id, item.displayColor]));

    for (let index = 0; index < jade.sampleGrid.length; index += step) {
      const sample = jade.sampleGrid[index];
      const color = sample.colorId ? colorById.get(sample.colorId) ?? '#ff00ff' : '#ffffff';
      graphics.circle(sample.x, sample.y, 0.9);
      const configuredAlpha = Math.round(255 * (demoLevelConfig.sampleGrid.debugSampleAlpha ?? 0.16));
      graphics.fillColor = parseHexColor(color, sample.colorId ? configuredAlpha : Math.round(configuredAlpha * 0.22));
      graphics.fill();
    }
  }

  private drawCracks(graphics: Graphics, jade: JadePieceData): void {
    for (const crack of jade.cracks) {
      if (crack.points.length < 2) {
        continue;
      }

      this.drawCrackBand(graphics, crack);
      this.drawCrackSegments(graphics, crack);
      this.drawCrackBranches(graphics, crack);
    }
  }

  private drawCrackSegmentsOnly(graphics: Graphics, jade: JadePieceData): void {
    for (const crack of jade.cracks) {
      if (crack.points.length < 2) {
        continue;
      }

      this.drawCrackSegments(graphics, crack);
    }
  }

  private indexRevealedMaskForCracks(changedRevealPoints: RevealMaskPointData[], revealCellSize: number): void {
    this.revealCrackIndexCellSize = Math.max(2, revealCellSize * 1.25);

    for (const sample of changedRevealPoints) {
      const key = getRevealIndexKey(sample, this.revealCrackIndexCellSize);
      const bucket = this.revealedCrackMaskIndex.get(key);
      if (bucket) {
        bucket.push(sample);
      } else {
        this.revealedCrackMaskIndex.set(key, [sample]);
      }
    }
  }

  private drawRevealedCracks(graphics: Graphics, jade: JadePieceData, demoLevelConfig: DemoLevelConfig): void {
    for (const crack of jade.cracks) {
      if (crack.points.length < 2) {
        continue;
      }

      this.drawRevealedCrackSegments(graphics, crack, demoLevelConfig);
    }
  }

  private drawRevealedCrackSegments(
    graphics: Graphics,
    crack: CrackData,
    demoLevelConfig: DemoLevelConfig
  ): void {
    if (this.revealedCrackMaskIndex.size === 0) {
      return;
    }

    const revealCellSize = demoLevelConfig.reveal.revealCellSize;
    const revealDistance = Math.max(1.8, revealCellSize * 0.82);
    const subSegmentLength = Math.max(1.4, revealCellSize * 0.48);

    for (let index = 0; index < crack.points.length - 1; index += 1) {
      const start = crack.points[index];
      const end = crack.points[index + 1];
      const segmentLength = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
      const subSteps = Math.max(1, Math.ceil(segmentLength / subSegmentLength));
      const t = (index + 0.5) / Math.max(1, crack.points.length - 1);
      const rawWidth = getCrackWidthAt(crack, t) * (index % 2 === 0 ? 1.05 : 0.86);
      const width = rawWidth * (crack.type === 'deep' ? 0.72 : 0.56);

      for (let step = 0; step < subSteps; step += 1) {
        const stepStartT = step / subSteps;
        const stepEndT = (step + 1) / subSteps;
        const stepStart = lerpPoint(start, end, stepStartT);
        const stepEnd = lerpPoint(start, end, stepEndT);
        const midpoint = lerpPoint(start, end, (stepStartT + stepEndT) * 0.5);

        if (!this.isCrackSubSegmentRevealed(stepStart, midpoint, stepEnd, revealDistance)) {
          continue;
        }

        const segmentKey = `${crack.id}_${index}_${step}`;
        if (this.drawnCrackSegmentKeys.has(segmentKey)) {
          continue;
        }

        JadeMaterialRenderer.drawCrackSegment(graphics, crack, stepStart, stepEnd, width);
        this.drawnCrackSegmentKeys.add(segmentKey);
      }
    }
  }

  private isCrackSubSegmentRevealed(start: Vec2Data, midpoint: Vec2Data, end: Vec2Data, revealDistance: number): boolean {
    return (
      this.isPointNearRevealedMask(start, revealDistance) &&
      this.isPointNearRevealedMask(midpoint, revealDistance) &&
      this.isPointNearRevealedMask(end, revealDistance)
    );
  }

  private isPointNearRevealedMask(point: Vec2Data, maxDistance: number): boolean {
    const centerX = Math.floor(point.x / this.revealCrackIndexCellSize);
    const centerY = Math.floor(point.y / this.revealCrackIndexCellSize);
    const radiusInCells = Math.ceil(maxDistance / this.revealCrackIndexCellSize) + 1;

    for (let cellY = centerY - radiusInCells; cellY <= centerY + radiusInCells; cellY += 1) {
      for (let cellX = centerX - radiusInCells; cellX <= centerX + radiusInCells; cellX += 1) {
        const bucket = this.revealedCrackMaskIndex.get(`${cellX}:${cellY}`);
        if (!bucket) {
          continue;
        }

        for (const sample of bucket) {
          if (Math.hypot(sample.x - point.x, sample.y - point.y) <= maxDistance) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private drawBrushCursor(graphics: Graphics, point: Vec2Data, radius: number): void {
    graphics.strokeColor = new Color(190, 230, 255, 145);
    graphics.fillColor = new Color(190, 230, 255, 14);
    graphics.lineWidth = 2;
    graphics.circle(point.x, point.y, radius);
    graphics.fill();
    graphics.stroke();
  }

  private drawCrackBand(graphics: Graphics, crack: CrackData): void {
    JadeMaterialRenderer.drawCrackBand(graphics, crack);
  }

  private drawCrackSegments(graphics: Graphics, crack: CrackData): void {
    for (let index = 0; index < crack.points.length - 1; index += 1) {
      const start = crack.points[index];
      const end = crack.points[index + 1];
      const t = (index + 0.5) / Math.max(1, crack.points.length - 1);
      const rawWidth = getCrackWidthAt(crack, t) * (index % 2 === 0 ? 1.05 : 0.86);
      const width = rawWidth * (crack.type === 'deep' ? 0.72 : 0.56);

      JadeMaterialRenderer.drawCrackSegment(graphics, crack, start, end, width);
    }
  }

  private drawCrackBranches(graphics: Graphics, crack: CrackData): void {
    const branchCount = crack.type === 'deep' ? 3 : 1;
    const seed = hashString(crack.id);

    for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
      const baseIndex = 1 + ((seed + branchIndex * 3) % Math.max(1, crack.points.length - 2));
      const base = crack.points[baseIndex];
      const previous = crack.points[Math.max(0, baseIndex - 1)];
      const next = crack.points[Math.min(crack.points.length - 1, baseIndex + 1)];
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const side = (seed + branchIndex) % 2 === 0 ? 1 : -1;
      const normal = { x: (-dy / length) * side, y: (dx / length) * side };
      const branchLength = crack.width * (crack.type === 'deep' ? 3.5 + branchIndex * 0.55 : 2.4);
      const branchEnd = {
        x: base.x + normal.x * branchLength + (dx / length) * branchLength * 0.28,
        y: base.y + normal.y * branchLength + (dy / length) * branchLength * 0.28
      };

      JadeMaterialRenderer.drawCrackBranch(graphics, crack, base, branchEnd);
    }
  }

  private drawPolygon(graphics: Graphics, points: Vec2Data[]): void {
    if (points.length === 0) {
      return;
    }

    graphics.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      graphics.lineTo(points[index].x, points[index].y);
    }
    graphics.close();
  }
}

function parseHexColor(hex: string, alpha: number): Color {
  const normalized = hex.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return new Color(red, green, blue, alpha);
}

function getMaskKey(point: Vec2Data): string {
  return `${Math.round(point.x)}:${Math.round(point.y)}`;
}

function getRevealIndexKey(point: Vec2Data, cellSize: number): string {
  return `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
}

function lerpPoint(start: Vec2Data, end: Vec2Data, t: number): Vec2Data {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t
  };
}

function getCrackWidthAt(crack: CrackData, t: number): number {
  const centerWeight = Math.sin(Math.PI * clamp(t, 0, 1));
  const endTaper = 0.22 + centerWeight * 0.92;
  const typeBoost = crack.type === 'deep' ? 1.18 : 0.92;
  return crack.width * endTaper * typeBoost;
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
