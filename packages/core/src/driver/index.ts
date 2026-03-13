export type {
  IDriver,
  IDriverContext,
  IDriverPage,
  IDriverLocator,
  DriverLaunchOptions,
} from './types.js';

export { PlaywrightDriver } from './playwright-driver.js';
export { AppiumDriver } from './appium-driver.js';

import type { IDriver, DriverLaunchOptions } from './types.js';
import { PlaywrightDriver } from './playwright-driver.js';

export async function createDriver(
  options: DriverLaunchOptions,
): Promise<IDriver> {
  let driver: IDriver;

  if (options.platform === 'ios' || options.platform === 'android') {
    // Dynamic import to avoid requiring webdriverio for web-only users
    const { AppiumDriver } = await import('./appium-driver.js');
    driver = new AppiumDriver();
  } else {
    driver = new PlaywrightDriver();
  }

  await driver.launch(options);
  return driver;
}
