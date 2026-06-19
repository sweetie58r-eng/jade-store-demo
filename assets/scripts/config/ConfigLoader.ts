import { JsonAsset, resources } from 'cc';

import {
  CarvingConfig,
  ColorConfig,
  CrackConfig,
  CustomerConfig,
  DemoLevelConfig,
  JadeConfig,
  LoadedGameConfigs,
  SettlementConfig,
  TextConfig
} from './GameConfigTypes';

export class ConfigLoader {
  public static async loadM1Configs(): Promise<LoadedGameConfigs> {
    return this.loadGameConfigs();
  }

  public static async loadGameConfigs(): Promise<LoadedGameConfigs> {
    const [demoLevel, jade, color, crack, carving, settlement, customer, text] = await Promise.all([
      this.loadJson<DemoLevelConfig>('config/demo_level_config'),
      this.loadJson<JadeConfig>('config/jade_config'),
      this.loadJson<ColorConfig>('config/color_config'),
      this.loadJson<CrackConfig>('config/crack_config'),
      this.loadJson<CarvingConfig>('config/carving_config'),
      this.loadJson<SettlementConfig>('config/settlement_config'),
      this.loadJson<CustomerConfig>('config/customer_config'),
      this.loadJson<TextConfig>('config/text_config')
    ]);

    return {
      demoLevel,
      jade,
      color,
      crack,
      carving,
      settlement,
      customer,
      text
    };
  }

  private static loadJson<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      resources.load(path, JsonAsset, (error, asset) => {
        if (error || !asset) {
          reject(error ?? new Error(`Failed to load config: ${path}`));
          return;
        }

        resolve(asset.json as T);
      });
    });
  }
}
