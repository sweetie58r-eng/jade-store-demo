import { Color, Graphics } from 'cc';

import { SHOP_UI_COLORS, SHOP_UI_LAYOUT } from './ShopUiTheme';

interface DrawOffset {
  x: number;
  y: number;
}

export class ShopUiRenderer {
  public static drawRoundedPanel(graphics: Graphics, width: number, height: number, fill: Color, stroke: Color, offset?: DrawOffset, radius = 10, lineWidth = 3): void {
    const x = offset?.x ?? 0;
    const y = offset?.y ?? 0;
    graphics.fillColor = fill;
    graphics.strokeColor = stroke;
    graphics.lineWidth = lineWidth;
    const roundedGraphics = graphics as Graphics & { roundRect?: (x: number, y: number, width: number, height: number, radius: number) => void };
    if (roundedGraphics.roundRect) {
      roundedGraphics.roundRect(x - width * 0.5, y - height * 0.5, width, height, radius);
    } else {
      graphics.rect(x - width * 0.5, y - height * 0.5, width, height);
    }
    graphics.fill();
    graphics.stroke();
  }

  public static drawBusinessBackdrop(graphics: Graphics): void {
    const width = SHOP_UI_LAYOUT.portraitWidth;
    const height = SHOP_UI_LAYOUT.portraitHeight;
    graphics.clear();
    graphics.fillColor = SHOP_UI_COLORS.background;
    graphics.rect(-width * 0.5, -height * 0.5, width, height);
    graphics.fill();

    graphics.fillColor = new Color(SHOP_UI_COLORS.backgroundDeep.r, SHOP_UI_COLORS.backgroundDeep.g, SHOP_UI_COLORS.backgroundDeep.b, 82);
    graphics.rect(-width * 0.5, -height * 0.5, width, 122);
    graphics.fill();
    graphics.rect(-width * 0.5, height * 0.5 - 138, width, 138);
    graphics.fill();

    graphics.strokeColor = new Color(SHOP_UI_COLORS.wood.r, SHOP_UI_COLORS.wood.g, SHOP_UI_COLORS.wood.b, 76);
    graphics.lineWidth = 2;
    for (let x = -300; x <= 300; x += 150) {
      graphics.moveTo(x, -512);
      graphics.lineTo(x + 84, -424);
    }
    for (let x = -330; x <= 330; x += 165) {
      graphics.moveTo(x, 435);
      graphics.lineTo(x + 92, 518);
    }
    graphics.stroke();
  }

  public static drawTopSignboard(graphics: Graphics, width: number, height: number, offset: DrawOffset): void {
    this.drawRoundedPanel(graphics, width, height, SHOP_UI_COLORS.woodDark, new Color(54, 34, 22, 255), offset, 18, 4);
    graphics.fillColor = SHOP_UI_COLORS.wood;
    graphics.rect(offset.x - width * 0.5 + 14, offset.y - height * 0.5 + 12, width - 28, height - 24);
    graphics.fill();
    graphics.strokeColor = SHOP_UI_COLORS.gold;
    graphics.lineWidth = 3;
    graphics.rect(offset.x - width * 0.5 + 24, offset.y - height * 0.5 + 20, width - 48, height - 40);
    graphics.stroke();
    this.drawCornerLines(graphics, offset.x, offset.y, width, height, SHOP_UI_COLORS.gold);
  }

  public static drawBottomActionBar(graphics: Graphics, width: number, height: number, offset: DrawOffset): void {
    this.drawRoundedPanel(graphics, width, height, new Color(SHOP_UI_COLORS.wood.r, SHOP_UI_COLORS.wood.g, SHOP_UI_COLORS.wood.b, 238), SHOP_UI_COLORS.woodDark, offset, 16, 4);
    graphics.fillColor = new Color(SHOP_UI_COLORS.woodLight.r, SHOP_UI_COLORS.woodLight.g, SHOP_UI_COLORS.woodLight.b, 165);
    graphics.rect(offset.x - width * 0.5 + 22, offset.y + height * 0.18, width - 44, 14);
    graphics.fill();
  }

  public static drawWarehouseCabinet(graphics: Graphics, width: number, height: number, offset: DrawOffset, columns: number, rows: number): void {
    this.drawRoundedPanel(graphics, width, height, SHOP_UI_COLORS.woodDark, new Color(58, 36, 23, 255), offset, 18, 4);
    this.drawRoundedPanel(graphics, width - 22, height - 22, SHOP_UI_COLORS.woodMid, SHOP_UI_COLORS.wood, offset, 12, 2);
    const innerWidth = width - 48;
    const innerHeight = height - 48;
    const cellWidth = innerWidth / columns;
    const cellHeight = innerHeight / rows;
    graphics.strokeColor = new Color(78, 47, 28, 190);
    graphics.lineWidth = 3;
    for (let column = 1; column < columns; column += 1) {
      const x = offset.x - innerWidth * 0.5 + column * cellWidth;
      graphics.moveTo(x, offset.y - innerHeight * 0.5);
      graphics.lineTo(x, offset.y + innerHeight * 0.5);
    }
    for (let row = 1; row < rows; row += 1) {
      const y = offset.y + innerHeight * 0.5 - row * cellHeight;
      graphics.moveTo(offset.x - innerWidth * 0.5, y);
      graphics.lineTo(offset.x + innerWidth * 0.5, y);
    }
    graphics.stroke();
  }

  public static drawWarehouseCell(graphics: Graphics, width: number, height: number, status: string): void {
    const tint = status === 'sold' ? new Color(211, 199, 174, 235) : status === 'on_shelf' ? new Color(226, 244, 214, 240) : SHOP_UI_COLORS.paper;
    this.drawRoundedPanel(graphics, width, height, new Color(SHOP_UI_COLORS.woodSoft.r, SHOP_UI_COLORS.woodSoft.g, SHOP_UI_COLORS.woodSoft.b, 220), SHOP_UI_COLORS.wood, undefined, 12, 3);
    this.drawRoundedPanel(graphics, width - 18, height - 18, tint, new Color(SHOP_UI_COLORS.wood.r, SHOP_UI_COLORS.wood.g, SHOP_UI_COLORS.wood.b, 130), undefined, 8, 2);
    graphics.fillColor = new Color(SHOP_UI_COLORS.woodLight.r, SHOP_UI_COLORS.woodLight.g, SHOP_UI_COLORS.woodLight.b, 72);
    graphics.rect(-width * 0.5 + 12, -height * 0.5 + 12, width - 24, 10);
    graphics.fill();
  }

  public static drawShelfCounter(graphics: Graphics, width: number, height: number, offset: DrawOffset): void {
    this.drawRoundedPanel(graphics, width, height, new Color(172, 116, 64, 236), SHOP_UI_COLORS.woodDark, offset, 20, 4);
    graphics.fillColor = new Color(244, 221, 176, 230);
    graphics.rect(offset.x - width * 0.5 + 22, offset.y - height * 0.5 + 38, width - 44, height - 78);
    graphics.fill();
    graphics.fillColor = SHOP_UI_COLORS.wood;
    graphics.rect(offset.x - width * 0.5 + 12, offset.y - height * 0.5 + 20, width - 24, 34);
    graphics.fill();
    graphics.fillColor = SHOP_UI_COLORS.woodLight;
    graphics.rect(offset.x - width * 0.5 + 28, offset.y - height * 0.5 + 18, width - 56, 10);
    graphics.fill();
  }

  public static drawShelfTray(graphics: Graphics, width: number, height: number, isEmpty: boolean, status?: string): void {
    const border = status === 'sold' ? SHOP_UI_COLORS.jadeDark : SHOP_UI_COLORS.woodDark;
    this.drawRoundedPanel(graphics, width, height, new Color(236, 207, 155, isEmpty ? 168 : 238), border, undefined, 18, 3);
    graphics.fillColor = isEmpty ? SHOP_UI_COLORS.emptyTray : new Color(255, 243, 204, 238);
    graphics.ellipse(0, -height * 0.1, width * 0.36, height * 0.21);
    graphics.fill();
    graphics.strokeColor = new Color(SHOP_UI_COLORS.wood.r, SHOP_UI_COLORS.wood.g, SHOP_UI_COLORS.wood.b, 168);
    graphics.lineWidth = 3;
    graphics.ellipse(0, -height * 0.1, width * 0.36, height * 0.21);
    graphics.stroke();
  }

  public static drawLedgerPanel(graphics: Graphics, width: number, height: number, offset: DrawOffset): void {
    this.drawRoundedPanel(graphics, width, height, SHOP_UI_COLORS.paper, SHOP_UI_COLORS.woodDark, offset, 18, 4);
    graphics.strokeColor = new Color(SHOP_UI_COLORS.wood.r, SHOP_UI_COLORS.wood.g, SHOP_UI_COLORS.wood.b, 70);
    graphics.lineWidth = 2;
    for (let y = offset.y + height * 0.28; y > offset.y - height * 0.42; y -= 46) {
      graphics.moveTo(offset.x - width * 0.42, y);
      graphics.lineTo(offset.x + width * 0.42, y);
    }
    graphics.stroke();
    this.drawCornerLines(graphics, offset.x, offset.y, width, height, SHOP_UI_COLORS.gold);
  }

  public static drawTag(graphics: Graphics, width: number, height: number, fill: Color, stroke: Color): void {
    this.drawRoundedPanel(graphics, width, height, fill, stroke, undefined, 6, 2);
    graphics.fillColor = stroke;
    graphics.circle(-width * 0.35, 0, 3);
    graphics.fill();
  }

  public static drawSeal(graphics: Graphics, width: number, height: number, color: Color): void {
    this.drawRoundedPanel(graphics, width, height, new Color(color.r, color.g, color.b, 38), color, undefined, 8, 3);
    graphics.strokeColor = color;
    graphics.lineWidth = 2;
    graphics.rect(-width * 0.38, -height * 0.28, width * 0.76, height * 0.56);
    graphics.stroke();
  }

  private static drawCornerLines(graphics: Graphics, x: number, y: number, width: number, height: number, color: Color): void {
    const left = x - width * 0.5 + 32;
    const right = x + width * 0.5 - 32;
    const top = y + height * 0.5 - 26;
    const bottom = y - height * 0.5 + 26;
    graphics.strokeColor = new Color(color.r, color.g, color.b, 190);
    graphics.lineWidth = 2;
    const size = 20;
    graphics.moveTo(left, top - size);
    graphics.lineTo(left, top);
    graphics.lineTo(left + size, top);
    graphics.moveTo(right - size, top);
    graphics.lineTo(right, top);
    graphics.lineTo(right, top - size);
    graphics.moveTo(left, bottom + size);
    graphics.lineTo(left, bottom);
    graphics.lineTo(left + size, bottom);
    graphics.moveTo(right - size, bottom);
    graphics.lineTo(right, bottom);
    graphics.lineTo(right, bottom + size);
    graphics.stroke();
  }
}
