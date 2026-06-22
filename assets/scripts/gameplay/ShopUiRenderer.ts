import { Color, EventTouch, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH, SHOP_LAYOUT_AREAS } from './ShopLayoutConstants';
import { SHOP_UI_COLORS, SHOP_UI_FONT_SIZES } from './ShopUiTheme';

export interface ShopHudOptions {
  dayPhaseText: string;
  coinText: string;
  title: string;
}

export class ShopUiRenderer {
  public static drawStageBackground(graphics: Graphics): void {
    graphics.clear();
    graphics.fillColor = SHOP_UI_COLORS.stageBackground;
    graphics.rect(-PORTRAIT_WIDTH * 0.5, -PORTRAIT_HEIGHT * 0.5, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    graphics.fill();
  }

  public static drawPanel(graphics: Graphics, width: number, height: number, fill: Color, stroke: Color, offset?: { x: number; y: number }): void {
    const x = offset?.x ?? 0;
    const y = offset?.y ?? 0;
    graphics.fillColor = fill;
    graphics.strokeColor = stroke;
    graphics.lineWidth = 3;
    graphics.rect(x - width * 0.5, y - height * 0.5, width, height);
    graphics.fill();
    graphics.stroke();
  }

  public static createTextNode(parent: Node, nodeName: string, text: string, x: number, y: number, fontSize: number, color: Color, width: number): Node {
    let node = this.getValidChildByName(parent, nodeName);
    if (!node) {
      node = new Node(nodeName);
      parent.addChild(node);
      node.addComponent(UITransform);
      node.addComponent(Label);
    }

    node.layer = parent.layer;
    node.setPosition(new Vec3(x, y, 1));
    node.getComponent(UITransform)?.setContentSize(width, 48);
    const label = node.getComponent(Label) ?? node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = color;
    return node;
  }

  public static createButton(
    parent: Node,
    nodeName: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: Color,
    stroke: Color,
    onClick: () => void,
    fontSize = SHOP_UI_FONT_SIZES.button
  ): Node {
    const node = new Node(nodeName);
    parent.addChild(node);
    node.layer = parent.layer;
    node.setPosition(new Vec3(x, y, 2));
    node.addComponent(UITransform).setContentSize(width, height);
    const graphics = node.addComponent(Graphics);
    this.drawPanel(graphics, width, height, fill, stroke);
    const labelNode = this.createTextNode(node, `${nodeName}_Text`, text, 0, 0, fontSize, SHOP_UI_COLORS.buttonText, width - 12);
    labelNode.setPosition(new Vec3(0, -fontSize * 0.35, 3));
    node.on(Node.EventType.TOUCH_START, stopPropagation);
    node.on(Node.EventType.TOUCH_MOVE, stopPropagation);
    node.on(Node.EventType.TOUCH_CANCEL, stopPropagation);
    node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      stopPropagation(event);
      onClick();
    });
    return node;
  }

  public static createHud(parent: Node, options: ShopHudOptions, getGraphicsForNode: (parent: Node, nodeName: string) => Graphics): void {
    const topBar = SHOP_LAYOUT_AREAS.topBar;
    this.drawPanel(getGraphicsForNode(parent, 'MvpHudBackground'), topBar.width, topBar.height, SHOP_UI_COLORS.panelFill, SHOP_UI_COLORS.panelStroke, {
      x: topBar.x,
      y: topBar.y
    });
    this.createTextNode(parent, 'HudDayText', options.dayPhaseText, -190, 578, SHOP_UI_FONT_SIZES.topBarDay, SHOP_UI_COLORS.mainText, 300);
    this.createTextNode(parent, 'HudCoinText', options.coinText, 176, 578, SHOP_UI_FONT_SIZES.topBarCoin, SHOP_UI_COLORS.coinText, 220);
    this.createTextNode(parent, 'HudTitleText', options.title, 0, 532, SHOP_UI_FONT_SIZES.pageTitle, SHOP_UI_COLORS.titleText, 360);
  }

  public static createMiniHud(parent: Node, text: string): void {
    this.createTextNode(parent, 'MiniHudText', text, 0, 612, SHOP_UI_FONT_SIZES.miniHud, new Color(48, 64, 48, 255), 580);
  }

  public static createToast(parent: Node, message: string): Node {
    const area = SHOP_LAYOUT_AREAS.popup;
    const toast = new Node('ToastMessage');
    parent.addChild(toast);
    toast.layer = parent.layer;
    toast.setPosition(new Vec3(area.x, area.y, 5));
    toast.addComponent(UITransform).setContentSize(area.width, area.height);
    const graphics = toast.addComponent(Graphics);
    this.drawPanel(graphics, area.width, area.height, SHOP_UI_COLORS.toastFill, SHOP_UI_COLORS.toastStroke);
    this.createTextNode(toast, 'ToastMessageText', message, 0, -7, SHOP_UI_FONT_SIZES.toast, SHOP_UI_COLORS.toastText, 380);
    return toast;
  }

  private static getValidChildByName(parent: Node, name: string): Node | null {
    const child = parent.getChildByName(name);
    if (!child) {
      return null;
    }

    if (!child.isValid) {
      child.removeFromParent();
      return null;
    }

    return child;
  }
}

function stopPropagation(event: EventTouch): void {
  (event as unknown as { propagationStopped: boolean }).propagationStopped = true;
}
