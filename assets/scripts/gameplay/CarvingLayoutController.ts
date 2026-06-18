import {
  Color,
  Component,
  EventKeyboard,
  EventMouse,
  EventTouch,
  Graphics,
  input,
  Input,
  KeyCode,
  Label,
  Node,
  UITransform,
  Vec3,
  _decorator
} from 'cc';

import { CarvingConfig, ColorConfig, DemoLevelConfig, SettlementConfig, TextConfig } from '../config/GameConfigTypes';
import { CarvingEditMode, PlacedCarvingData } from '../data/CarvingTypes';
import { CrackData, JadePieceData, Vec2Data } from '../data/JadeTypes';
import { LayoutSettlementResult } from '../data/SettlementTypes';
import { pointInPolygon } from '../core/geometry/Polygon2D';
import { distancePointToPolyline } from '../core/geometry/Polyline2D';
import { inverseTransformPoint, transformPoint } from '../core/geometry/Transform2D';
import { CarvingShapeFactory } from './CarvingShapeFactory';
import { SettlementCalculator } from './SettlementCalculator';

const { ccclass } = _decorator;
const TOP_INFO_AREA = { x: -330, y: 468, width: 660, height: 170 };
const JADE_WORK_AREA = { x: -330, y: -338, width: 660, height: 770 };
const SHAPE_PALETTE_AREA = { x: -345, y: -638, width: 690, height: 164 };
const ACTION_BUTTON_AREA = { x: 162, y: -462, width: 180, height: 142 };
const JADE_EDGE_TOLERANCE = 2;

interface CrackHitDebugData {
  carvingId: string;
  crackType: 'shallow' | 'deep';
  crackId: string;
  segmentIndex: number;
  hitPoint: Vec2Data;
  segmentStart: Vec2Data;
  segmentEnd: Vec2Data;
}

@ccclass('CarvingLayoutController')
export class CarvingLayoutController extends Component {
  private layerGraphics: Graphics | null = null;
  private jade: JadePieceData | null = null;
  private carvingConfig: CarvingConfig | null = null;
  private textConfig: TextConfig | null = null;
  private settlementCalculator: SettlementCalculator | null = null;
  private settlementResult: LayoutSettlementResult | null = null;
  private placedCarvings: PlacedCarvingData[] = [];
  private selectedId: string | null = null;
  private editMode: CarvingEditMode = 'none';
  private dragOffset: Vec2Data = { x: 0, y: 0 };
  private initialRotation = 0;
  private initialScale = 1;
  private initialPointerAngle = 0;
  private initialPointerDistance = 1;
  private instanceCounters = new Map<string, number>();
  private onPlacementChanged: ((placedCount: number) => void) | null = null;
  private onSubmitProcessing: ((result: LayoutSettlementResult, placedCarvings: PlacedCarvingData[]) => void) | null = null;
  private settlementSummaryLabel: Label | null = null;
  private settlementProfitLabel: Label | null = null;
  private selectedCrackHitDebug: CrackHitDebugData | null = null;
  private lastValidationDebugKey = '';
  private showCrackHitDebug = false;

  public initialize(
    jade: JadePieceData,
    carvingConfig: CarvingConfig,
    colorConfig: ColorConfig,
    settlementConfig: SettlementConfig,
    textConfig: TextConfig,
    demoLevelConfig?: DemoLevelConfig,
    onPlacementChanged?: (placedCount: number) => void,
    onSubmitProcessing?: (result: LayoutSettlementResult, placedCarvings: PlacedCarvingData[]) => void
  ): void {
    console.log(`[CarvingLayoutController] initialize called on node: ${this.node.name}`);
    this.jade = jade;
    this.carvingConfig = carvingConfig;
    this.textConfig = textConfig;
    this.showCrackHitDebug = demoLevelConfig?.debug.showCrackHitDebug === true;
    this.settlementCalculator = new SettlementCalculator(jade, colorConfig, settlementConfig);
    this.onPlacementChanged = onPlacementChanged ?? null;
    this.onSubmitProcessing = onSubmitProcessing ?? null;
    this.ensureUiTransform();
    this.ensureLayerGraphics();
    this.logLayoutAreas();
    this.createRuntimeUi();
    this.clearPlacements();
    this.bindInput();
    this.render();
    this.notifyPlacementChanged();
    console.log(`[CarvingLayoutController] placed carving count: ${this.placedCarvings.length}`);
  }

  public getPlacedCount(): number {
    return this.placedCarvings.length;
  }

  public getSettlementResult(): LayoutSettlementResult | null {
    if (!this.settlementCalculator) {
      return null;
    }

    this.validateAll();
    this.settlementResult = this.settlementCalculator.calculate(this.placedCarvings);
    return this.settlementResult;
  }

  public shutdown(): void {
    this.unbindInput();
    this.removeRuntimeUi();
    this.placedCarvings = [];
    this.selectedId = null;
    this.editMode = 'none';
    this.layerGraphics?.clear();
  }

  protected onDestroy(): void {
    this.unbindInput();
  }

  private unbindInput(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    this.node.off(getMouseWheelEventName(), this.onMouseWheel, this);
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
  }

  private bindInput(): void {
    this.node.off(getMouseWheelEventName(), this.onMouseWheel, this);
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);

    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    this.node.on(getMouseWheelEventName(), this.onMouseWheel, this);
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
  }

  private clearPlacements(): void {
    if (!this.carvingConfig || !this.jade) {
      return;
    }

    this.placedCarvings = [];
    this.selectedId = null;
    this.instanceCounters.clear();
    this.validateAll();
    this.notifyPlacementChanged();
  }

  private createRuntimeUi(): void {
    if (!this.carvingConfig || !this.textConfig) {
      return;
    }

    this.removeChildByName('CarvingPalette');
    this.removeChildByName('CarvingControls');
    this.removeChildByName('SettlementSummaryPanel');
    this.removeChildByName('EstimateDetailPanel');
    this.removeChildByName('ValidationReasonBadge');
    this.removeChildByName('ProcessingSubmitMessage');

    const palette = new Node('CarvingPalette');
    this.node.addChild(palette);
    palette.layer = this.node.layer;
    palette.setPosition(new Vec3(0, -556, 0));
    palette.addComponent(UITransform).setContentSize(690, 164);
    this.drawPanelBackground(palette, 690, 164, new Color(246, 238, 214, 238), new Color(84, 72, 58, 255));

    this.createTextNode(palette, 'PaletteTitle', this.getText('paletteTitle'), -294, 55, 24, new Color(36, 44, 39, 255), 120);

    this.carvingConfig.shapes.forEach((shape, index) => {
      const item = this.createTextNode(
        palette,
        `PaletteItem_${shape.id}`,
        shape.shortDisplayName ?? shape.displayName,
        -296 + index * 74,
        -23,
        17,
        new Color(42, 72, 55, 255),
        70
      );
      item.getComponent(UITransform)?.setContentSize(70, 78);
      this.drawButtonBackground(item, 70, 78, new Color(255, 252, 238, 255), new Color(106, 92, 72, 255));
      item.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
        stopPropagation(event);
        this.spawnShape(shape.id);
      });
    });
    console.log('[JadeDemoBootstrap] shape list initialized');

    const controls = new Node('CarvingControls');
    this.node.addChild(controls);
    controls.layer = this.node.layer;
    controls.setPosition(new Vec3(252, -340, 0));
    controls.addComponent(UITransform).setContentSize(180, 142);
    this.drawPanelBackground(controls, 180, 142, new Color(238, 245, 230, 230), new Color(84, 96, 78, 255));

    const deleteButton = this.createTextNode(controls, 'DeleteButton', this.getText('deleteButton'), 0, 70, 22, new Color(178, 50, 48, 255), 136);
    deleteButton.getComponent(UITransform)?.setContentSize(136, 46);
    this.drawButtonBackground(deleteButton, 136, 46, new Color(255, 238, 230, 255), new Color(150, 75, 65, 255));
    deleteButton.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      stopPropagation(event);
      this.deleteSelected();
    });

    const resetButton = this.createTextNode(controls, 'ResetButton', this.getText('resetButton'), 0, 18, 20, new Color(35, 94, 74, 255), 136);
    resetButton.getComponent(UITransform)?.setContentSize(136, 46);
    this.drawButtonBackground(resetButton, 136, 46, new Color(231, 250, 234, 255), new Color(70, 120, 80, 255));
    resetButton.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      stopPropagation(event);
      this.clearPlacements();
      this.render();
    });

    const submitButton = this.createTextNode(controls, 'SubmitProcessingButton', this.getText('sendProcessingButton'), 0, -34, 19, new Color(48, 68, 92, 255), 136);
    submitButton.getComponent(UITransform)?.setContentSize(136, 46);
    this.drawButtonBackground(submitButton, 136, 46, new Color(226, 238, 252, 255), new Color(70, 92, 126, 255));
    submitButton.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      stopPropagation(event);
      this.submitProcessing();
    });

    const deepCrackTestButton = this.createTextNode(
      controls,
      'DeepCrackTestButton',
      this.getText('deepCrackTestButton'),
      0,
      -86,
      16,
      new Color(55, 55, 55, 255),
      136
    );
    deepCrackTestButton.getComponent(UITransform)?.setContentSize(136, 42);
    this.drawButtonBackground(deepCrackTestButton, 136, 42, new Color(235, 235, 232, 255), new Color(82, 82, 78, 255));
    deepCrackTestButton.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      stopPropagation(event);
      this.spawnDeepCrackTestShape();
    });

    controls.getComponent(UITransform)?.setContentSize(180, 230);
    this.drawPanelBackground(controls, 180, 230, new Color(238, 245, 230, 230), new Color(84, 96, 78, 255));

    this.createSettlementUi();
  }

  private removeRuntimeUi(): void {
    this.removeChildByName('CarvingPalette');
    this.removeChildByName('CarvingControls');
    this.removeChildByName('SettlementSummaryPanel');
    this.removeChildByName('EstimateDetailPanel');
    this.removeChildByName('ValidationReasonBadge');
    this.removeChildByName('ProcessingSubmitMessage');
    this.settlementSummaryLabel = null;
    this.settlementProfitLabel = null;
  }

  private createSettlementUi(): void {
    const summaryPanel = new Node('SettlementSummaryPanel');
    this.node.addChild(summaryPanel);
    summaryPanel.layer = this.node.layer;
    summaryPanel.setPosition(new Vec3(0, 550, 0));
    summaryPanel.addComponent(UITransform).setContentSize(640, 170);
    this.drawPanelBackground(summaryPanel, 640, 170, new Color(255, 247, 218, 232), new Color(93, 79, 57, 255));

    const summaryNode = this.createTextNode(summaryPanel, 'SettlementSummaryText', '', 0, 24, 24, new Color(37, 45, 39, 255), 590);
    summaryNode.getComponent(UITransform)?.setContentSize(590, 100);
    const summaryLabelNode = summaryNode.getChildByName('SettlementSummaryText_Label');
    summaryLabelNode?.getComponent(UITransform)?.setContentSize(590, 100);
    this.settlementSummaryLabel = summaryLabelNode?.getComponent(Label) ?? null;
    if (this.settlementSummaryLabel) {
      this.settlementSummaryLabel.lineHeight = 30;
    }

    const profitNode = this.createTextNode(summaryPanel, 'SettlementProfitText', '', 0, -58, 26, new Color(36, 96, 61, 255), 590);
    profitNode.getComponent(UITransform)?.setContentSize(590, 36);
    const profitLabelNode = profitNode.getChildByName('SettlementProfitText_Label');
    profitLabelNode?.getComponent(UITransform)?.setContentSize(590, 36);
    this.settlementProfitLabel = profitLabelNode?.getComponent(Label) ?? null;
    if (this.settlementProfitLabel) {
      this.settlementProfitLabel.lineHeight = 32;
    }
  }

  private spawnShape(shapeId: string): void {
    if (!this.carvingConfig || !this.jade) {
      return;
    }

    const shape = this.carvingConfig.shapes.find((item) => item.id === shapeId);
    if (!shape) {
      return;
    }

    const geometry = CarvingShapeFactory.createGeometry(shape, this.jade.sampleCellSize);
    const nextCount = (this.instanceCounters.get(shape.id) ?? 0) + 1;
    this.instanceCounters.set(shape.id, nextCount);
    const instance: PlacedCarvingData = {
      id: `${shape.id}_${nextCount.toString().padStart(3, '0')}`,
      shape,
      geometry,
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: this.getInitialScale(shape.minScale, shape.maxScale, shape.minValidArea, shape.nominalArea, geometry.approximateArea),
      validationState: 'valid',
      validationReasons: []
    };

    instance.position = this.findSpawnPosition(instance, nextCount);
    this.placedCarvings.push(instance);
    this.selectedId = instance.id;
    this.validateAll();
    this.render();
    this.notifyPlacementChanged();
    console.log(`[CarvingLayoutController] spawned ${instance.id}`);
  }

  private onTouchStart(event: EventTouch): void {
    const point = this.getLocalPoint(event);
    const selected = this.getSelected();

    if (selected) {
      if (distance(point, this.getDeleteHandlePoint(selected)) <= 18) {
        this.deleteSelected();
        return;
      }

      if (distance(point, this.getRotateHandlePoint(selected)) <= 15) {
        this.editMode = 'rotate';
        this.initialRotation = selected.rotation;
        this.initialPointerAngle = Math.atan2(point.y - selected.position.y, point.x - selected.position.x);
        return;
      }

      if (distance(point, this.getScaleHandlePoint(selected)) <= 15) {
        this.editMode = 'scale';
        this.initialScale = selected.scale;
        this.initialPointerDistance = Math.max(1, distance(point, selected.position));
        return;
      }
    }

    const hit = this.findTopmostCarving(point);
    if (!hit) {
      this.selectedId = null;
      this.editMode = 'none';
      this.render();
      return;
    }

    this.selectedId = hit.id;
    this.editMode = 'drag';
    this.dragOffset = {
      x: hit.position.x - point.x,
      y: hit.position.y - point.y
    };
    this.render();
  }

  private onTouchMove(event: EventTouch): void {
    const selected = this.getSelected();
    if (!selected || this.editMode === 'none') {
      return;
    }

    const point = this.getLocalPoint(event);

    if (this.editMode === 'drag') {
      selected.position = {
        x: point.x + this.dragOffset.x,
        y: point.y + this.dragOffset.y
      };
    } else if (this.editMode === 'rotate') {
      const angle = Math.atan2(point.y - selected.position.y, point.x - selected.position.x);
      selected.rotation = this.initialRotation + angle - this.initialPointerAngle;
    } else if (this.editMode === 'scale') {
      const nextScale = this.initialScale * (distance(point, selected.position) / this.initialPointerDistance);
      selected.scale = clamp(nextScale, selected.shape.minScale, selected.shape.maxScale);
    }

    this.validateAll();
    this.render();
  }

  private onTouchEnd(): void {
    this.editMode = 'none';
  }

  private onMouseWheel(event: EventMouse): void {
    const selected = this.getSelected();
    if (!selected) {
      return;
    }

    const scrollY = event.getScrollY();
    const factor = scrollY > 0 ? 1.04 : 0.96;
    selected.scale = clamp(selected.scale * factor, selected.shape.minScale, selected.shape.maxScale);
    this.validateAll();
    this.render();
  }

  private onKeyDown(event: EventKeyboard): void {
    const selected = this.getSelected();

    if (event.keyCode === KeyCode.DELETE || event.keyCode === KeyCode.BACKSPACE) {
      this.deleteSelected();
      return;
    }

    if (event.keyCode === KeyCode.KEY_R) {
      this.clearPlacements();
      this.render();
      return;
    }

    if (!selected) {
      return;
    }

    if (event.keyCode === KeyCode.KEY_Q) {
      selected.rotation -= Math.PI / 36;
    } else if (event.keyCode === KeyCode.KEY_E) {
      selected.rotation += Math.PI / 36;
    } else {
      return;
    }

    this.validateAll();
    this.render();
  }

  private deleteSelected(): void {
    if (!this.selectedId) {
      return;
    }

    this.placedCarvings = this.placedCarvings.filter((item) => item.id !== this.selectedId);
    this.selectedId = this.placedCarvings[this.placedCarvings.length - 1]?.id ?? null;
    this.validateAll();
    this.render();
    this.notifyPlacementChanged();
  }

  private submitProcessing(): void {
    const result = this.getSettlementResult();
    if (!result || result.validCount < 1) {
      this.showSubmitMessage(this.getText('noValidProductMessage'), new Color(190, 50, 48, 255));
      return;
    }

    this.onSubmitProcessing?.(result, this.placedCarvings.map((item) => ({ ...item, validationReasons: [...item.validationReasons] })));
  }

  private spawnDeepCrackTestShape(): void {
    if (!this.carvingConfig || !this.jade) {
      return;
    }

    const deepCrack = this.jade.cracks.find((crack) => crack.type === 'deep' && crack.points.length >= 2);
    if (!deepCrack) {
      this.showSubmitMessage(this.getText('noDeepCrackForTestMessage'), new Color(84, 84, 76, 255));
      return;
    }

    const shape = this.carvingConfig.shapes.find((item) => item.id === 'small_bead') ?? this.carvingConfig.shapes[0];
    if (!shape) {
      return;
    }

    const geometry = CarvingShapeFactory.createGeometry(shape, this.jade.sampleCellSize);
    const nextCount = (this.instanceCounters.get(shape.id) ?? 0) + 1;
    this.instanceCounters.set(shape.id, nextCount);
    const segmentIndex = Math.floor((deepCrack.points.length - 1) * 0.5);
    const segmentStart = deepCrack.points[segmentIndex];
    const segmentEnd = deepCrack.points[segmentIndex + 1];
    const position = {
      x: (segmentStart.x + segmentEnd.x) * 0.5,
      y: (segmentStart.y + segmentEnd.y) * 0.5
    };
    const instance: PlacedCarvingData = {
      id: `${shape.id}_${nextCount.toString().padStart(3, '0')}`,
      shape,
      geometry,
      position,
      rotation: 0,
      scale: this.getInitialScale(shape.minScale, shape.maxScale, shape.minValidArea, shape.nominalArea, geometry.approximateArea),
      validationState: 'valid',
      validationReasons: []
    };

    this.placedCarvings.push(instance);
    this.selectedId = instance.id;
    this.validateAll();
    this.render();
    this.notifyPlacementChanged();
  }

  private showSubmitMessage(message: string, color: Color): void {
    this.removeChildByName('ProcessingSubmitMessage');
    const node = this.createTextNode(this.node, 'ProcessingSubmitMessage', message, 0, -455, 24, color, 500);
    node.getComponent(UITransform)?.setContentSize(500, 44);
  }

  private findSpawnPosition(carving: PlacedCarvingData, index: number): Vec2Data {
    if (!this.jade) {
      return { x: 0, y: 0 };
    }

    const offsetPattern = [
      { x: 0, y: 0 },
      { x: 34, y: -26 },
      { x: -34, y: -26 },
      { x: 52, y: 28 },
      { x: -52, y: 28 },
      { x: 0, y: -58 }
    ];
    const offset = offsetPattern[(index - 1) % offsetPattern.length];
    const sortedSamples = [...this.jade.sampleGrid].sort((a, b) => distance(a, { x: -80, y: -10 }) - distance(b, { x: -80, y: -10 }));
    const anchor = sortedSamples[Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * 0.42))] ?? { x: 0, y: 40 };
    const fallback = {
      x: anchor.x + offset.x,
      y: anchor.y + offset.y
    };
    let warningCandidate: Vec2Data | null = null;

    for (let indexInGrid = 0; indexInGrid < sortedSamples.length; indexInGrid += 3) {
      const sample = sortedSamples[indexInGrid];
      carving.position = {
        x: sample.x + offset.x,
        y: sample.y + offset.y
      };
      carving.validationReasons = [];
      const state = this.validateCarving(carving);

      if (state === 'valid') {
        carving.validationReasons = [];
        return carving.position;
      }

      if (state === 'warning' && !warningCandidate) {
        warningCandidate = carving.position;
      }
    }

    if (warningCandidate) {
      return warningCandidate;
    }

    return fallback;
  }

  private getInitialScale(
    minScale: number,
    maxScale: number,
    minValidArea: number,
    nominalArea: number,
    approximateArea: number
  ): number {
    if (approximateArea <= 0) {
      return minScale;
    }

    const recommendedArea = Math.max(nominalArea, minValidArea * 1.08);
    const recommendedScale = Math.sqrt(recommendedArea / approximateArea);
    return clamp(Math.max(1, minScale, recommendedScale), minScale, maxScale);
  }

  private validateAll(): void {
    this.selectedCrackHitDebug = null;

    for (const carving of this.placedCarvings) {
      carving.validationReasons = [];
      carving.validationState = this.validateCarving(carving);
    }

    const selected = this.getSelected();
    if (selected) {
      this.logSelectedValidationDebug(selected);
    } else {
      this.lastValidationDebugKey = '';
    }
  }

  private validateCarving(carving: PlacedCarvingData): 'valid' | 'warning' | 'invalid' {
    if (!this.jade) {
      return 'invalid';
    }

    let isOutsideJade = false;

    if (this.isCarvingOutsideJade(carving)) {
      carving.validationReasons.push('outside_jade');
      isOutsideJade = true;
    }

    const hasOverlap = this.overlapsAnotherCarving(carving);
    if (hasOverlap) {
      carving.validationReasons.push('overlap');
    }

    if (isOutsideJade || hasOverlap) {
      return 'invalid';
    }

    const deepCrackHit = this.findCrackHit(carving, 'deep');
    if (deepCrackHit) {
      carving.validationReasons.push('deep_crack_hit');
      if (carving.id === this.selectedId) {
        this.selectedCrackHitDebug = deepCrackHit;
      }
      return 'invalid';
    }

    if (this.findCrackHit(carving, 'shallow')) {
      carving.validationReasons.push('shallow_crack_hit');
      return 'warning';
    }

    return 'valid';
  }

  private findCrackHit(carving: PlacedCarvingData, crackType: 'shallow' | 'deep'): CrackHitDebugData | null {
    if (!this.jade) {
      return null;
    }

    const cracks = this.jade.cracks.filter((crack) => crack.type === crackType);
    const carvingBounds = this.getCarvingOccupiedBounds(carving);

    for (const crack of cracks) {
      for (let segmentIndex = 0; segmentIndex < crack.points.length - 1; segmentIndex += 1) {
        const segmentStart = crack.points[segmentIndex];
        const segmentEnd = crack.points[segmentIndex + 1];
        const segmentBounds = getSegmentBounds(segmentStart, segmentEnd, crack.width * 0.5);
        if (!boundsIntersect(carvingBounds, segmentBounds)) {
          continue;
        }

        const hitPoint = this.findCrackSegmentHitPoint(carving, crack.width, segmentStart, segmentEnd);
        if (hitPoint) {
          return {
            carvingId: carving.id,
            crackType,
            crackId: crack.id,
            segmentIndex,
            hitPoint,
            segmentStart,
            segmentEnd
          };
        }
      }

      const branchSegments = createCrackBranchSegments(crack);
      for (let branchIndex = 0; branchIndex < branchSegments.length; branchIndex += 1) {
        const branch = branchSegments[branchIndex];
        if (!boundsIntersect(carvingBounds, getSegmentBounds(branch.start, branch.end, branch.width * 0.65))) {
          continue;
        }

        const hitPoint = this.findCrackSegmentHitPoint(carving, branch.width, branch.start, branch.end);
        if (hitPoint) {
          return {
            carvingId: carving.id,
            crackType,
            crackId: crack.id,
            segmentIndex: crack.points.length + branchIndex,
            hitPoint,
            segmentStart: branch.start,
            segmentEnd: branch.end
          };
        }
      }

      const sampleHitPoint = this.findOccupiedSampleCrackHitPoint(carving, crack);
      if (sampleHitPoint) {
        const segmentIndex = this.findNearestCrackSegmentIndex(sampleHitPoint, crack);
        return {
          carvingId: carving.id,
          crackType,
          crackId: crack.id,
          segmentIndex,
          hitPoint: sampleHitPoint,
          segmentStart: crack.points[segmentIndex],
          segmentEnd: crack.points[segmentIndex + 1]
        };
      }
    }

    return null;
  }

  private findOccupiedSampleCrackHitPoint(carving: PlacedCarvingData, crack: CrackData): Vec2Data | null {
    const stride = Math.max(1, Math.floor(carving.geometry.localSamples.length / 420));
    const threshold = Math.max(1.4, crack.width * (crack.type === 'deep' ? 0.58 : 0.55));

    for (let index = 0; index < carving.geometry.localSamples.length; index += stride) {
      const worldPoint = transformPoint(carving.geometry.localSamples[index], carving.position, carving.rotation, carving.scale);
      if (distancePointToPolyline(worldPoint, crack.points) <= threshold) {
        return worldPoint;
      }
    }

    return null;
  }

  private findNearestCrackSegmentIndex(point: Vec2Data, crack: CrackData): number {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < crack.points.length - 1; index += 1) {
      const currentDistance = distancePointToSegment(point, crack.points[index], crack.points[index + 1]);
      if (currentDistance < bestDistance) {
        bestDistance = currentDistance;
        bestIndex = index;
      }
    }

    return bestIndex;
  }

  private findCrackSegmentHitPoint(
    carving: PlacedCarvingData,
    crackWidth: number,
    segmentStart: Vec2Data,
    segmentEnd: Vec2Data
  ): Vec2Data | null {
    const dx = segmentEnd.x - segmentStart.x;
    const dy = segmentEnd.y - segmentStart.y;
    const length = Math.hypot(dx, dy);

    if (length <= 0) {
      return this.containsWorldPoint(carving, segmentStart) ? segmentStart : null;
    }

    const normal = {
      x: -dy / length,
      y: dx / length
    };
    const sampleDistance = Math.max(1.6, Math.min(3.6, crackWidth * 0.35));
    const stepCount = Math.max(1, Math.ceil(length / sampleDistance));
    const offsets = getCrackBandOffsets(crackWidth);

    for (let step = 0; step <= stepCount; step += 1) {
      const t = step / stepCount;
      const center = {
        x: segmentStart.x + dx * t,
        y: segmentStart.y + dy * t
      };

      for (const offset of offsets) {
        const probe = {
          x: center.x + normal.x * offset,
          y: center.y + normal.y * offset
        };

        if (this.containsWorldPoint(carving, probe)) {
          return probe;
        }
      }
    }

    return null;
  }

  private getCarvingOccupiedBounds(carving: PlacedCarvingData): { minX: number; minY: number; maxX: number; maxY: number } {
    const worldOuter = carving.geometry.outerPolygon.map((point) => transformPoint(point, carving.position, carving.rotation, carving.scale));
    return getPointBounds(worldOuter);
  }

  private isCarvingOutsideJade(carving: PlacedCarvingData): boolean {
    if (!this.jade) {
      return true;
    }

    for (const localPoint of this.getOutsideProbePoints(carving)) {
      const worldPoint = transformPoint(localPoint, carving.position, carving.rotation, carving.scale);
      if (!this.isPointInsideJadeWithTolerance(worldPoint)) {
        return true;
      }
    }

    return false;
  }

  private getOutsideProbePoints(carving: PlacedCarvingData): Vec2Data[] {
    const boundaryStep = Math.max(3, this.jade?.sampleCellSize ?? 6);
    return [...carving.geometry.localSamples, ...samplePolyline(carving.geometry.outerPolygon, boundaryStep)];
  }

  private isPointInsideJadeWithTolerance(point: Vec2Data): boolean {
    if (!this.jade) {
      return false;
    }

    return pointInPolygon(point, this.jade.outlinePolygon) || distanceToClosedPolyline(point, this.jade.outlinePolygon) <= JADE_EDGE_TOLERANCE;
  }

  private overlapsAnotherCarving(carving: PlacedCarvingData): boolean {
    const carvingBounds = this.getCarvingOccupiedBounds(carving);

    for (const other of this.placedCarvings) {
      if (other.id === carving.id) {
        continue;
      }

      if (!boundsIntersect(carvingBounds, this.getCarvingOccupiedBounds(other))) {
        continue;
      }

      if (
        this.hasSampleOverlap(carving, other) ||
        this.hasSampleOverlap(other, carving) ||
        this.hasBoundaryPointOverlap(carving, other) ||
        this.hasBoundaryPointOverlap(other, carving) ||
        this.hasBoundaryOverlap(carving, other)
      ) {
        return true;
      }
    }

    return false;
  }

  private hasSampleOverlap(source: PlacedCarvingData, target: PlacedCarvingData): boolean {
    const stride = Math.max(1, Math.floor(source.geometry.localSamples.length / 360));

    for (let index = 0; index < source.geometry.localSamples.length; index += stride) {
      const worldPoint = transformPoint(source.geometry.localSamples[index], source.position, source.rotation, source.scale);
      if (this.containsWorldPoint(target, worldPoint)) {
        return true;
      }
    }

    return false;
  }

  private hasBoundaryPointOverlap(source: PlacedCarvingData, target: PlacedCarvingData): boolean {
    const stepDistance = Math.max(2.5, Math.min(7, (this.jade?.sampleCellSize ?? 6) * 0.55));
    const sourceBoundaries = this.getWorldOccupiedBoundaries(source);

    for (const boundary of sourceBoundaries) {
      const samples = samplePolyline(boundary, stepDistance);
      for (const sample of samples) {
        if (this.containsWorldPoint(target, sample)) {
          return true;
        }
      }
    }

    return false;
  }

  private hasBoundaryOverlap(a: PlacedCarvingData, b: PlacedCarvingData): boolean {
    const aBoundaries = this.getWorldOccupiedBoundaries(a);
    const bBoundaries = this.getWorldOccupiedBoundaries(b);

    for (const aBoundary of aBoundaries) {
      for (let aIndex = 0; aIndex < aBoundary.length; aIndex += 1) {
        const aStart = aBoundary[aIndex];
        const aEnd = aBoundary[(aIndex + 1) % aBoundary.length];

        for (const bBoundary of bBoundaries) {
          for (let bIndex = 0; bIndex < bBoundary.length; bIndex += 1) {
            const bStart = bBoundary[bIndex];
            const bEnd = bBoundary[(bIndex + 1) % bBoundary.length];
            if (segmentsIntersect(aStart, aEnd, bStart, bEnd)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  private getWorldOccupiedBoundaries(carving: PlacedCarvingData): Vec2Data[][] {
    const boundaries = [carving.geometry.outerPolygon.map((point) => transformPoint(point, carving.position, carving.rotation, carving.scale))];
    if (carving.geometry.innerPolygon) {
      boundaries.push(carving.geometry.innerPolygon.map((point) => transformPoint(point, carving.position, carving.rotation, carving.scale)));
    }

    return boundaries;
  }

  private containsWorldPoint(carving: PlacedCarvingData, worldPoint: Vec2Data): boolean {
    const localPoint = inverseTransformPoint(worldPoint, carving.position, carving.rotation, carving.scale);
    return (
      pointInPolygon(localPoint, carving.geometry.outerPolygon) &&
      (!carving.geometry.innerPolygon || !pointInPolygon(localPoint, carving.geometry.innerPolygon))
    );
  }

  private findTopmostCarving(point: Vec2Data): PlacedCarvingData | null {
    for (let index = this.placedCarvings.length - 1; index >= 0; index -= 1) {
      const carving = this.placedCarvings[index];
      if (this.containsWorldPoint(carving, point)) {
        return carving;
      }
    }

    return null;
  }

  private render(): void {
    const graphics = this.layerGraphics;
    if (!graphics) {
      return;
    }

    graphics.clear();

    for (const carving of this.placedCarvings) {
      this.drawCarving(graphics, carving);
    }

    const selected = this.getSelected();
    if (selected) {
      this.drawHandles(graphics, selected);
      this.drawCrackHitDebug(graphics, selected);
    }
    this.updateSettlementUi(selected);
  }

  private drawCrackHitDebug(graphics: Graphics, selected: PlacedCarvingData): void {
    if (!this.showCrackHitDebug) {
      return;
    }

    const hit = this.selectedCrackHitDebug;
    if (!hit || hit.carvingId !== selected.id || hit.crackType !== 'deep') {
      return;
    }

    graphics.strokeColor = new Color(26, 176, 235, 245);
    graphics.fillColor = new Color(26, 176, 235, 210);
    graphics.lineWidth = 5;
    graphics.moveTo(hit.segmentStart.x, hit.segmentStart.y);
    graphics.lineTo(hit.segmentEnd.x, hit.segmentEnd.y);
    graphics.stroke();
    graphics.circle(hit.hitPoint.x, hit.hitPoint.y, 6);
    graphics.fill();
  }

  private drawCarving(graphics: Graphics, carving: PlacedCarvingData): void {
    const selected = carving.id === this.selectedId;
    const strokeColor = getStatusColor(carving.validationState, selected);
    const outer = carving.geometry.outerPolygon.map((point) => transformPoint(point, carving.position, carving.rotation, carving.scale));
    const inner = carving.geometry.innerPolygon?.map((point) => transformPoint(point, carving.position, carving.rotation, carving.scale));

    if (carving.shape.shapeKind === 'ring' && inner) {
      this.drawRingCarving(graphics, carving, outer, inner, strokeColor, selected);
      return;
    }

    drawPath(graphics, outer);
    graphics.fillColor = new Color(242, 227, 198, selected ? 150 : 108);
    graphics.strokeColor = strokeColor;
    graphics.lineWidth = selected ? 4 : 3;
    graphics.fill();
    graphics.stroke();
  }

  private drawRingCarving(
    graphics: Graphics,
    carving: PlacedCarvingData,
    outer: Vec2Data[],
    inner: Vec2Data[],
    strokeColor: Color,
    selected: boolean
  ): void {
    const fillAlpha = carving.validationState === 'invalid' ? 34 : selected ? 30 : 18;
    const sampleStride = Math.max(1, Math.floor(carving.geometry.localSamples.length / 160));

    graphics.fillColor = new Color(strokeColor.r, strokeColor.g, strokeColor.b, fillAlpha);
    for (let index = 0; index < carving.geometry.localSamples.length; index += sampleStride) {
      const point = transformPoint(carving.geometry.localSamples[index], carving.position, carving.rotation, carving.scale);
      graphics.circle(point.x, point.y, Math.max(1.4, 2.2 * carving.scale));
      graphics.fill();
    }

    graphics.strokeColor = new Color(strokeColor.r, strokeColor.g, strokeColor.b, selected || carving.validationState === 'invalid' ? 255 : 190);
    graphics.lineWidth = selected ? 4 : 3;
    drawOpenPath(graphics, outer);
    graphics.stroke();
    drawOpenPath(graphics, inner);
    graphics.stroke();
  }

  private drawHandles(graphics: Graphics, carving: PlacedCarvingData): void {
    const rotatePoint = this.getRotateHandlePoint(carving);
    const scalePoint = this.getScaleHandlePoint(carving);
    const deletePoint = this.getDeleteHandlePoint(carving);

    graphics.strokeColor = new Color(47, 100, 237, 210);
    graphics.fillColor = new Color(255, 255, 255, 230);
    graphics.lineWidth = 2;

    graphics.circle(rotatePoint.x, rotatePoint.y, 8);
    graphics.fill();
    graphics.stroke();

    graphics.rect(scalePoint.x - 7, scalePoint.y - 7, 14, 14);
    graphics.fill();
    graphics.stroke();

    graphics.fillColor = new Color(220, 42, 42, 245);
    graphics.strokeColor = new Color(105, 18, 18, 255);
    graphics.lineWidth = 3;
    graphics.circle(deletePoint.x, deletePoint.y, 13);
    graphics.fill();
    graphics.stroke();

    graphics.strokeColor = new Color(255, 255, 255, 255);
    graphics.lineWidth = 4;
    graphics.moveTo(deletePoint.x - 6, deletePoint.y - 6);
    graphics.lineTo(deletePoint.x + 6, deletePoint.y + 6);
    graphics.moveTo(deletePoint.x - 6, deletePoint.y + 6);
    graphics.lineTo(deletePoint.x + 6, deletePoint.y - 6);
    graphics.stroke();
  }

  private updateSettlementUi(_selected: PlacedCarvingData | null): void {
    if (!this.settlementCalculator) {
      return;
    }

    this.settlementResult = this.settlementCalculator.calculate(this.placedCarvings);

    if (this.settlementSummaryLabel) {
      this.settlementSummaryLabel.string = [
        `${this.getText('jadeCostLabel')}: ${formatMoney(this.settlementResult.jadeCost)}`,
        `${this.getText('marketValueLabel')}: ${formatMoney(this.settlementResult.currentMarketValue)}`,
        `${this.getText('validProductLabel')}: ${this.settlementResult.validCount}/${this.settlementResult.placedCount}`
      ].join('\n');
      this.settlementSummaryLabel.color = new Color(37, 45, 39, 255);
    }

    if (this.settlementProfitLabel) {
      this.settlementProfitLabel.string = `${this.getText('profitLabel')}: ${formatSignedMoney(this.settlementResult.currentProfit)}`;
      this.settlementProfitLabel.color = this.settlementResult.currentProfit >= 0 ? new Color(36, 128, 67, 255) : new Color(183, 35, 44, 255);
    }
  }

  private getRotateHandlePoint(carving: PlacedCarvingData): Vec2Data {
    return transformPoint({ x: 0, y: carving.shape.geometry.height * 0.62 }, carving.position, carving.rotation, carving.scale);
  }

  private getScaleHandlePoint(carving: PlacedCarvingData): Vec2Data {
    return transformPoint(
      { x: carving.shape.geometry.width * 0.55, y: -carving.shape.geometry.height * 0.55 },
      carving.position,
      carving.rotation,
      carving.scale
    );
  }

  private getDeleteHandlePoint(carving: PlacedCarvingData): Vec2Data {
    return transformPoint(
      { x: carving.shape.geometry.width * 0.64, y: carving.shape.geometry.height * 0.5 },
      carving.position,
      carving.rotation,
      carving.scale
    );
  }

  private getSelected(): PlacedCarvingData | null {
    return this.placedCarvings.find((item) => item.id === this.selectedId) ?? null;
  }

  private getValidationBadgeTarget(selected: PlacedCarvingData | null): PlacedCarvingData | null {
    if (selected && selected.validationState !== 'valid') {
      return selected;
    }

    return (
      this.placedCarvings.find((item) => item.validationState === 'invalid') ??
      this.placedCarvings.find((item) => item.validationState === 'warning') ??
      null
    );
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

  private ensureLayerGraphics(): void {
    this.layerGraphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
  }

  private logLayoutAreas(): void {
    const transform = this.node.getComponent(UITransform);
    console.log(`[CarvingLayoutController] canvas size: ${transform?.width ?? 0}x${transform?.height ?? 0}`);
    console.log(`[CarvingLayoutController] topInfoArea: ${JSON.stringify(TOP_INFO_AREA)}`);
    console.log(`[CarvingLayoutController] jadeWorkArea: ${JSON.stringify(JADE_WORK_AREA)}`);
    console.log(`[CarvingLayoutController] shapePaletteArea: ${JSON.stringify(SHAPE_PALETTE_AREA)}`);
    console.log(`[CarvingLayoutController] actionButtonArea: ${JSON.stringify(ACTION_BUTTON_AREA)}`);
  }

  private removeChildByName(name: string): void {
    const child = this.node.getChildByName(name);
    if (child) {
      child.destroy();
    }
  }

  private createTextNode(
    parent: Node,
    nodeName: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: Color,
    width = 170
  ): Node {
    const node = new Node(nodeName);
    parent.addChild(node);
    node.layer = parent.layer;
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(width, 40);
    const labelNode = new Node(`${nodeName}_Label`);
    node.addChild(labelNode);
    labelNode.layer = parent.layer;
    labelNode.setPosition(new Vec3(0, 0, 1));
    labelNode.addComponent(UITransform).setContentSize(width, 40);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 4;
    label.color = color;
    return node;
  }

  private drawPanelBackground(node: Node, width: number, height: number, fill: Color, stroke: Color): void {
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = fill;
    graphics.strokeColor = stroke;
    graphics.lineWidth = 3;
    graphics.rect(-width * 0.5, -height * 0.5, width, height);
    graphics.fill();
    graphics.stroke();
  }

  private drawButtonBackground(node: Node, width: number, height: number, fill: Color, stroke: Color): void {
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = fill;
    graphics.strokeColor = stroke;
    graphics.lineWidth = 2;
    graphics.rect(-width * 0.5, -height * 0.5, width, height);
    graphics.fill();
    graphics.stroke();
  }

  private notifyPlacementChanged(): void {
    this.onPlacementChanged?.(this.placedCarvings.length);
  }

  private logSelectedValidationDebug(selected: PlacedCarvingData): void {
    const deepHit = this.selectedCrackHitDebug;
    const key = [
      selected.id,
      selected.validationState,
      selected.validationReasons.join(','),
      deepHit?.crackId ?? 'none',
      deepHit?.segmentIndex ?? -1,
      deepHit ? `${Math.round(deepHit.hitPoint.x)},${Math.round(deepHit.hitPoint.y)}` : 'none'
    ].join('|');

    if (key === this.lastValidationDebugKey) {
      return;
    }

    this.lastValidationDebugKey = key;
    console.log(
      [
        `[CarvingLayoutController] validation debug selected=${selected.id}`,
        `state=${selected.validationState}`,
        `reasons=${selected.validationReasons.join(',') || 'none'}`,
        `deepCrackHit=${deepHit ? 'true' : 'false'}`,
        `crackId=${deepHit?.crackId ?? 'none'}`,
        `segmentIndex=${deepHit?.segmentIndex ?? -1}`,
        `hitPoint=${deepHit ? `${deepHit.hitPoint.x.toFixed(1)},${deepHit.hitPoint.y.toFixed(1)}` : 'none'}`
      ].join(' | ')
    );
  }

  private getText(key: string): string {
    return this.textConfig?.texts[key] ?? key;
  }
}

function drawPath(graphics: Graphics, points: Vec2Data[]): void {
  if (points.length === 0) {
    return;
  }

  graphics.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    graphics.lineTo(points[index].x, points[index].y);
  }
  graphics.close();
}

function drawOpenPath(graphics: Graphics, points: Vec2Data[]): void {
  if (points.length === 0) {
    return;
  }

  graphics.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    graphics.lineTo(points[index].x, points[index].y);
  }
  graphics.lineTo(points[0].x, points[0].y);
}

function distance(a: Vec2Data, b: Vec2Data): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function samplePolyline(points: Vec2Data[], stepDistance: number): Vec2Data[] {
  const samples: Vec2Data[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const length = Math.max(1, distance(start, end));
    const stepCount = Math.max(1, Math.ceil(length / stepDistance));

    for (let step = 0; step <= stepCount; step += 1) {
      const t = step / stepCount;
      samples.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t
      });
    }
  }

  return samples;
}

function distanceToClosedPolyline(point: Vec2Data, polygon: Vec2Data[]): number {
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < polygon.length; index += 1) {
    bestDistance = Math.min(bestDistance, distancePointToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]));
  }

  return bestDistance;
}

function distancePointToSegment(point: Vec2Data, start: Vec2Data, end: Vec2Data): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 0) {
    return distance(point, start);
  }

  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = clamp(rawT, 0, 1);
  return distance(point, {
    x: start.x + dx * t,
    y: start.y + dy * t
  });
}

function getPointBounds(points: Vec2Data[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
  );
}

function getSegmentBounds(
  start: Vec2Data,
  end: Vec2Data,
  expand: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(start.x, end.x) - expand,
    minY: Math.min(start.y, end.y) - expand,
    maxX: Math.max(start.x, end.x) + expand,
    maxY: Math.max(start.y, end.y) + expand
  };
}

function boundsIntersect(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function segmentsIntersect(aStart: Vec2Data, aEnd: Vec2Data, bStart: Vec2Data, bEnd: Vec2Data): boolean {
  const d1 = cross(aStart, aEnd, bStart);
  const d2 = cross(aStart, aEnd, bEnd);
  const d3 = cross(bStart, bEnd, aStart);
  const d4 = cross(bStart, bEnd, aEnd);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  const epsilon = 0.001;
  return (
    (Math.abs(d1) <= epsilon && pointOnSegment(bStart, aStart, aEnd)) ||
    (Math.abs(d2) <= epsilon && pointOnSegment(bEnd, aStart, aEnd)) ||
    (Math.abs(d3) <= epsilon && pointOnSegment(aStart, bStart, bEnd)) ||
    (Math.abs(d4) <= epsilon && pointOnSegment(aEnd, bStart, bEnd))
  );
}

function cross(start: Vec2Data, end: Vec2Data, point: Vec2Data): number {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}

function pointOnSegment(point: Vec2Data, start: Vec2Data, end: Vec2Data): boolean {
  const epsilon = 0.001;
  return (
    point.x >= Math.min(start.x, end.x) - epsilon &&
    point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon &&
    point.y <= Math.max(start.y, end.y) + epsilon
  );
}

function getCrackBandOffsets(width: number): number[] {
  const halfWidth = width * 0.5;
  return [0, -halfWidth * 0.5, halfWidth * 0.5, -halfWidth * 0.88, halfWidth * 0.88];
}

function createCrackBranchSegments(crack: CrackData): { start: Vec2Data; end: Vec2Data; width: number }[] {
  const segments: { start: Vec2Data; end: Vec2Data; width: number }[] = [];
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

    segments.push({
      start: base,
      end: {
        x: base.x + normal.x * branchLength + (dx / length) * branchLength * 0.28,
        y: base.y + normal.y * branchLength + (dy / length) * branchLength * 0.28
      },
      width: crack.width * (crack.type === 'deep' ? 0.38 : 0.24)
    });
  }

  return segments;
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

function formatMoney(value: number): string {
  return `${Math.round(value)}`;
}

function formatSignedMoney(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function getStatusColor(state: 'valid' | 'warning' | 'invalid', selected: boolean): Color {
  if (state === 'invalid') {
    return new Color(214, 51, 51, 230);
  }

  if (state === 'warning') {
    return new Color(240, 166, 32, 230);
  }

  if (selected) {
    return new Color(47, 158, 68, 230);
  }

  return new Color(45, 80, 60, 175);
}

function getMouseWheelEventName(): string {
  const eventType = Node.EventType as unknown as Record<string, string>;
  return eventType.MOUSE_WHEEL ?? 'mouse-wheel';
}

function stopPropagation(event: EventTouch): void {
  (event as unknown as { propagationStopped: boolean }).propagationStopped = true;
}
