import { Color, Component, EventTouch, Graphics, input, Input, Label, Node, UITransform, Vec3, _decorator } from 'cc';

import { ColorConfig, DemoLevelConfig, JadeConfig, SettlementConfig, TextConfig } from '../config/GameConfigTypes';
import { getBounds, pointInPolygon } from '../core/geometry/Polygon2D';
import { ColorRegionData, JadePieceData, RevealMaskPointData, Vec2Data } from '../data/JadeTypes';
import { JadeDemoRenderer } from '../render/JadeDemoRenderer';

const { ccclass } = _decorator;
const SLIDER_WIDTH = 430;
const SLIDER_HEIGHT = 72;

@ccclass('JadeRevealController')
export class JadeRevealController extends Component {
  private jade: JadePieceData | null = null;
  private jadeConfig: JadeConfig | null = null;
  private colorConfig: ColorConfig | null = null;
  private demoLevelConfig: DemoLevelConfig | null = null;
  private settlementConfig: SettlementConfig | null = null;
  private textConfig: TextConfig | null = null;
  private renderer: JadeDemoRenderer | null = null;
  private colorValueById = new Map<string, number>();
  private revealMaskPoints: RevealMaskPointData[] = [];
  private revealMaskIndex = new Map<string, RevealMaskPointData[]>();
  private revealIndexCellSize = 6;
  private revealedMaskKeys = new Set<string>();
  private brushRadius = 3;
  private brushSliderValue = 0;
  private brushPoint: Vec2Data | null = null;
  private lastPaintPoint: Vec2Data | null = null;
  private isPainting = false;
  private isAdjustingBrush = false;
  private isCompleted = false;
  private sliderRoot: Node | null = null;
  private revealCostLabel: Label | null = null;
  private revealQuoteLabel: Label | null = null;
  private revealProfitLabel: Label | null = null;
  private jadeCost = 0;
  private lastQuoteUpdateTime = 0;
  private quoteDirty = false;
  private onRevealCompleted: (() => void) | null = null;
  private perfLastLogTime = 0;
  private perfMoveCount = 0;
  private perfBrushStampCount = 0;
  private perfAffectedCellCount = 0;
  private perfQuoteRecalcCount = 0;
  private perfRenderCount = 0;
  private perfMoveIntervalSum = 0;
  private perfLastMoveTime = 0;

  public initialize(
    jade: JadePieceData,
    jadeConfig: JadeConfig,
    colorConfig: ColorConfig,
    demoLevelConfig: DemoLevelConfig,
    settlementConfig: SettlementConfig,
    textConfig: TextConfig,
    renderer: JadeDemoRenderer,
    onRevealCompleted: () => void
  ): void {
    this.jade = jade;
    this.jadeConfig = jadeConfig;
    this.colorConfig = colorConfig;
    this.demoLevelConfig = demoLevelConfig;
    this.settlementConfig = settlementConfig;
    this.textConfig = textConfig;
    this.renderer = renderer;
    this.onRevealCompleted = onRevealCompleted;
    this.colorValueById = new Map(colorConfig.colors.map((item): [string, number] => [item.id, item.valueMultiplier]));
    this.jadeCost = this.calculateJadeCost(jade, settlementConfig);
    this.revealedMaskKeys.clear();
    this.brushPoint = null;
    this.lastPaintPoint = null;
    this.isPainting = false;
    this.isAdjustingBrush = false;
    this.isCompleted = false;
    this.quoteDirty = false;
    this.lastQuoteUpdateTime = 0;
    this.setBrushSliderValue(demoLevelConfig.reveal.defaultBrushSlider);
    this.revealMaskPoints = this.createRevealMaskPoints(jade, demoLevelConfig.reveal.revealCellSize);
    this.revealIndexCellSize = Math.max(demoLevelConfig.reveal.revealCellSize, 6);
    this.revealMaskIndex = this.createRevealMaskIndex(this.revealMaskPoints, this.revealIndexCellSize);

    this.ensureUiTransform();
    this.createRevealUi();
    this.bindInput();
    this.resetRevealPerfStats();
    this.renderReveal([]);
    console.log('[JadeRevealController] reveal initialized');
  }

  protected onDestroy(): void {
    this.unbindInput();
  }

  private bindInput(): void {
    this.unbindInput();
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
  }

  private unbindInput(): void {
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
  }

  private onTouchStart(event: EventTouch): void {
    if (this.isCompleted || this.isAdjustingBrush || !this.jade) {
      return;
    }

    const point = this.getLocalPoint(event);
    this.brushPoint = point;

    if (!pointInPolygon(point, this.jade.outlinePolygon)) {
      this.lastPaintPoint = null;
      this.renderReveal([]);
      return;
    }

    this.isPainting = true;
    this.lastPaintPoint = point;
    this.perfLastMoveTime = 0;
    this.paintStroke(point, point);
  }

  private onTouchMove(event: EventTouch): void {
    if (this.isCompleted || this.isAdjustingBrush) {
      return;
    }

    this.recordPointerMovePerf();
    const point = this.getLocalPoint(event);
    this.brushPoint = point;

    if (!this.isPainting || !this.lastPaintPoint) {
      this.renderReveal([]);
      return;
    }

    this.paintStroke(this.lastPaintPoint, point);
    this.lastPaintPoint = point;
  }

  private onTouchEnd(): void {
    const shouldCheckCompletion = this.isPainting && !this.isAdjustingBrush;
    this.isPainting = false;
    this.isAdjustingBrush = false;
    this.lastPaintPoint = null;
    this.perfLastMoveTime = 0;

    if (shouldCheckCompletion) {
      this.updateRevealEstimatePanel(true);
      this.checkRevealCompletion();
    }
  }

  private paintStroke(start: Vec2Data, end: Vec2Data): void {
    if (!this.jade || !this.demoLevelConfig) {
      return;
    }

    const distanceValue = distance(start, end);
    const spacingFactor = this.demoLevelConfig.reveal.strokeSpacingFactor;
    const spacing = Math.max(this.brushRadius * spacingFactor, 2);
    const requestedSteps = Math.max(1, Math.ceil(distanceValue / spacing));
    const steps = Math.min(this.demoLevelConfig.reveal.maxBrushStampsPerMove, requestedSteps);
    const changedPoints: RevealMaskPointData[] = [];
    this.perfBrushStampCount += steps + 1;

    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const point = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t
      };
      changedPoints.push(...this.revealAt(point));
    }
    this.perfAffectedCellCount += changedPoints.length;

    this.brushPoint = end;
    if (changedPoints.length > 0 || steps > 0) {
      this.renderReveal(changedPoints);
      if (changedPoints.length > 0) {
        this.quoteDirty = true;
        this.updateRevealEstimatePanel(false);
      }
    }
  }

  private revealAt(point: Vec2Data): RevealMaskPointData[] {
    if (!this.jade) {
      return [];
    }

    const changedPoints: RevealMaskPointData[] = [];
    for (const maskPoint of this.getMaskPointsNear(point, this.brushRadius)) {
      if (distance(maskPoint, point) > this.brushRadius) {
        continue;
      }

      const key = getMaskKey(maskPoint);
      if (!this.revealedMaskKeys.has(key)) {
        this.revealedMaskKeys.add(key);
        changedPoints.push(maskPoint);
      }
    }

    return changedPoints;
  }

  private renderReveal(changedRevealPoints: RevealMaskPointData[]): void {
    if (!this.renderer || !this.jade || !this.jadeConfig || !this.colorConfig || !this.demoLevelConfig) {
      return;
    }

    this.renderer.renderReveal(
      this.jade,
      this.jadeConfig,
      this.colorConfig,
      this.demoLevelConfig,
      changedRevealPoints,
      this.brushPoint,
      this.brushRadius
    );
    this.perfRenderCount += 1;
    this.bringRevealUiToFront();
    this.logRevealPerfIfNeeded();
  }

  private checkRevealCompletion(): void {
    if (this.isCompleted || !this.demoLevelConfig) {
      return;
    }

    const remaining = this.calculateRemainingSkinStats();
    const revealConfig = this.demoLevelConfig.reveal;
    if (
      remaining.totalArea > revealConfig.remainingSkinAreaThresholdPx2 ||
      remaining.largestPatchArea > revealConfig.largestRemainingPatchThresholdPx2
    ) {
      return;
    }

    this.completeReveal();
  }

  private completeReveal(): void {
    if (this.isCompleted || !this.renderer || !this.jade || !this.jadeConfig || !this.colorConfig || !this.demoLevelConfig) {
      return;
    }

    this.isCompleted = true;
    this.unbindInput();
    this.brushPoint = null;

    if (this.demoLevelConfig.reveal.clearRemainingOnComplete) {
      this.revealAllMaskPoints();
    }

    this.renderReveal(this.revealMaskPoints);
    this.removeRevealUi();

    const delay = Math.max(0, this.demoLevelConfig.reveal.completeTransitionDelay);
    this.scheduleOnce(() => {
      if (!this.renderer || !this.jade || !this.jadeConfig || !this.colorConfig || !this.demoLevelConfig) {
        return;
      }

      this.renderer.render(this.jade, this.jadeConfig, this.colorConfig, this.demoLevelConfig);
      console.log('[JadeRevealController] reveal completed');
      this.onRevealCompleted?.();
    }, delay);
  }

  private revealAllMaskPoints(): void {
    for (const maskPoint of this.revealMaskPoints) {
      this.revealedMaskKeys.add(getMaskKey(maskPoint));
    }
  }

  private createRevealUi(): void {
    if (!this.textConfig) {
      return;
    }

    this.removeRevealUi();

    const brushPanel = new Node('RevealBrushPanel');
    this.node.addChild(brushPanel);
    brushPanel.layer = this.node.layer;
    brushPanel.setPosition(new Vec3(0, -555, 0));
    brushPanel.addComponent(UITransform).setContentSize(640, 120);
    this.drawPanelBackground(brushPanel, 640, 120, new Color(238, 245, 230, 222), new Color(75, 92, 76, 230));

    this.createTextNode(brushPanel, 'RevealBrushTitle', this.getText('brushSizeTitle'), -235, 0, 24, new Color(38, 58, 44, 255), 150);

    const slider = new Node('RevealBrushSlider');
    brushPanel.addChild(slider);
    slider.layer = brushPanel.layer;
    slider.setPosition(new Vec3(72, 0, 1));
    slider.addComponent(UITransform).setContentSize(SLIDER_WIDTH, SLIDER_HEIGHT);
    slider.addComponent(Graphics);
    slider.on(Node.EventType.TOUCH_START, this.onSliderTouch, this);
    slider.on(Node.EventType.TOUCH_MOVE, this.onSliderTouch, this);
    slider.on(Node.EventType.TOUCH_END, this.onSliderTouchEnd, this);
    slider.on(Node.EventType.TOUCH_CANCEL, this.onSliderTouchEnd, this);
    this.sliderRoot = slider;
    this.drawSlider();
    this.createRevealEstimatePanel();
    this.updateRevealEstimatePanel(true);
    this.bringRevealUiToFront();
  }

  private removeRevealUi(): void {
    this.removeChildByName('RevealProgressPanel');
    this.removeChildByName('RevealEstimatePanel');
    this.removeChildByName('RevealBrushPanel');
    this.sliderRoot = null;
    this.revealCostLabel = null;
    this.revealQuoteLabel = null;
    this.revealProfitLabel = null;
  }

  private onSliderTouch(event: EventTouch): void {
    this.isAdjustingBrush = true;
    this.isPainting = false;
    this.lastPaintPoint = null;
    this.updateSliderFromTouch(event);
    stopPropagation(event);
  }

  private onSliderTouchEnd(event: EventTouch): void {
    this.updateSliderFromTouch(event);
    this.isAdjustingBrush = false;
    stopPropagation(event);
  }

  private updateSliderFromTouch(event: EventTouch): void {
    if (!this.sliderRoot) {
      return;
    }

    const uiLocation = event.getUILocation();
    const transform = this.sliderRoot.getComponent(UITransform) ?? this.sliderRoot.addComponent(UITransform);
    const local = transform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0));
    const value = clamp((local.x + SLIDER_WIDTH * 0.5) / SLIDER_WIDTH, 0, 1);
    this.setBrushSliderValue(value);
    this.drawSlider();
    this.renderReveal([]);
  }

  private setBrushSliderValue(value: number): void {
    if (!this.demoLevelConfig) {
      this.brushSliderValue = clamp(value, 0, 1);
      this.brushRadius = 3;
      return;
    }

    const revealConfig = this.demoLevelConfig.reveal;
    this.brushSliderValue = clamp(value, 0, 1);
    const easedValue = this.brushSliderValue * this.brushSliderValue;
    this.brushRadius = revealConfig.minBrushRadius + (revealConfig.maxBrushRadius - revealConfig.minBrushRadius) * easedValue;
  }

  private drawSlider(): void {
    if (!this.sliderRoot) {
      return;
    }

    const graphics = this.sliderRoot.getComponent(Graphics) ?? this.sliderRoot.addComponent(Graphics);
    const trackWidth = 380;
    const trackHeight = 12;
    const x = -trackWidth * 0.5;
    const fillWidth = trackWidth * this.brushSliderValue;
    const thumbX = x + fillWidth;

    graphics.clear();
    graphics.fillColor = new Color(218, 224, 210, 255);
    graphics.strokeColor = new Color(80, 96, 80, 255);
    graphics.lineWidth = 2;
    graphics.rect(x, -trackHeight * 0.5, trackWidth, trackHeight);
    graphics.fill();
    graphics.stroke();

    graphics.fillColor = new Color(139, 205, 154, 255);
    graphics.rect(x, -trackHeight * 0.5, fillWidth, trackHeight);
    graphics.fill();

    graphics.fillColor = new Color(247, 251, 241, 255);
    graphics.strokeColor = new Color(46, 126, 64, 255);
    graphics.lineWidth = 4;
    graphics.circle(thumbX, 0, 20);
    graphics.fill();
    graphics.stroke();
  }

  private createRevealEstimatePanel(): void {
    if (!this.textConfig) {
      return;
    }

    const panel = new Node('RevealEstimatePanel');
    this.node.addChild(panel);
    panel.layer = this.node.layer;
    panel.setPosition(new Vec3(-152, 520, 0));
    panel.addComponent(UITransform).setContentSize(390, 150);
    this.drawPanelBackground(panel, 390, 150, new Color(242, 232, 202, 235), new Color(82, 70, 52, 245));

    this.revealCostLabel = this.createTextNode(panel, 'RevealCostText', '', -4, 42, 22, new Color(36, 34, 30, 255), 340).getChildByName('RevealCostText_Label')?.getComponent(Label) ?? null;
    this.revealQuoteLabel = this.createTextNode(panel, 'RevealQuoteText', '', -4, 0, 22, new Color(36, 34, 30, 255), 340).getChildByName('RevealQuoteText_Label')?.getComponent(Label) ?? null;
    this.revealProfitLabel = this.createTextNode(panel, 'RevealProfitText', '', -4, -42, 22, new Color(36, 34, 30, 255), 340).getChildByName('RevealProfitText_Label')?.getComponent(Label) ?? null;
  }

  private updateRevealEstimatePanel(force: boolean): void {
    if (!this.revealCostLabel || !this.revealQuoteLabel || !this.revealProfitLabel) {
      return;
    }
    if (!force && !this.shouldUpdateQuoteNow()) {
      return;
    }

    const quote = this.calculateRevealQuote();
    this.perfQuoteRecalcCount += 1;
    const profit = quote - this.jadeCost;
    this.revealCostLabel.string = `${this.getText('jadeCostLabel')}: ${this.jadeCost}`;
    this.revealQuoteLabel.string = `${this.getText('currentQuoteLabel')}: ${quote}`;
    this.revealProfitLabel.string = `${this.getText('currentProfitLabel')}: ${profit >= 0 ? '+' : ''}${profit}`;
    this.revealProfitLabel.color = profit >= 0 ? new Color(46, 148, 67, 255) : new Color(196, 42, 42, 255);
    this.lastQuoteUpdateTime = Date.now();
    this.quoteDirty = false;
    this.bringRevealUiToFront();
  }

  private bringRevealUiToFront(): void {
    const estimatePanel = this.node.getChildByName('RevealEstimatePanel');
    const brushPanel = this.node.getChildByName('RevealBrushPanel');

    if (estimatePanel) {
      estimatePanel.setSiblingIndex(this.node.children.length - 1);
    }

    if (brushPanel) {
      brushPanel.setSiblingIndex(this.node.children.length - 1);
    }
  }

  private resetRevealPerfStats(): void {
    this.perfLastLogTime = Date.now();
    this.perfMoveCount = 0;
    this.perfBrushStampCount = 0;
    this.perfAffectedCellCount = 0;
    this.perfQuoteRecalcCount = 0;
    this.perfRenderCount = 0;
    this.perfMoveIntervalSum = 0;
    this.perfLastMoveTime = 0;
  }

  private recordPointerMovePerf(): void {
    const now = Date.now();
    if (this.perfLastMoveTime > 0) {
      this.perfMoveIntervalSum += now - this.perfLastMoveTime;
    }

    this.perfLastMoveTime = now;
    this.perfMoveCount += 1;
  }

  private logRevealPerfIfNeeded(): void {
    const now = Date.now();
    if (now - this.perfLastLogTime < 1000) {
      return;
    }

    const averageMoveInterval = this.perfMoveCount > 1 ? this.perfMoveIntervalSum / Math.max(1, this.perfMoveCount - 1) : 0;
    console.log(
      `[JadeRevealPerf] moves=${this.perfMoveCount} avgMoveMs=${averageMoveInterval.toFixed(1)} stamps=${this.perfBrushStampCount} affectedCells=${this.perfAffectedCellCount} quoteRecalc=${this.perfQuoteRecalcCount} maskRedraw=${this.perfRenderCount} graphicsClear=${this.perfRenderCount}`
    );
    this.perfLastLogTime = now;
    this.perfMoveCount = 0;
    this.perfBrushStampCount = 0;
    this.perfAffectedCellCount = 0;
    this.perfQuoteRecalcCount = 0;
    this.perfRenderCount = 0;
    this.perfMoveIntervalSum = 0;
  }

  private shouldUpdateQuoteNow(): boolean {
    if (!this.demoLevelConfig || !this.quoteDirty) {
      return false;
    }

    return Date.now() - this.lastQuoteUpdateTime >= this.demoLevelConfig.reveal.quoteUpdateIntervalMs;
  }

  private calculateRevealQuote(): number {
    if (!this.settlementConfig || this.revealMaskPoints.length === 0) {
      return 0;
    }

    const pricing = this.settlementConfig.revealPricing;
    let unitValueSum = 0;

    for (const point of this.revealMaskPoints) {
      if (this.revealedMaskKeys.has(getMaskKey(point))) {
        unitValueSum += this.calculateKnownRevealUnitValue(point, pricing);
      } else {
        unitValueSum += pricing.unknownAreaUnitValue;
      }
    }

    const averageUnitValue = unitValueSum / this.revealMaskPoints.length;
    const grossQuote = this.jadeCost * pricing.quoteScale * averageUnitValue;
    const crackPenalty = this.calculateRevealedCrackPenalty(pricing);

    return Math.max(0, Math.round(grossQuote - crackPenalty));
  }

  private calculateKnownRevealUnitValue(point: RevealMaskPointData, pricing: SettlementConfig['revealPricing']): number {
    const colorValue = this.getColorValue(point.colorId);
    const colorPremium = Math.pow(Math.max(0, colorValue - 1), 1.35) * pricing.colorValueWeight;
    const lowValuePenalty = Math.max(0, 1 - colorValue) * pricing.lowValuePenaltyWeight;
    const concentrationPremium = point.concentration * pricing.concentrationWeight * Math.max(0, colorValue - 1);

    return Math.max(0, pricing.revealedBaseUnitValue + colorPremium + concentrationPremium - lowValuePenalty);
  }

  private calculateRevealedCrackPenalty(pricing: SettlementConfig['revealPricing']): number {
    if (!this.jade || this.revealedMaskKeys.size === 0) {
      return 0;
    }

    let penalty = 0;
    for (const crack of this.jade.cracks) {
      if (crack.points.length < 2) {
        continue;
      }

      for (let index = 0; index < crack.points.length - 1; index += 1) {
        const start = crack.points[index];
        const end = crack.points[index + 1];
        const midpoint = { x: (start.x + end.x) * 0.5, y: (start.y + end.y) * 0.5 };
        const nearestMask = this.findNearestRevealedMaskPoint(midpoint, Math.max(7, this.jade.sampleCellSize * 1.4));

        if (!nearestMask) {
          continue;
        }

        const length = distance(start, end);
        const basePenalty = crack.type === 'deep' ? pricing.deepCrackPenaltyPerPx : pricing.shallowCrackPenaltyPerPx;
        const colorValue = this.getColorValue(nearestMask.colorId);
        const colorMultiplier = colorValue >= (this.settlementConfig?.pricing.highValueColorMultiplierThreshold ?? 2.5)
          ? pricing.highValueCrackPenaltyMultiplier
          : 1;
        penalty += length * basePenalty * colorMultiplier;
      }
    }

    return clamp(penalty, 0, this.jadeCost * pricing.maxCrackPenaltyRatio);
  }

  private findNearestRevealedMaskPoint(point: Vec2Data, maxDistance: number): RevealMaskPointData | null {
    let bestPoint: RevealMaskPointData | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const maskPoint of this.getMaskPointsNear(point, maxDistance)) {
      if (!this.revealedMaskKeys.has(getMaskKey(maskPoint))) {
        continue;
      }

      const currentDistance = distance(maskPoint, point);
      if (currentDistance < bestDistance) {
        bestDistance = currentDistance;
        bestPoint = maskPoint;
      }
    }

    return bestPoint && bestDistance <= maxDistance ? bestPoint : null;
  }

  private calculateJadeCost(jade: JadePieceData, settlementConfig: SettlementConfig): number {
    const config = settlementConfig.jadeCost;
    const averageColorValue = jade.sampleGrid.reduce((sum, sample) => sum + this.getColorValue(sample.colorId), 0) / Math.max(1, jade.sampleGrid.length);
    const colorPremium = Math.max(0, averageColorValue - 1) * config.colorValueWeight;
    const materialCostFactor = clamp(0.42 + jade.materialQualityFactor * 0.36, 0.2, 1.35);
    const crackDiscount = clamp(
      jade.cracks.filter((crack) => crack.type === 'shallow').length * config.shallowCrackDiscount +
        jade.cracks.filter((crack) => crack.type === 'deep').length * config.deepCrackDiscount,
      0,
      config.maxCrackDiscount
    );
    const cost = (config.baseCost + jade.area * config.areaCostFactor) * materialCostFactor * (1 + colorPremium) * (1 - crackDiscount) * jade.roughPriceMultiplier;

    return Math.round(Math.max(config.minCost, cost));
  }

  private getColorValue(colorId: string | undefined): number {
    if (!colorId) {
      return 0.42;
    }

    return this.colorValueById.get(colorId) ?? 0.42;
  }

  private calculateRemainingSkinStats(): { totalArea: number; largestPatchArea: number } {
    if (!this.demoLevelConfig) {
      return { totalArea: 0, largestPatchArea: 0 };
    }

    const cellArea = this.demoLevelConfig.reveal.revealCellSize * this.demoLevelConfig.reveal.revealCellSize;
    const remaining = new Map<string, RevealMaskPointData>();
    for (const point of this.revealMaskPoints) {
      const key = getMaskKey(point);
      if (!this.revealedMaskKeys.has(key)) {
        remaining.set(key, point);
      }
    }

    let largestPatchCount = 0;
    const visited = new Set<string>();
    for (const [key, point] of remaining) {
      if (visited.has(key)) {
        continue;
      }

      const patchCount = this.countRemainingPatch(point, remaining, visited);
      largestPatchCount = Math.max(largestPatchCount, patchCount);
    }

    return {
      totalArea: remaining.size * cellArea,
      largestPatchArea: largestPatchCount * cellArea
    };
  }

  private countRemainingPatch(start: RevealMaskPointData, remaining: Map<string, RevealMaskPointData>, visited: Set<string>): number {
    if (!this.demoLevelConfig) {
      return 0;
    }

    const cellSize = this.demoLevelConfig.reveal.revealCellSize;
    const queue: RevealMaskPointData[] = [start];
    let count = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const key = getMaskKey(current);
      if (visited.has(key)) {
        continue;
      }

      visited.add(key);
      count += 1;

      const neighbors = [
        { x: current.x + cellSize, y: current.y },
        { x: current.x - cellSize, y: current.y },
        { x: current.x, y: current.y + cellSize },
        { x: current.x, y: current.y - cellSize }
      ];

      for (const neighbor of neighbors) {
        const neighborPoint = remaining.get(getMaskKey(neighbor));
        if (neighborPoint && !visited.has(getMaskKey(neighborPoint))) {
          queue.push(neighborPoint);
        }
      }
    }

    return count;
  }

  private getLocalPoint(event: EventTouch): Vec2Data {
    const uiLocation = event.getUILocation();
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    const local = transform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0));
    return { x: local.x, y: local.y };
  }

  private ensureUiTransform(): void {
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    if (transform.width < 1 || transform.height < 1) {
      transform.setContentSize(720, 1280);
    }
  }

  private removeChildByName(name: string): void {
    const child = this.node.getChildByName(name);
    if (child) {
      child.destroy();
    }
  }

  private createTextNode(parent: Node, nodeName: string, text: string, x: number, y: number, fontSize: number, color: Color, width: number): Node {
    const node = new Node(nodeName);
    parent.addChild(node);
    node.layer = parent.layer;
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(width, 44);
    const labelNode = new Node(`${nodeName}_Label`);
    node.addChild(labelNode);
    labelNode.layer = parent.layer;
    labelNode.setPosition(new Vec3(0, 0, 1));
    labelNode.addComponent(UITransform).setContentSize(width, 44);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.color = color;
    return node;
  }

  private drawPanelBackground(node: Node, width: number, height: number, fill: Color, stroke: Color): void {
    const panelGraphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    panelGraphics.clear();
    panelGraphics.fillColor = fill;
    panelGraphics.strokeColor = stroke;
    panelGraphics.lineWidth = 3;
    panelGraphics.rect(-width * 0.5, -height * 0.5, width, height);
    panelGraphics.fill();
    panelGraphics.stroke();
  }

  private getText(key: string): string {
    return this.textConfig?.texts[key] ?? key;
  }

  private createRevealMaskPoints(jade: JadePieceData, cellSize: number): RevealMaskPointData[] {
    const bounds = getBounds(jade.outlinePolygon);
    const points: RevealMaskPointData[] = [];
    const halfCell = cellSize * 0.5;

    for (let y = bounds.minY; y <= bounds.maxY; y += cellSize) {
      for (let x = bounds.minX; x <= bounds.maxX; x += cellSize) {
        const point = { x, y };
        if (!this.isPointSafelyInsideJade(point, jade, halfCell)) {
          continue;
        }

        points.push(this.createMaskPoint(point, jade.colorRegions));
      }
    }

    console.log(`[JadeRevealController] reveal mask points: ${points.length}`);
    return points;
  }

  private createRevealMaskIndex(points: RevealMaskPointData[], cellSize: number): Map<string, RevealMaskPointData[]> {
    const index = new Map<string, RevealMaskPointData[]>();

    for (const point of points) {
      const key = getCellKey(Math.floor(point.x / cellSize), Math.floor(point.y / cellSize));
      const bucket = index.get(key);
      if (bucket) {
        bucket.push(point);
      } else {
        index.set(key, [point]);
      }
    }

    return index;
  }

  private getMaskPointsNear(point: Vec2Data, radius: number): RevealMaskPointData[] {
    const results: RevealMaskPointData[] = [];
    const minCellX = Math.floor((point.x - radius) / this.revealIndexCellSize);
    const maxCellX = Math.floor((point.x + radius) / this.revealIndexCellSize);
    const minCellY = Math.floor((point.y - radius) / this.revealIndexCellSize);
    const maxCellY = Math.floor((point.y + radius) / this.revealIndexCellSize);

    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const bucket = this.revealMaskIndex.get(getCellKey(cellX, cellY));
        if (bucket) {
          results.push(...bucket);
        }
      }
    }

    return results;
  }

  private isPointSafelyInsideJade(point: Vec2Data, jade: JadePieceData, halfCell: number): boolean {
    const checks = [
      point,
      { x: point.x - halfCell, y: point.y - halfCell },
      { x: point.x + halfCell, y: point.y - halfCell },
      { x: point.x - halfCell, y: point.y + halfCell },
      { x: point.x + halfCell, y: point.y + halfCell }
    ];

    return checks.every((item) => pointInPolygon(item, jade.outlinePolygon));
  }

  private createMaskPoint(point: Vec2Data, regions: ColorRegionData[]): RevealMaskPointData {
    let bestRegion: ColorRegionData | undefined;
    let bestConcentration = 0;

    for (const region of regions) {
      const concentration = getRegionConcentration(point, region);
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
}

function getMaskKey(point: Vec2Data): string {
  return `${Math.round(point.x)}:${Math.round(point.y)}`;
}

function getCellKey(cellX: number, cellY: number): string {
  return `${cellX}:${cellY}`;
}

function distance(a: Vec2Data, b: Vec2Data): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stopPropagation(event: EventTouch): void {
  (event as unknown as { propagationStopped: boolean }).propagationStopped = true;
}

function getRegionConcentration(point: Vec2Data, region: ColorRegionData): number {
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
