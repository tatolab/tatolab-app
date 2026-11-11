/** A switch on Chromium's command line, set before the app is ready: `--name=value`, or `--name` when `value` is `null`. */
export interface ChromiumCommandLineSwitch {
  name: string;
  value: string | null;
}
