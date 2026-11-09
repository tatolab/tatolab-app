// Developer mode: off by default, remembered between launches, and carried on every status so the
// window offers the Transactions view only while it is on.

import type { RememberedSwitchFile } from "./remembered_switch_file.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** Whether Developer mode is on, as remembered in its switch file. */
export class DeveloperModeSwitch {
  private constructor(
    private isDeveloperModeOn: boolean,
    private readonly rememberedSwitch: RememberedSwitchFile,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** Developer mode as `rememberedSwitch` holds it. */
  static async load(rememberedSwitch: RememberedSwitchFile, tatolabAppLog: TatolabAppLog): Promise<DeveloperModeSwitch> {
    return new DeveloperModeSwitch(await rememberedSwitch.loadRememberedSwitch(), rememberedSwitch, tatolabAppLog);
  }

  /** Whether it is on now, as the status carries it. */
  isOnNow(): boolean {
    return this.isDeveloperModeOn;
  }

  /** Turn Developer mode on or off and remember it; refused when it could not be remembered, though it holds until the app quits. */
  async setDeveloperMode(isDeveloperModeOn: boolean): Promise<Result<void, string>> {
    this.isDeveloperModeOn = isDeveloperModeOn;
    const remembered = await this.rememberedSwitch.saveRememberedSwitch(isDeveloperModeOn);
    if (remembered.ok) return succeeded(undefined);
    this.tatolabAppLog.warn("the Developer mode switch could not be remembered", { failure: remembered.failure });
    return failedWith(`Tato Studio couldn't remember this, so it holds only until Tato Studio quits: ${remembered.failure}`);
  }
}
