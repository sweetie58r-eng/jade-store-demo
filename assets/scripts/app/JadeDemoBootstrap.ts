import { Color, Component, Graphics, Label, Layers, Node, UITransform, Vec3, _decorator, view } from 'cc';

import { ConfigLoader } from '../config/ConfigLoader';
import { MvpGameController } from '../gameplay/MvpGameController';

const { ccclass, property } = _decorator;
const PORTRAIT_WIDTH = 720;
const PORTRAIT_HEIGHT = 1280;
const SHOW_ALL_RESOLUTION_POLICY = 2;
const TOP_INFO_AREA = { x: -330, y: 468, width: 660, height: 170 };
const JADE_WORK_AREA = { x: -330, y: -338, width: 660, height: 770 };
const SHAPE_PALETTE_AREA = { x: -345, y: -638, width: 690, height: 164 };
const ACTION_BUTTON_AREA = { x: 162, y: -462, width: 180, height: 142 };

@ccclass('JadeDemoBootstrap')
export class JadeDemoBootstrap extends Component {
  @property(Node)
  public renderRoot: Node | null = null;

  @property(Label)
  public seedLabel: Label | null = null;

  public onLoad(): void {
    console.log('[JadeDemoBootstrap] onLoad called');
  }

  public async start(): Promise<void> {
    console.log('[JadeDemoBootstrap] start called');

    try {
      const canvas = this.findCanvasNode();
      console.log(`[JadeDemoBootstrap] canvas mode: ${canvas.name}`);
      this.configurePortraitView(canvas);

      this.clearGameplayLayers(canvas);
      const jadeLayer = this.createGraphicsLayer(canvas, 'JadeRenderLayer', 1);
      const carvingLayer = this.createGraphicsLayer(canvas, 'CarvingLayer', 2);
      const gameUiLayer = this.createUiLayer(canvas, 'GameUiLayer', 3);
      const debugInfoLayer = this.createUiLayer(canvas, 'DebugInfoLayer', 4);
      const debugLabel = this.createDebugInfoLabel(debugInfoLayer);
      this.disableBootstrapDebugLayer(canvas);

      const configs = await ConfigLoader.loadGameConfigs();
      console.log('[JadeDemoBootstrap] config loaded');

      carvingLayer.active = false;
      jadeLayer.active = false;
      const mvpController = gameUiLayer.getComponent(MvpGameController) ?? gameUiLayer.addComponent(MvpGameController);
      mvpController.initialize(configs, jadeLayer, carvingLayer, debugLabel, () => this.arrangeLayerOrder(canvas));
      console.log('[JadeDemoBootstrap] mvp controller initialized');

      this.arrangeLayerOrder(canvas);
      console.log('[JadeDemoBootstrap] draw completed');
    } catch (error) {
      console.error('[JadeDemoBootstrap] start failed', error);
    }
  }

  private findCanvasNode(): Node {
    let current: Node | null = this.node;

    while (current) {
      if (current.name === 'Canvas') {
        return current;
      }
      current = current.parent;
    }

    console.warn('[JadeDemoBootstrap] Canvas node not found; using parent or current node');
    return this.node.parent ?? this.node;
  }

  private configurePortraitView(canvas: Node): void {
    view.resizeWithBrowserSize(false);
    const previewView = view as unknown as { setFrameSize?: (width: number, height: number) => void };
    previewView.setFrameSize?.(PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    view.setDesignResolutionSize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, SHOW_ALL_RESOLUTION_POLICY);
    const canvasTransform = canvas.getComponent(UITransform) ?? canvas.addComponent(UITransform);
    canvasTransform.setAnchorPoint(0.5, 0.5);
    canvasTransform.setContentSize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT);

    const designSize = view.getDesignResolutionSize();
    const visibleSize = view.getVisibleSize();
    console.log(`[JadeDemoBootstrap] design resolution: ${designSize.width}x${designSize.height}`);
    console.log(`[JadeDemoBootstrap] canvas size: ${canvasTransform.width}x${canvasTransform.height}`);
    console.log(`[JadeDemoBootstrap] visible size: ${visibleSize.width}x${visibleSize.height}`);
    console.log(`[JadeDemoBootstrap] topInfoArea: ${JSON.stringify(TOP_INFO_AREA)}`);
    console.log(`[JadeDemoBootstrap] jadeWorkArea: ${JSON.stringify(JADE_WORK_AREA)}`);
    console.log(`[JadeDemoBootstrap] shapePaletteArea: ${JSON.stringify(SHAPE_PALETTE_AREA)}`);
    console.log(`[JadeDemoBootstrap] actionButtonArea: ${JSON.stringify(ACTION_BUTTON_AREA)}`);
  }

  private clearGameplayLayers(canvas: Node): void {
    const names = ['JadeRenderLayer', 'CarvingLayer', 'GameUiLayer', 'DebugInfoLayer', 'BootstrapDebugLayer', 'BootstrapRunningLabel'];

    for (const name of names) {
      const child = canvas.getChildByName(name);
      if (child) {
        child.destroy();
      }
    }

    console.log('[JadeDemoBootstrap] gameplay layers cleared');
  }

  private createGraphicsLayer(canvas: Node, name: string, z: number): Node {
    const node = new Node(name);
    canvas.addChild(node);
    this.prepareUiNode(node, PORTRAIT_WIDTH, PORTRAIT_HEIGHT, z);
    node.addComponent(Graphics);
    return node;
  }

  private createUiLayer(canvas: Node, name: string, z: number): Node {
    const node = new Node(name);
    canvas.addChild(node);
    this.prepareUiNode(node, PORTRAIT_WIDTH, PORTRAIT_HEIGHT, z);
    return node;
  }

  private prepareUiNode(node: Node, width: number, height: number, z: number): void {
    node.active = true;
    node.layer = Layers.Enum.UI_2D;
    node.setPosition(new Vec3(0, 0, z));
    node.setScale(new Vec3(1, 1, 1));

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(width, height);
  }

  private createDebugInfoLabel(parent: Node): Label {
    const node = new Node('DebugInfo');
    parent.addChild(node);
    this.prepareUiNode(node, 640, 36, 0);
    node.setPosition(new Vec3(-320, 610, 0));

    const label = node.addComponent(Label);
    label.fontSize = 14;
    label.lineHeight = 18;
    label.color = new Color(40, 55, 44, 255);
    label.string = 'M2.7 initializing...';
    node.active = false;
    return label;
  }

  private disableBootstrapDebugLayer(canvas: Node): void {
    const debugLayer = canvas.getChildByName('BootstrapDebugLayer');
    const debugLabel = canvas.getChildByName('BootstrapRunningLabel');
    if (debugLayer) {
      debugLayer.active = false;
    }
    if (debugLabel) {
      debugLabel.active = false;
    }
    console.log('[JadeDemoBootstrap] bootstrap debug layer disabled');
  }

  private arrangeLayerOrder(canvas: Node): void {
    const jadeLayer = canvas.getChildByName('JadeRenderLayer');
    const carvingLayer = canvas.getChildByName('CarvingLayer');
    const gameUiLayer = canvas.getChildByName('GameUiLayer');
    const debugInfoLayer = canvas.getChildByName('DebugInfoLayer');

    const ordered = [jadeLayer, carvingLayer, gameUiLayer, debugInfoLayer].filter((node): node is Node => !!node);

    ordered.forEach((node, index) => {
      node.setSiblingIndex(canvas.children.length - ordered.length + index);
    });

    console.log('[JadeDemoBootstrap] layer order arranged');
  }
}
