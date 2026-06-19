import { Color, Component, EventTouch, Graphics, Label, Node, UITransform, Vec3, _decorator } from 'cc';

import { LoadedGameConfigs } from '../config/GameConfigTypes';
import { fitJadeToViewport } from '../core/geometry/JadeViewportFitter';
import { JadeGenerator } from '../core/generator/JadeGenerator';
import { SeededRandom } from '../core/random/SeededRandom';
import { MarketStoneData, ProcessingJobData, DailySalesResult, EstimatedProductData, FinishedProductData, ProductStatus } from '../data/BusinessTypes';
import { PlacedCarvingData } from '../data/CarvingTypes';
import { JadePieceData, Vec2Data } from '../data/JadeTypes';
import { LayoutSettlementResult } from '../data/SettlementTypes';
import { JadeDemoRenderer } from '../render/JadeDemoRenderer';
import { CarvingLayoutController } from './CarvingLayoutController';
import { JadeRevealController } from './JadeRevealController';
import { SettlementCalculator } from './SettlementCalculator';

const { ccclass } = _decorator;
const PORTRAIT_WIDTH = 720;
const PORTRAIT_HEIGHT = 1280;
const JADE_WORK_AREA = { x: -330, y: -338, width: 660, height: 770 };
const SALES_EVENT_INTERVAL_SECONDS = 0.62;
const PROCESSING_ANIMATION_SECONDS = 1.35;
const DEFAULT_SHELF_SLOT_COUNT = 6;

type ProductSaleStatus = 'pending' | 'sold' | 'unsold';
type InventoryFilter = 'all' | ProductStatus;
const INVENTORY_PRODUCTS_PER_PAGE = 6;

interface SalesEventData {
  customerIndex: number;
  productId: string | null;
  purchased: boolean;
}

interface SalesSessionData {
  completedProductCount: number;
  customerCount: number;
  events: SalesEventData[];
  processedCount: number;
  soldCount: number;
  income: number;
  soldProductIds: string[];
  shelfProductIds: string[];
  soldOutEarly: boolean;
  isFinished: boolean;
  message: string;
}

@ccclass('MvpGameController')
export class MvpGameController extends Component {
  private configs: LoadedGameConfigs | null = null;
  private jadeLayer: Node | null = null;
  private carvingLayer: Node | null = null;
  private debugLabel: Label | null = null;
  private arrangeLayers: (() => void) | null = null;
  private coins = 0;
  private day = 1;
  private marketStones: MarketStoneData[] = [];
  private processingJobs: ProcessingJobData[] = [];
  private finishedProducts: FinishedProductData[] = [];
  private currentStone: MarketStoneData | null = null;
  private statusMessage = '';
  private lastSalesResult: DailySalesResult = { soldCount: 0, income: 0, customerCount: 0, completedProductCount: 0, unsoldCount: 0, soldProducts: [] };
  private activeSalesSession: SalesSessionData | null = null;
  private salesSequenceToken = 0;
  private processingSequenceToken = 0;
  private productCardStatus = new Map<string, string>();
  private inventoryFilter: InventoryFilter = 'all';
  private inventoryPage = 0;
  private newlyCompletedProductCount = 0;
  private jobCounter = 0;
  private productCounter = 0;

  public initialize(
    configs: LoadedGameConfigs,
    jadeLayer: Node,
    carvingLayer: Node,
    debugLabel: Label | null,
    arrangeLayers: () => void
  ): void {
    this.configs = configs;
    this.jadeLayer = jadeLayer;
    this.carvingLayer = carvingLayer;
    this.debugLabel = debugLabel;
    this.arrangeLayers = arrangeLayers;
    this.coins = configs.demoLevel.economy.initialCoins;
    this.day = 1;
    this.marketStones = [];
    this.processingJobs = [];
    this.finishedProducts = [];
    this.currentStone = null;
    this.activeSalesSession = null;
    this.salesSequenceToken = 0;
    this.processingSequenceToken = 0;
    this.inventoryFilter = 'all';
    this.inventoryPage = 0;
    this.newlyCompletedProductCount = 0;
    this.productCardStatus.clear();
    this.statusMessage = this.getText('marketRefreshedMessage');
    this.ensureUiRoot();
    this.refreshMarket();
    this.showMarket();
  }

  private showMarket(): void {
    this.shutdownWorkLayers();
    this.clearUi();
    const graphics = this.getGraphics();
    this.drawStageBackground(graphics);
    this.createHud(this.node, this.getText('marketTitle'));

    const positions = [
      { x: -170, y: 360 },
      { x: 170, y: 360 },
      { x: -170, y: 145 },
      { x: 170, y: 145 },
      { x: -170, y: -70 },
      { x: 170, y: -70 }
    ];

    this.marketStones.forEach((stone, index) => {
      const position = positions[index] ?? positions[positions.length - 1];
      this.createMarketCard(stone, position.x, position.y);
    });

    this.createStatusPanel();
    this.createProductSummary();
    this.createCommercialPlaceholderPanel();
    this.createButton(this.node, 'InventoryButton', this.getText('inventoryButton'), -246, -590, 132, 54, new Color(248, 241, 221, 245), new Color(98, 83, 64, 255), () => {
      this.showInventoryManagement('all', 0);
    }, 20);
    this.createButton(this.node, 'StallButton', this.getText('stallButton'), -82, -590, 132, 54, new Color(248, 241, 221, 245), new Color(98, 83, 64, 255), () => {
      this.showInventoryManagement('on_shelf');
    }, 20);
    this.createButton(this.node, 'StartSalesButton', this.getText('startSalesButton'), 82, -590, 132, 54, new Color(222, 246, 220, 255), new Color(66, 116, 72, 255), () => {
      this.startDailySales();
    }, 20);
    this.createButton(this.node, 'NextDayButton', this.getText('nextDayButton'), 246, -590, 132, 54, new Color(232, 241, 252, 255), new Color(74, 110, 132, 255), () => {
      this.advanceDay();
    }, 20);
    this.updateDebugInfo();
    this.arrangeLayers?.();
  }

  private createMarketCard(stone: MarketStoneData, x: number, y: number): void {
    const card = new Node(`MarketStoneCard_${stone.id}`);
    this.node.addChild(card);
    card.layer = this.node.layer;
    card.setPosition(new Vec3(x, y, 0));
    card.addComponent(UITransform).setContentSize(300, 190);
    const graphics = card.addComponent(Graphics);
    this.drawPanel(graphics, 300, 190, new Color(248, 241, 221, 242), new Color(98, 83, 64, 255));
    this.drawStonePreview(graphics, stone.previewJade);
    this.createTextNode(card, `StoneQuality_${stone.id}`, `${stone.jade.qualityProfileDisplayName} / ${stone.jade.materialQualityDisplayName}`, 0, -36, 17, new Color(68, 62, 52, 255), 250);
    this.createTextNode(card, `StonePrice_${stone.id}`, `${this.getText('jadeCostLabel')}: ${stone.price}`, 0, -62, 21, new Color(49, 43, 36, 255), 250);

    const buttonText = stone.isPurchased ? this.getText('ownedLabel') : this.getText('buyButton');
    const button = this.createButton(card, `BuyStoneButton_${stone.id}`, buttonText, 0, -92, 120, 38, new Color(231, 250, 234, 255), new Color(70, 120, 80, 255), () => {
      this.buyStone(stone.id);
    }, 19);
    button.active = !stone.isPurchased;
  }

  private buyStone(stoneId: string): void {
    const stone = this.marketStones.find((item) => item.id === stoneId);
    if (!stone || stone.isPurchased) {
      return;
    }

    if (this.coins < stone.price) {
      this.statusMessage = this.getText('insufficientCoinsMessage');
      this.showMarket();
      return;
    }

    this.coins -= stone.price;
    stone.isPurchased = true;
    this.currentStone = stone;
    this.showReveal(stone);
  }

  private showReveal(stone: MarketStoneData): void {
    if (!this.configs || !this.jadeLayer || !this.carvingLayer) {
      return;
    }

    this.clearUi();
    this.createMiniHud();
    this.jadeLayer.active = true;
    this.carvingLayer.active = false;
    this.getCarvingController()?.shutdown();

    const renderer = this.jadeLayer.getComponent(JadeDemoRenderer) ?? this.jadeLayer.addComponent(JadeDemoRenderer);
    renderer.graphics = this.jadeLayer.getComponent(Graphics);
    renderer.seedLabel = this.debugLabel;

    const revealController = this.jadeLayer.getComponent(JadeRevealController) ?? this.jadeLayer.addComponent(JadeRevealController);
    revealController.initialize(stone.jade, this.configs.jade, this.configs.color, this.configs.demoLevel, this.configs.settlement, this.configs.text, renderer, () => {
      this.showCarving(stone);
    });

    this.updateDebugInfo();
    this.arrangeLayers?.();
  }

  private showCarving(stone: MarketStoneData): void {
    if (!this.configs || !this.carvingLayer) {
      return;
    }

    this.clearUi();
    this.carvingLayer.active = true;
    const carvingController = this.carvingLayer.getComponent(CarvingLayoutController) ?? this.carvingLayer.addComponent(CarvingLayoutController);
    carvingController.initialize(
      stone.jade,
      this.configs.carving,
      this.configs.color,
      this.configs.settlement,
      this.configs.text,
      this.configs.demoLevel,
      () => this.updateDebugInfo(),
      (result, placedCarvings) => this.submitProcessing(stone, result, placedCarvings)
    );
    this.updateDebugInfo();
    this.arrangeLayers?.();
  }

  private submitProcessing(stone: MarketStoneData, result: LayoutSettlementResult, placedCarvings: PlacedCarvingData[]): void {
    const estimatedProducts = this.createEstimatedProducts(result);
    if (estimatedProducts.length < 1) {
      return;
    }

    this.jobCounter += 1;
    this.processingJobs.push({
      id: `processing_job_${this.jobCounter.toString().padStart(3, '0')}`,
      sourceStoneId: stone.id,
      materialQualityId: stone.jade.materialQualityId,
      placedCarvings,
      estimatedProducts,
      finishDay: this.day + 1
    });
    this.currentStone = null;
    this.statusMessage = this.getText('processingMessage');
    this.showProcessing();
  }

  private showProcessing(): void {
    this.shutdownWorkLayers();
    this.clearUi();
    const graphics = this.getGraphics();
    this.drawStageBackground(graphics);
    this.createHud(this.node, this.getText('processingTitle'));

    const pendingProductCount = this.processingJobs.reduce((sum, job) => sum + job.estimatedProducts.length, 0);
    this.drawProcessingWorkbench();
    this.createTextNode(
      this.node,
      'ProcessingInfo',
      `${this.getText('processingWorkingMessage')}\n${this.getText('completedProductsLabel')}: ${pendingProductCount}`,
      0,
      210,
      30,
      new Color(42, 48, 42, 255),
      580
    );
    this.createTextNode(this.node, 'ProcessingProgressText', `${this.getText('processingProgressLabel')}: 70%`, 0, 82, 24, new Color(58, 54, 45, 255), 360);
    this.createButton(
      this.node,
      'ProcessingQuickCompleteButton',
      this.getText('quickCompleteProcessingButton'),
      0,
      -160,
      300,
      70,
      new Color(222, 246, 220, 255),
      new Color(66, 116, 72, 255),
      () => {
        this.completeProcessingNow();
      }
    );
    this.scheduleProcessingCompletion();
    this.updateDebugInfo();
    this.arrangeLayers?.();
  }

  private drawProcessingWorkbench(): void {
    const graphics = this.getGraphicsForNode(this.node, 'ProcessingWorkbench');
    graphics.fillColor = new Color(142, 93, 58, 255);
    graphics.rect(-280, -42, 560, 76);
    graphics.fill();
    graphics.fillColor = new Color(192, 135, 82, 255);
    graphics.rect(-252, -5, 504, 34);
    graphics.fill();
    graphics.strokeColor = new Color(80, 58, 42, 255);
    graphics.lineWidth = 4;
    graphics.rect(-280, -42, 560, 76);
    graphics.stroke();

    graphics.fillColor = new Color(246, 238, 214, 255);
    graphics.strokeColor = new Color(92, 76, 55, 255);
    graphics.rect(-222, 48, 444, 38);
    graphics.fill();
    graphics.stroke();
    graphics.fillColor = new Color(80, 146, 78, 255);
    graphics.rect(-218, 52, 312, 30);
    graphics.fill();

    graphics.fillColor = new Color(86, 86, 82, 255);
    graphics.strokeColor = new Color(45, 45, 42, 255);
    graphics.lineWidth = 3;
    graphics.circle(-92, 118, 28);
    graphics.fill();
    graphics.stroke();
    graphics.rect(-102, 58, 20, 68);
    graphics.fill();
    graphics.stroke();
  }

  private scheduleProcessingCompletion(): void {
    const token = this.processingSequenceToken + 1;
    this.processingSequenceToken = token;
    this.scheduleOnce(() => {
      if (token !== this.processingSequenceToken) {
        return;
      }

      this.completeProcessingNow();
    }, PROCESSING_ANIMATION_SECONDS);
  }

  private completeProcessingNow(): void {
    if (this.processingJobs.length === 0) {
      this.showMarket();
      return;
    }

    this.processingSequenceToken += 1;
    this.advanceDay();
  }

  private advanceDay(): void {
    if (!this.configs) {
      return;
    }

    this.day += 1;
    const completedJobs = this.processingJobs.filter((job) => job.finishDay <= this.day);
    this.processingJobs = this.processingJobs.filter((job) => job.finishDay > this.day);
    let completedProductCount = 0;
    for (const job of completedJobs) {
      completedProductCount += this.finishProcessingJob(job);
    }
    this.newlyCompletedProductCount += completedProductCount;
    this.refreshMarket();
    this.statusMessage =
      completedProductCount > 0
        ? this.getText('productsEnteredInventoryMessage')
        : this.getText('marketRefreshedMessage');

    if (completedProductCount > 0) {
      this.showInventoryManagement('all', 0);
    } else {
      this.showMarket();
    }
  }

  private finishProcessingJob(job: ProcessingJobData): number {
    if (!this.configs) {
      return 0;
    }

    const random = new SeededRandom(this.configs.demoLevel.seed + this.day * 3001 + this.productCounter * 97);
    let completedCount = 0;
    for (const estimate of job.estimatedProducts) {
      this.productCounter += 1;
      completedCount += 1;
      const multiplierRange = this.configs.demoLevel.economy.finalSellPriceMultiplierRange;
      const finalSellPrice = Math.max(1, Math.round(estimate.estimatedPrice * random.range(multiplierRange[0], multiplierRange[1])));
      this.finishedProducts.push({
        id: `finished_product_${this.productCounter.toString().padStart(4, '0')}`,
        styleId: estimate.styleId,
        displayName: estimate.displayName,
        estimatedPrice: estimate.estimatedPrice,
        finalSellPrice,
        listedPrice: finalSellPrice,
        status: 'in_inventory',
        sourceStoneId: job.sourceStoneId,
        materialQualityId: job.materialQualityId,
        colorSummary: estimate.colorSummary,
        crackPenalty: estimate.crackPenalty,
        createdDay: this.day,
        soldDay: null,
        isSold: false,
        canDisplay: true
      });
    }

    return completedCount;
  }

  private startDailySales(): void {
    if (this.countProductsByStatus('on_shelf') < 1) {
      this.statusMessage = this.getText('noShelfProductsMessage');
      this.showInventoryManagement('all', this.inventoryPage);
      return;
    }

    this.activeSalesSession = this.prepareDailySales(this.newlyCompletedProductCount);
    this.newlyCompletedProductCount = 0;
    this.syncSalesResultFromSession();
    this.showSalesProcess(true);
  }

  private prepareDailySales(completedProductCount: number): SalesSessionData {
    if (!this.configs) {
      return {
        completedProductCount,
        customerCount: 0,
        events: [],
        processedCount: 0,
        soldCount: 0,
        income: 0,
        soldProductIds: [],
        shelfProductIds: [],
        soldOutEarly: false,
        isFinished: true,
        message: this.getText('salesFinishedMessage')
      };
    }

    const random = new SeededRandom(this.configs.demoLevel.seed + this.day * 7919 + this.finishedProducts.length * 13);
    const events: SalesEventData[] = [];
    const plannedSoldIds = new Set<string>();
    const customerCount = this.configs.demoLevel.economy.dailyCustomerCount;
    const shelfProductIds = this.finishedProducts
      .filter((product) => product.status === 'on_shelf')
      .slice(0, this.getShelfSlotCount())
      .map((product) => product.id);

    for (let customerIndex = 0; customerIndex < customerCount; customerIndex += 1) {
      const availableProducts = this.finishedProducts.filter((product) => shelfProductIds.includes(product.id) && product.status === 'on_shelf' && !plannedSoldIds.has(product.id));
      if (availableProducts.length === 0) {
        break;
      }

      const product = this.pickProductForCustomer(availableProducts, random);
      const sellChance = clamp(0.95 - product.listedPrice / 8500, 0.18, 0.86);
      const purchased = random.chance(sellChance);
      if (purchased) {
        plannedSoldIds.add(product.id);
      }

      events.push({
        customerIndex,
        productId: product.id,
        purchased
      });

      if (plannedSoldIds.size >= shelfProductIds.length) {
        break;
      }
    }

    return {
      completedProductCount,
      customerCount,
      events,
      processedCount: 0,
      soldCount: 0,
      income: 0,
      soldProductIds: [],
      shelfProductIds,
      soldOutEarly: false,
      isFinished: events.length === 0,
      message:
        completedProductCount > 0
          ? this.getText('processingCompletedCountMessage').replace('{count}', `${completedProductCount}`)
          : this.getText('productsOnShelfMessage')
    };
  }

  private showSalesProcess(scheduleNextEvent: boolean): void {
    this.shutdownWorkLayers();
    const hasSalesStage = this.node.getChildByName('SalesResultBackdrop') !== null;
    if (!hasSalesStage) {
      this.clearUi();
      const graphics = this.getGraphics();
      this.drawStageBackground(graphics);
      this.drawSalesResultBackdrop();
    }

    this.clearSalesDynamicUi();
    this.createHud(this.node, this.getText('stallResultTitle'));
    this.createSalesSummaryCards();
    this.createSalesProcessMessage();
    this.createSalesProductCards();

    const session = this.activeSalesSession;
    if (session?.isFinished) {
      this.removeChildByName('SkipSalesButton');
      if (!this.node.getChildByName('ContinuePurchaseButton')) {
        this.createButton(this.node, 'ContinuePurchaseButton', this.getText('continuePurchaseButton'), 0, -520, 300, 70, new Color(222, 246, 220, 255), new Color(66, 116, 72, 255), () => {
          this.activeSalesSession = null;
          this.productCardStatus.clear();
          this.showMarket();
        });
      }
    } else {
      if (!this.node.getChildByName('SkipSalesButton')) {
        this.createButton(this.node, 'SkipSalesButton', this.getText('skipSalesButton'), 0, -520, 300, 70, new Color(250, 241, 218, 255), new Color(128, 96, 54, 255), () => {
          this.skipSalesProcess();
        });
      }
    }

    this.updateDebugInfo();
    this.arrangeLayers?.();

    if (scheduleNextEvent && session && !session.isFinished) {
      this.scheduleNextSalesEvent();
    }
  }

  private drawSalesResultBackdrop(): void {
    const graphics = this.getGraphicsForNode(this.node, 'SalesResultBackdrop');
    graphics.fillColor = new Color(117, 82, 55, 255);
    graphics.rect(-315, -290, 630, 72);
    graphics.fill();
    graphics.fillColor = new Color(168, 113, 73, 255);
    graphics.rect(-292, -252, 584, 34);
    graphics.fill();
    graphics.fillColor = new Color(236, 221, 184, 255);
    graphics.strokeColor = new Color(102, 77, 55, 255);
    graphics.lineWidth = 4;
    graphics.rect(-318, -238, 636, 455);
    graphics.fill();
    graphics.stroke();
    graphics.fillColor = new Color(151, 96, 61, 255);
    graphics.rect(-318, -18, 636, 18);
    graphics.fill();
    graphics.rect(-318, -238, 636, 18);
    graphics.fill();
  }

  private createSalesSummaryCards(): void {
    this.createResultStatCard('IncomeStatCard', this.getText('todayIncomeLabel'), `+${this.lastSalesResult.income}`, -210, 392, new Color(54, 148, 74, 255));
    this.createResultStatCard('SoldStatCard', this.getText('soldCountLabel'), `${this.lastSalesResult.soldCount}`, 0, 392, new Color(62, 96, 156, 255));
    this.createResultStatCard('UnsoldStatCard', this.getText('unsoldCountLabel'), `${this.lastSalesResult.unsoldCount}`, 210, 392, new Color(132, 93, 55, 255));
    this.createTextNode(
      this.node,
      'SalesCustomerInfo',
      `${this.getText('completedProductsLabel')}: ${this.lastSalesResult.completedProductCount}    ${this.getText('customerCountLabel')}: ${this.lastSalesResult.customerCount}`,
      0,
      320,
      22,
      new Color(54, 50, 42, 255),
      620
    );
  }

  private createSalesProcessMessage(): void {
    const session = this.activeSalesSession;
    const message = session?.message ?? this.getText('salesFinishedMessage');
    const progress = session ? `${session.processedCount}/${session.customerCount}` : `${this.lastSalesResult.customerCount}/${this.lastSalesResult.customerCount}`;
    const soldOutLine = session?.soldOutEarly ? `\n${this.getText('salesSoldOutMessage')}` : '';
    this.createTextNode(this.node, 'SalesProcessMessage', `${message}\n${this.getText('customerProgressLabel')}: ${progress}${soldOutLine}`, 0, 282, 22, new Color(60, 52, 42, 255), 620);
  }

  private clearSalesDynamicUi(): void {
    for (const name of [
      'InventoryHint',
      'NoSalesCardHint'
    ]) {
      this.removeChildByName(name);
    }
  }

  private createResultStatCard(nodeName: string, title: string, value: string, x: number, y: number, valueColor: Color): void {
    let card = this.node.getChildByName(nodeName);
    if (!card) {
      card = new Node(nodeName);
      this.node.addChild(card);
      card.addComponent(UITransform).setContentSize(190, 86);
      card.addComponent(Graphics);
    }

    card.layer = this.node.layer;
    card.setPosition(new Vec3(x, y, 2));
    card.getComponent(UITransform)?.setContentSize(190, 86);
    const graphics = card.getComponent(Graphics) ?? card.addComponent(Graphics);
    graphics.clear();
    this.drawPanel(graphics, 190, 86, new Color(255, 248, 226, 245), new Color(102, 78, 55, 255));
    this.createTextNode(card, `${nodeName}_Title`, title, 0, 17, 20, new Color(62, 55, 45, 255), 160);
    this.createTextNode(card, `${nodeName}_Value`, value, 0, -20, 28, valueColor, 160);
  }

  private createSalesProductCards(): void {
    const soldIds = new Set(this.lastSalesResult.soldProducts.map((product) => product.id));
    const shelfIds = this.activeSalesSession?.shelfProductIds ?? this.finishedProducts
      .filter((product) => product.status === 'on_shelf')
      .slice(0, this.getShelfSlotCount())
      .map((product) => product.id);
    const products = shelfIds
      .map((productId) => this.finishedProducts.find((product) => product.id === productId) ?? null)
      .filter((product): product is FinishedProductData => product !== null);
    const positions = [
      { x: -205, y: 152 },
      { x: 0, y: 152 },
      { x: 205, y: 152 },
      { x: -205, y: -74 },
      { x: 0, y: -74 },
      { x: 205, y: -74 }
    ];

    if (products.length === 0) {
      const emptyNode = this.createTextNode(this.node, 'NoSalesCardHint', this.getText('noSalesTodayLabel'), 0, 58, 28, new Color(78, 70, 58, 255), 540);
      emptyNode.getComponent(UITransform)?.setContentSize(540, 70);
      return;
    }

    products.forEach((product, index) => {
      const position = positions[index];
      const status: ProductSaleStatus = soldIds.has(product.id) ? 'sold' : this.activeSalesSession?.isFinished ? 'unsold' : 'pending';
      this.createProductCard(product, status, position.x, position.y);
    });

    this.createTextNode(this.node, 'InventoryHint', this.getText('inventoryHintLabel'), 0, -286, 20, new Color(78, 70, 58, 220), 520);
  }

  private createProductCard(product: FinishedProductData, status: ProductSaleStatus, x: number, y: number): void {
    let card = this.node.getChildByName(`ProductCard_${product.id}`);
    const visiblePrice = status === 'sold' ? product.finalSellPrice : product.listedPrice;
    const statusKey = `${status}:${visiblePrice}`;
    if (!card) {
      card = new Node(`ProductCard_${product.id}`);
      this.node.addChild(card);
      card.layer = this.node.layer;
      card.addComponent(UITransform).setContentSize(184, 198);
      card.addComponent(Graphics);
    } else if (this.productCardStatus.get(product.id) === statusKey) {
      card.setPosition(new Vec3(x, y, 2));
      return;
    }
    this.productCardStatus.set(product.id, statusKey);

    for (const child of [...card.children]) {
      child.destroy();
    }

    card.layer = this.node.layer;
    card.setPosition(new Vec3(x, y, 2));
    const graphics = card.getComponent(Graphics) ?? card.addComponent(Graphics);
    graphics.clear();
    const soldToday = status === 'sold';
    const borderColor =
      status === 'sold' ? new Color(55, 132, 70, 255) : status === 'pending' ? new Color(74, 110, 132, 255) : new Color(120, 94, 64, 255);
    this.drawPanel(graphics, 184, 198, new Color(255, 252, 238, 250), borderColor);
    this.drawProductIcon(graphics, product, soldToday);

    this.createTextNode(card, `ProductName_${product.id}`, product.displayName, 0, 64, 19, new Color(44, 48, 42, 255), 158);
    const pricePrefix = soldToday ? this.getText('priceLabel') : this.getText('listedPriceLabel');
    const priceColor = soldToday ? new Color(43, 142, 62, 255) : new Color(88, 72, 52, 255);
    this.createTextNode(card, `ProductPrice_${product.id}`, `${pricePrefix} +${visiblePrice}`, 0, -50, 18, priceColor, 158);
    this.createProductStatusTag(card, product, status);
  }

  private drawProductIcon(graphics: Graphics, product: FinishedProductData, soldToday: boolean): void {
    const color = this.getProductIconColor(product.colorSummary);
    graphics.fillColor = new Color(color.r, color.g, color.b, soldToday ? 238 : 190);
    graphics.strokeColor = new Color(45, 76, 62, 220);
    graphics.lineWidth = 3;

    if (product.styleId.includes('bangle') || product.styleId.includes('button')) {
      graphics.circle(0, 14, 34);
      graphics.stroke();
      graphics.circle(0, 14, 18);
      graphics.stroke();
    } else if (product.styleId.includes('plaque') || product.styleId.includes('landscape')) {
      graphics.rect(-30, -18, 60, 68);
      graphics.fill();
      graphics.stroke();
    } else if (product.styleId.includes('bead')) {
      graphics.circle(0, 16, 27);
      graphics.fill();
      graphics.stroke();
    } else {
      graphics.moveTo(0, 53);
      graphics.lineTo(34, 8);
      graphics.lineTo(18, -34);
      graphics.lineTo(-20, -34);
      graphics.lineTo(-34, 8);
      graphics.close();
      graphics.fill();
      graphics.stroke();
    }
  }

  private createProductStatusTag(card: Node, product: FinishedProductData, status: ProductSaleStatus): void {
    const tagText =
      status === 'sold' ? this.getText('soldStatusLabel') : status === 'pending' ? this.getText('pendingSaleStatusLabel') : this.getText('unsoldStatusLabel');
    const tagFill =
      status === 'sold' ? new Color(221, 248, 224, 255) : status === 'pending' ? new Color(225, 242, 252, 255) : new Color(239, 233, 217, 255);
    const tagStroke =
      status === 'sold' ? new Color(52, 138, 68, 255) : status === 'pending' ? new Color(62, 110, 146, 255) : new Color(126, 104, 76, 255);
    this.createButton(card, `ProductStatus_${product.id}`, tagText, 0, -82, 96, 30, tagFill, tagStroke, () => undefined, 16);

    if (product.crackPenalty > 0) {
      this.createButton(
        card,
        `CrackPenalty_${product.id}`,
        this.getText('crackPenaltyTag'),
        42,
        34,
        76,
        24,
        new Color(255, 229, 220, 255),
        new Color(174, 80, 62, 255),
        () => undefined,
        13
      );
    }
  }

  private getProductIconColor(colorSummary: string): Color {
    const colorMap: Record<string, Color> = {
      white: new Color(230, 228, 208, 255),
      gray_white: new Color(188, 194, 184, 255),
      light_green: new Color(150, 209, 146, 255),
      green: new Color(76, 172, 95, 255),
      vivid_green: new Color(25, 154, 68, 255),
      deep_green: new Color(23, 105, 61, 255),
      yellow: new Color(216, 180, 74, 255),
      red: new Color(180, 74, 63, 255),
      purple: new Color(146, 101, 181, 255),
      ink: new Color(36, 49, 45, 255),
      mixed: new Color(104, 169, 176, 255)
    };

    return colorMap[colorSummary] ?? new Color(200, 218, 195, 255);
  }

  private pickProductForCustomer(products: FinishedProductData[], random: SeededRandom): FinishedProductData {
    const bias = this.configs?.demoLevel.economy.lowPriceSellBias ?? 1.35;
    const weights = products.map((product) => 1 / Math.pow(Math.max(1, product.listedPrice), bias));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = random.range(0, total);

    for (let index = 0; index < products.length; index += 1) {
      cursor -= weights[index];
      if (cursor <= 0) {
        return products[index];
      }
    }

    return products[products.length - 1];
  }

  private scheduleNextSalesEvent(): void {
    const token = this.salesSequenceToken + 1;
    this.salesSequenceToken = token;
    this.scheduleOnce(() => {
      if (token !== this.salesSequenceToken) {
        return;
      }

      this.processNextSalesEvent();
    }, SALES_EVENT_INTERVAL_SECONDS);
  }

  private processNextSalesEvent(): void {
    const session = this.activeSalesSession;
    if (!session || session.isFinished) {
      return;
    }

    if (session.processedCount >= session.events.length) {
      this.finishSalesSession();
      this.showSalesProcess(false);
      return;
    }

    const event = session.events[session.processedCount];
    session.processedCount += 1;
    this.applySalesEvent(event, session);

    if (session.shelfProductIds.length > 0 && session.soldCount >= session.shelfProductIds.length) {
      session.soldOutEarly = session.processedCount < session.customerCount;
      this.finishSalesSession();
      this.showSalesProcess(false);
      return;
    }

    if (session.processedCount >= session.events.length) {
      this.finishSalesSession();
      this.showSalesProcess(false);
      return;
    }

    this.showSalesProcess(true);
  }

  private skipSalesProcess(): void {
    const session = this.activeSalesSession;
    if (!session || session.isFinished) {
      return;
    }

    this.salesSequenceToken += 1;
    while (session.processedCount < session.events.length) {
      const event = session.events[session.processedCount];
      session.processedCount += 1;
      this.applySalesEvent(event, session);
    }
    session.soldOutEarly = session.shelfProductIds.length > 0 && session.soldCount >= session.shelfProductIds.length && session.processedCount < session.customerCount;
    this.finishSalesSession();
    this.showSalesProcess(false);
  }

  private applySalesEvent(event: SalesEventData, session: SalesSessionData): void {
    const product = event.productId ? this.finishedProducts.find((item) => item.id === event.productId) ?? null : null;
    const customerNumber = event.customerIndex + 1;

    if (event.purchased && product && product.status === 'on_shelf') {
      product.status = 'sold';
      product.isSold = true;
      product.soldDay = this.day;
      session.soldCount += 1;
      session.income += product.finalSellPrice;
      session.soldProductIds.push(product.id);
      this.coins += product.finalSellPrice;
      session.message = this.getText('customerBoughtMessage')
        .replace('{index}', `${customerNumber}`)
        .replace('{name}', product.displayName)
        .replace('{price}', `${product.finalSellPrice}`);
    } else {
      session.message = this.getText('customerLeftMessage').replace('{index}', `${customerNumber}`);
    }

    this.syncSalesResultFromSession();
  }

  private finishSalesSession(): void {
    const session = this.activeSalesSession;
    if (!session) {
      return;
    }

    session.isFinished = true;
    session.message = session.soldOutEarly ? this.getText('salesSoldOutMessage') : this.getText('salesFinishedMessage');
    this.syncSalesResultFromSession();
  }

  private syncSalesResultFromSession(): void {
    const session = this.activeSalesSession;
    if (!session) {
      return;
    }

    const soldIdSet = new Set(session.soldProductIds);
    this.lastSalesResult = {
      soldCount: session.soldCount,
      income: session.income,
      customerCount: session.customerCount,
      completedProductCount: session.completedProductCount,
      unsoldCount: session.shelfProductIds.filter((productId) => !soldIdSet.has(productId)).length,
      soldProducts: this.finishedProducts.filter((product) => soldIdSet.has(product.id))
    };
  }

  private showInventoryManagement(filter: InventoryFilter, page?: number): void {
    this.shutdownWorkLayers();
    const filterChanged = this.inventoryFilter !== filter;
    this.inventoryFilter = filter;
    this.inventoryPage = Math.max(0, Math.floor(page ?? (filterChanged ? 0 : this.inventoryPage)));
    this.clearUi();
    const graphics = this.getGraphics();
    this.drawStageBackground(graphics);
    const title = filter === 'on_shelf' ? this.getText('stallManageTitle') : this.getText('inventoryManageTitle');
    this.createHud(this.node, title);
    this.createInventoryTabs();
    this.createShelfInfoPanel();
    this.createInventoryProductCards(filter);
    this.createInventoryActions();
    this.updateDebugInfo();
    this.arrangeLayers?.();
  }

  private createInventoryTabs(): void {
    const tabs: { filter: InventoryFilter; labelKey: string; x: number }[] = [
      { filter: 'all', labelKey: 'allProductsTab', x: -240 },
      { filter: 'in_inventory', labelKey: 'inventoryProductsTab', x: -80 },
      { filter: 'on_shelf', labelKey: 'shelfProductsTab', x: 80 },
      { filter: 'sold', labelKey: 'soldProductsTab', x: 240 }
    ];

    for (const tab of tabs) {
      const isActive = this.inventoryFilter === tab.filter;
      this.createButton(
        this.node,
        `InventoryTab_${tab.filter}`,
        this.getText(tab.labelKey),
        tab.x,
        438,
        140,
        48,
        isActive ? new Color(222, 246, 220, 255) : new Color(248, 241, 221, 245),
        isActive ? new Color(66, 116, 72, 255) : new Color(98, 83, 64, 255),
        () => {
          this.showInventoryManagement(tab.filter, 0);
        },
        18
      );
    }
  }

  private createShelfInfoPanel(): void {
    const shelfCount = this.countProductsByStatus('on_shelf');
    const shelfSlotCount = this.getShelfSlotCount();
    this.drawPanel(this.getGraphicsForNode(this.node, 'InventoryInfoPanel'), 620, 72, new Color(255, 247, 218, 230), new Color(90, 75, 55, 255), { x: 0, y: 358 });
    this.createTextNode(
      this.node,
      'InventoryInfoText',
      `${this.getText('shelfSlotLabel')}: ${shelfCount}/${shelfSlotCount}    ${this.getText('productStorageTitle')}: ${this.getActiveProductCount()}`,
      0,
      352,
      22,
      new Color(48, 58, 48, 255),
      580
    );
    this.createTextNode(this.node, 'InventoryStatusMessage', this.statusMessage, 0, 322, 18, new Color(80, 64, 48, 230), 580);
  }

  private createInventoryProductCards(filter: InventoryFilter): void {
    const allProducts = this.getFilteredProducts(filter);
    const positions = [
      { x: -205, y: 175 },
      { x: 0, y: 175 },
      { x: 205, y: 175 },
      { x: -205, y: -72 },
      { x: 0, y: -72 },
      { x: 205, y: -72 }
    ];

    if (filter === 'on_shelf') {
      const shelfSlotCount = Math.min(this.getShelfSlotCount(), positions.length);
      for (let index = 0; index < shelfSlotCount; index += 1) {
        const position = positions[index];
        const product = allProducts[index];
        if (product) {
          this.createInventoryProductCard(product, position.x, position.y);
        } else {
          this.createEmptyShelfSlotCard(index, position.x, position.y);
        }
      }
      return;
    }

    const pageCount = Math.max(1, Math.ceil(allProducts.length / INVENTORY_PRODUCTS_PER_PAGE));
    this.inventoryPage = Math.min(this.inventoryPage, pageCount - 1);
    const startIndex = this.inventoryPage * INVENTORY_PRODUCTS_PER_PAGE;
    const products = allProducts.slice(startIndex, startIndex + INVENTORY_PRODUCTS_PER_PAGE);

    if (products.length === 0) {
      this.createTextNode(this.node, 'InventoryEmptyHint', this.getText('emptyInventoryHint'), 0, 92, 28, new Color(78, 70, 58, 255), 520);
      return;
    }

    products.forEach((product, index) => {
      const position = positions[index];
      this.createInventoryProductCard(product, position.x, position.y);
    });

    this.createInventoryPaginationControls(pageCount, allProducts.length);
  }

  private createInventoryPaginationControls(pageCount: number, totalCount: number): void {
    this.createTextNode(
      this.node,
      'InventoryPageInfo',
      `${this.getText('inventoryPageLabel')}: ${this.inventoryPage + 1}/${pageCount}    ${this.getText('inventoryTotalLabel')}: ${totalCount}`,
      0,
      -312,
      19,
      new Color(66, 58, 48, 230),
      480
    );

    const previousButton = this.createButton(this.node, 'InventoryPrevPageButton', this.getText('previousPageButton'), -150, -360, 130, 42, new Color(248, 241, 221, 245), new Color(98, 83, 64, 255), () => {
      this.showInventoryManagement(this.inventoryFilter, Math.max(0, this.inventoryPage - 1));
    }, 17);
    previousButton.active = this.inventoryPage > 0;

    const nextButton = this.createButton(this.node, 'InventoryNextPageButton', this.getText('nextPageButton'), 150, -360, 130, 42, new Color(248, 241, 221, 245), new Color(98, 83, 64, 255), () => {
      this.showInventoryManagement(this.inventoryFilter, Math.min(pageCount - 1, this.inventoryPage + 1));
    }, 17);
    nextButton.active = this.inventoryPage < pageCount - 1;
  }

  private createInventoryProductCard(product: FinishedProductData, x: number, y: number): void {
    const card = new Node(`InventoryProductCard_${product.id}`);
    this.node.addChild(card);
    card.layer = this.node.layer;
    card.setPosition(new Vec3(x, y, 2));
    card.addComponent(UITransform).setContentSize(188, 226);
    const graphics = card.addComponent(Graphics);
    const borderColor = product.status === 'sold' ? new Color(112, 112, 112, 255) : product.status === 'on_shelf' ? new Color(62, 126, 72, 255) : new Color(102, 78, 55, 255);
    this.drawPanel(graphics, 188, 226, new Color(255, 252, 238, 250), borderColor);
    this.drawInventoryPreviewIcon(graphics, product);

    this.createTextNode(card, `InventoryProductName_${product.id}`, product.displayName, 0, 88, 19, new Color(44, 48, 42, 255), 160);
    this.createTextNode(
      card,
      `InventoryProductMeta_${product.id}`,
      `${this.getMaterialQualityDisplayName(product.materialQualityId)} / ${this.getColorSummaryDisplayName(product.colorSummary)}`,
      22,
      45,
      15,
      new Color(78, 70, 58, 230),
      120
    );
    this.createTextNode(card, `InventoryProductPrice_${product.id}`, `${this.getText('listedPriceLabel')}: ${product.listedPrice}`, 0, 16, 17, new Color(88, 72, 52, 255), 160);
    this.createTextNode(card, `InventoryProductStatus_${product.id}`, this.getProductStatusText(product.status), 0, -13, 17, this.getProductStatusColor(product.status), 160);

    if (product.crackPenalty > 0) {
      this.createButton(card, `InventoryCrackPenalty_${product.id}`, this.getText('crackPenaltyTag'), 0, -43, 88, 24, new Color(255, 229, 220, 255), new Color(174, 80, 62, 255), () => undefined, 13);
    }

    if (product.status === 'in_inventory') {
      this.createButton(card, `ListProduct_${product.id}`, this.getText('listProductButton'), 0, -90, 112, 34, new Color(222, 246, 220, 255), new Color(66, 116, 72, 255), () => {
        this.listProduct(product.id);
      }, 16);
    } else if (product.status === 'on_shelf') {
      this.createButton(card, `UnlistProduct_${product.id}`, this.getText('unlistProductButton'), 0, -90, 112, 34, new Color(250, 241, 218, 255), new Color(128, 96, 54, 255), () => {
        this.unlistProduct(product.id);
      }, 16);
    }
  }

  private drawInventoryPreviewIcon(graphics: Graphics, product: FinishedProductData): void {
    const color = this.getProductIconColor(product.colorSummary);
    graphics.fillColor = new Color(color.r, color.g, color.b, product.status === 'sold' ? 130 : 210);
    graphics.strokeColor = new Color(45, 76, 62, 210);
    graphics.lineWidth = 2;
    graphics.circle(-64, 45, 14);
    graphics.fill();
    graphics.stroke();
  }

  private createEmptyShelfSlotCard(slotIndex: number, x: number, y: number): void {
    const card = new Node(`EmptyShelfSlot_${slotIndex}`);
    this.node.addChild(card);
    card.layer = this.node.layer;
    card.setPosition(new Vec3(x, y, 2));
    card.addComponent(UITransform).setContentSize(188, 226);
    const graphics = card.addComponent(Graphics);
    this.drawPanel(graphics, 188, 226, new Color(246, 241, 226, 190), new Color(118, 104, 86, 170));
    graphics.strokeColor = new Color(118, 104, 86, 150);
    graphics.lineWidth = 2;
    graphics.rect(-64, -72, 128, 144);
    graphics.stroke();
    this.createTextNode(card, `EmptyShelfSlotText_${slotIndex}`, this.getText('emptyShelfSlotLabel'), 0, 2, 23, new Color(96, 84, 68, 210), 150);
  }

  private createInventoryActions(): void {
    this.createButton(this.node, 'InventoryBackMarketButton', this.getText('backMarketButton'), -170, -565, 220, 62, new Color(248, 241, 221, 255), new Color(98, 83, 64, 255), () => {
      this.showMarket();
    }, 21);
    this.createButton(this.node, 'InventoryStartSalesButton', this.getText('startSalesButton'), 170, -565, 220, 62, new Color(222, 246, 220, 255), new Color(66, 116, 72, 255), () => {
      this.startDailySales();
    }, 21);
  }

  private getFilteredProducts(filter: InventoryFilter): FinishedProductData[] {
    if (filter === 'all') {
      return [...this.finishedProducts];
    }

    return this.finishedProducts.filter((product) => product.status === filter);
  }

  private listProduct(productId: string): void {
    const product = this.finishedProducts.find((item) => item.id === productId);
    if (!product || product.status !== 'in_inventory') {
      return;
    }

    if (this.countProductsByStatus('on_shelf') >= this.getShelfSlotCount()) {
      this.statusMessage = this.getText('shelfFullMessage');
      this.showInventoryManagement(this.inventoryFilter);
      return;
    }

    product.status = 'on_shelf';
    product.isSold = false;
    this.statusMessage = this.getText('productListedMessage');
    const nextFilter = this.inventoryFilter === 'in_inventory' ? 'all' : this.inventoryFilter;
    this.showInventoryManagement(nextFilter, this.inventoryPage);
  }

  private unlistProduct(productId: string): void {
    const product = this.finishedProducts.find((item) => item.id === productId);
    if (!product || product.status !== 'on_shelf') {
      return;
    }

    product.status = 'in_inventory';
    product.isSold = false;
    product.soldDay = null;
    this.statusMessage = this.getText('productUnlistedMessage');
    const nextFilter = this.inventoryFilter === 'on_shelf' ? 'all' : this.inventoryFilter;
    this.showInventoryManagement(nextFilter, this.inventoryPage);
  }

  private refreshMarket(): void {
    if (!this.configs) {
      return;
    }

    const random = new SeededRandom(this.configs.demoLevel.seed + this.day * 101);
    const range = this.configs.demoLevel.economy.marketStoneCountRange;
    const count = random.int(range[0], range[1]);
    const nextMarket: MarketStoneData[] = [];

    for (let index = 0; index < count; index += 1) {
      const seed = this.pickMarketStoneSeed(index);
      const seededConfigs: LoadedGameConfigs = {
        ...this.configs,
        demoLevel: {
          ...this.configs.demoLevel,
          seed
        }
      };
      const rawJade = new JadeGenerator().generate(seededConfigs);
      const workJade = fitJadeToViewport(rawJade, {
        targetWidth: JADE_WORK_AREA.width,
        targetHeight: JADE_WORK_AREA.height,
        centerX: JADE_WORK_AREA.x + JADE_WORK_AREA.width * 0.5,
        centerY: JADE_WORK_AREA.y + JADE_WORK_AREA.height * 0.5,
        padding: 28
      });
      const previewJade = fitJadeToViewport(rawJade, {
        targetWidth: 190,
        targetHeight: 105,
        centerX: 0,
        centerY: 30,
        padding: 12
      });
      const rawPrice = new SettlementCalculator(workJade, this.configs.color, this.configs.settlement).calculate([]).jadeCost;
      const price = this.applyMarketPriceProtection(rawPrice);
      nextMarket.push({
        id: `market_stone_${this.day}_${index}`,
        jade: workJade,
        previewJade,
        price,
        sizeGradeId: workJade.sizeGradeId,
        isPurchased: false
      });
    }

    this.marketStones = nextMarket;
    this.logMarketGenerationStats(nextMarket);
  }

  private pickMarketStoneSeed(index: number): number {
    const configs = this.configs;
    const baseSeed = (configs?.demoLevel.seed ?? 0) + this.day * 1000 + index * 53;
    if (!configs) {
      return baseSeed;
    }

    const shouldForceDeepCrack =
      configs.demoLevel.debug.forceDeepCrackTestStone || configs.demoLevel.debug.crackTestMode || configs.demoLevel.debug.debugForceDeepCrack;
    if (shouldForceDeepCrack && index === 0) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const seed = baseSeed + attempt * 211;
        const seededConfigs: LoadedGameConfigs = {
          ...configs,
          demoLevel: {
            ...configs.demoLevel,
            seed
          }
        };
        const testJade = new JadeGenerator().generate(seededConfigs);
        if (testJade.cracks.some((crack) => crack.type === 'deep')) {
          return seed;
        }
      }
    }

    const protectionDays = configs.demoLevel.economy.newPlayerProtectionDays ?? 0;
    const guaranteedCount = configs.demoLevel.economy.guaranteedPlayableStonePerDay ?? 0;
    if (this.day <= protectionDays && index < guaranteedCount) {
      for (let attempt = 0; attempt < 14; attempt += 1) {
        const seed = baseSeed + attempt * 307;
        const seededConfigs: LoadedGameConfigs = {
          ...configs,
          demoLevel: {
            ...configs.demoLevel,
            seed
          }
        };
        const testJade = new JadeGenerator().generate(seededConfigs);
        const deepCount = testJade.cracks.filter((crack) => crack.type === 'deep').length;
        const hasUsefulColor = testJade.sampleGrid.some((sample) => sample.colorId && sample.concentration >= 0.5);
        const playableProfile = testJade.qualityProfileId === 'normal' || testJade.qualityProfileId === 'good' || testJade.qualityProfileId === 'premium';
        if (playableProfile && deepCount <= 1 && (hasUsefulColor || testJade.materialQualityFactor >= 0.75)) {
          return seed;
        }
      }
    }

    return baseSeed;
  }

  private applyMarketPriceProtection(rawPrice: number): number {
    const economy = this.configs?.demoLevel.economy;
    if (!economy) {
      return rawPrice;
    }

    const protectionDays = economy.newPlayerProtectionDays ?? 0;
    const discount = economy.marketDiscountForNewPlayer ?? 1;
    return this.day <= protectionDays ? Math.max(1, Math.round(rawPrice * discount)) : rawPrice;
  }

  private logMarketGenerationStats(stones: MarketStoneData[]): void {
    if (stones.length === 0) {
      return;
    }

    const qualityCounts = new Map<string, number>();
    const crackProfileCounts = new Map<string, number>();
    const materialCounts = new Map<string, number>();
    let deepCrackCount = 0;
    let shallowCrackCount = 0;
    let cleanStoneCount = 0;
    let deepOnlyCount = 0;
    let shallowOnlyCount = 0;
    let shallowAndDeepCount = 0;
    let colorRichnessSum = 0;
    let minPrice = Number.POSITIVE_INFINITY;
    let maxPrice = 0;

    for (const stone of stones) {
      const jade = stone.jade;
      qualityCounts.set(jade.qualityProfileId, (qualityCounts.get(jade.qualityProfileId) ?? 0) + 1);
      crackProfileCounts.set(jade.crackProfileId, (crackProfileCounts.get(jade.crackProfileId) ?? 0) + 1);
      materialCounts.set(jade.materialQualityId, (materialCounts.get(jade.materialQualityId) ?? 0) + 1);
      const deepCount = jade.cracks.filter((crack) => crack.type === 'deep').length;
      const shallowCount = jade.cracks.filter((crack) => crack.type === 'shallow').length;
      deepCrackCount += deepCount;
      shallowCrackCount += shallowCount;
      if (deepCount === 0 && shallowCount === 0) {
        cleanStoneCount += 1;
      } else if (deepCount > 0 && shallowCount === 0) {
        deepOnlyCount += 1;
      } else if (deepCount === 0 && shallowCount > 0) {
        shallowOnlyCount += 1;
      } else {
        shallowAndDeepCount += 1;
      }
      colorRichnessSum += jade.colorRichness;
      minPrice = Math.min(minPrice, stone.price);
      maxPrice = Math.max(maxPrice, stone.price);
    }

    console.log(
      [
        '[MvpGameController] market generation stats',
        `market stone count=${stones.length}`,
        `qualityProfile count=${formatCountMap(qualityCounts)}`,
        `crackProfile count=${formatCountMap(crackProfileCounts)}`,
        `deepCrack count=${deepCrackCount}`,
        `shallowCrack count=${shallowCrackCount}`,
        `cleanStone count=${cleanStoneCount}`,
        `deep only count=${deepOnlyCount}`,
        `shallow only count=${shallowOnlyCount}`,
        `shallow + deep count=${shallowAndDeepCount}`,
        `materialQuality count=${formatCountMap(materialCounts)}`,
        `colorRichness average=${(colorRichnessSum / stones.length).toFixed(2)}`,
        `price range=${Math.round(minPrice)}-${Math.round(maxPrice)}`
      ].join(' | ')
    );
  }

  private createEstimatedProducts(result: LayoutSettlementResult): EstimatedProductData[] {
    return result.itemEstimates
      .filter((item) => item.isValidForSale && item.finalEstimate > 0)
      .map((item) => ({
        carvingId: item.carvingId,
        styleId: item.shapeId,
        displayName: item.displayName,
        estimatedPrice: Math.round(item.finalEstimate),
        colorSummary: this.getMainColorSummary(item.colorCoverage),
        crackPenalty: Math.round((1 - item.crackPenaltyCoefficient) * 100)
      }));
  }

  private getMainColorSummary(colorCoverage: Record<string, number>): string {
    let bestColor = 'base';
    let bestCoverage = 0;
    for (const [colorId, coverage] of Object.entries(colorCoverage)) {
      if (coverage > bestCoverage) {
        bestColor = colorId;
        bestCoverage = coverage;
      }
    }

    return bestColor;
  }

  private shutdownWorkLayers(): void {
    this.getCarvingController()?.shutdown();
    if (this.jadeLayer) {
      this.jadeLayer.active = false;
    }
    if (this.carvingLayer) {
      this.carvingLayer.active = false;
    }
  }

  private getCarvingController(): CarvingLayoutController | null {
    return this.carvingLayer?.getComponent(CarvingLayoutController) ?? null;
  }

  private createStatusPanel(): void {
    this.createTextNode(this.node, 'MarketStatusText', this.statusMessage, 0, -265, 24, new Color(45, 55, 45, 255), 620);
  }

  private createProductSummary(): void {
    const inventoryCount = this.countProductsByStatus('in_inventory');
    const shelfCount = this.countProductsByStatus('on_shelf');
    const soldCount = this.countProductsByStatus('sold');
    this.createTextNode(
      this.node,
      'ProductSummaryText',
      `${this.getText('productStorageTitle')}: ${inventoryCount + shelfCount}\n${this.getText('pendingSaleStatusLabel')}: ${shelfCount}\n${this.getText('soldTodayLabel')}: ${soldCount}`,
      -190,
      -350,
      22,
      new Color(50, 58, 50, 255),
      280
    );
  }

  private countProductsByStatus(status: ProductStatus): number {
    return this.finishedProducts.filter((product) => product.status === status).length;
  }

  private getActiveProductCount(): number {
    return this.finishedProducts.filter((product) => product.status !== 'sold').length;
  }

  private getShelfSlotCount(): number {
    return this.configs?.demoLevel.economy.initialShelfSlotCount ?? DEFAULT_SHELF_SLOT_COUNT;
  }

  private getProductStatusText(status: ProductStatus): string {
    if (status === 'in_inventory') {
      return this.getText('inventoryStatusLabel');
    }

    if (status === 'on_shelf') {
      return this.getText('onShelfStatusLabel');
    }

    return this.getText('soldStatusLabel');
  }

  private getProductStatusColor(status: ProductStatus): Color {
    if (status === 'in_inventory') {
      return new Color(88, 72, 52, 255);
    }

    if (status === 'on_shelf') {
      return new Color(52, 138, 68, 255);
    }

    return new Color(112, 112, 112, 255);
  }

  private getMaterialQualityDisplayName(materialQualityId: string): string {
    return this.configs?.demoLevel.economy.materialQualities.find((quality) => quality.id === materialQualityId)?.displayName ?? materialQualityId;
  }

  private getColorSummaryDisplayName(colorSummary: string): string {
    return this.configs?.color.colors.find((color) => color.id === colorSummary)?.displayName ?? colorSummary;
  }

  private createCommercialPlaceholderPanel(): void {
    if (!this.configs) {
      return;
    }

    this.createTextNode(this.node, 'CommercialTitle', this.getText('commercialPlaceholderTitle'), 180, -315, 20, new Color(64, 64, 64, 210), 260);
    this.configs.demoLevel.monetizationPlaceholders.forEach((entry, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      this.createButton(
        this.node,
        `CommercialPlaceholder_${entry.id}`,
        entry.displayName,
        105 + column * 150,
        -354 - row * 43,
        138,
        34,
        new Color(236, 236, 236, 210),
        new Color(124, 124, 124, 210),
        () => {
          this.statusMessage = `${entry.displayName}: ${this.getText('placeholderNotice')}`;
          this.showMarket();
        },
        15
      );
    });
  }

  private createHud(parent: Node, title: string): void {
    this.drawPanel(this.getGraphicsForNode(parent, 'MvpHudBackground'), 660, 112, new Color(255, 247, 218, 236), new Color(90, 75, 55, 255), { x: 0, y: 560 });
    this.createTextNode(parent, 'HudDayText', this.getText('dayLabel').replace('{day}', `${this.day}`), -236, 578, 24, new Color(43, 42, 35, 255), 190);
    this.createTextNode(parent, 'HudCoinText', `${this.getText('coinLabel')}: ${this.coins}`, 128, 578, 24, new Color(43, 84, 44, 255), 260);
    this.createTextNode(parent, 'HudTitleText', title, 0, 532, 28, new Color(58, 45, 35, 255), 360);
  }

  private createMiniHud(): void {
    this.createTextNode(this.node, 'MiniHudText', `${this.getText('dayLabel').replace('{day}', `${this.day}`)}  ${this.getText('coinLabel')}: ${this.coins}`, 0, 612, 22, new Color(48, 64, 48, 255), 520);
  }

  private createTextNode(parent: Node, nodeName: string, text: string, x: number, y: number, fontSize: number, color: Color, width: number): Node {
    let node = parent.getChildByName(nodeName);
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

  private createButton(
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
    fontSize = 22
  ): Node {
    const node = new Node(nodeName);
    parent.addChild(node);
    node.layer = parent.layer;
    node.setPosition(new Vec3(x, y, 2));
    node.addComponent(UITransform).setContentSize(width, height);
    const graphics = node.addComponent(Graphics);
    this.drawPanel(graphics, width, height, fill, stroke);
    const labelNode = this.createTextNode(node, `${nodeName}_Text`, text, 0, 0, fontSize, new Color(44, 48, 42, 255), width - 12);
    labelNode.setPosition(new Vec3(0, -fontSize * 0.35, 3));
    node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      stopPropagation(event);
      onClick();
    });
    return node;
  }

  private drawStonePreview(graphics: Graphics, jade: JadePieceData): void {
    drawPolygon(graphics, jade.outlinePolygon);
    graphics.fillColor = new Color(139, 142, 137, 255);
    graphics.strokeColor = new Color(30, 34, 30, 240);
    graphics.lineWidth = 3;
    graphics.fill();
    graphics.stroke();
  }

  private drawStageBackground(graphics: Graphics): void {
    graphics.clear();
    graphics.fillColor = new Color(157, 145, 136, 255);
    graphics.rect(-PORTRAIT_WIDTH * 0.5, -PORTRAIT_HEIGHT * 0.5, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    graphics.fill();
  }

  private drawPanel(graphics: Graphics, width: number, height: number, fill: Color, stroke: Color, offset?: Vec2Data): void {
    const x = offset?.x ?? 0;
    const y = offset?.y ?? 0;
    graphics.fillColor = fill;
    graphics.strokeColor = stroke;
    graphics.lineWidth = 3;
    graphics.rect(x - width * 0.5, y - height * 0.5, width, height);
    graphics.fill();
    graphics.stroke();
  }

  private getGraphicsForNode(parent: Node, nodeName: string): Graphics {
    let node = parent.getChildByName(nodeName);
    if (!node) {
      node = new Node(nodeName);
      parent.addChild(node);
      node.layer = parent.layer;
      node.setPosition(new Vec3(0, 0, 0));
      node.addComponent(UITransform).setContentSize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    }

    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    return graphics;
  }

  private clearUi(): void {
    for (const child of [...this.node.children]) {
      child.destroy();
    }
    this.getGraphics().clear();
  }

  private removeChildByName(name: string): void {
    const child = this.node.getChildByName(name);
    if (child) {
      child.destroy();
    }
  }

  private ensureUiRoot(): void {
    this.node.active = true;
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    this.getGraphics();
  }

  private getGraphics(): Graphics {
    return this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
  }

  private updateDebugInfo(): void {
    if (!this.debugLabel) {
      return;
    }

    const inventoryCount = this.countProductsByStatus('in_inventory');
    const shelfCount = this.countProductsByStatus('on_shelf');
    const soldCount = this.countProductsByStatus('sold');
    this.debugLabel.string = `Day: ${this.day} | coins: ${this.coins} | market: ${this.marketStones.length} | jobs: ${this.processingJobs.length} | inventory: ${inventoryCount} | shelf: ${shelfCount} | sold: ${soldCount}`;
  }

  private getText(key: string): string {
    return this.configs?.text.texts[key] ?? key;
  }
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatCountMap(counts: Map<string, number>): string {
  return [...counts.entries()]
    .map(([key, count]) => `${key}:${count}`)
    .join(',');
}

function stopPropagation(event: EventTouch): void {
  (event as unknown as { propagationStopped: boolean }).propagationStopped = true;
}
