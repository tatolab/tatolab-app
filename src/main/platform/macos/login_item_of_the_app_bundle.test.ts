import { expect, test } from "vitest";
import { failedWith, succeeded, type Result } from "../../result.js";
import { LoginItemOfTheAppBundle, tatolabAppOpenAtLoginFrom, type AppLoginItemReading, type AppLoginItemSettings } from "./login_item_of_the_app_bundle.js";

/** Login-item settings whose status after each set the test decides, recording each set. */
function fakeAppLoginItemSettings(statusAfterSet: (openAtLogin: boolean) => string, refusal: string | null = null) {
  const setsAsked: boolean[] = [];
  let appLoginItem: AppLoginItemReading = { openAtLogin: false, status: "not-registered" };
  const appLoginItemSettings: AppLoginItemSettings = {
    readAppLoginItem: () => appLoginItem,
    setAppOpensAtLogin: (openAtLogin): Result<void, string> => {
      setsAsked.push(openAtLogin);
      if (refusal !== null) return failedWith(refusal);
      appLoginItem = { openAtLogin, status: statusAfterSet(openAtLogin) };
      return succeeded(undefined);
    },
  };
  return { appLoginItemSettings, setsAsked };
}

test("service_managements_status_reads_as_on_off_or_waiting_for_approval_and_openatlogin_stands_in_where_there_is_none", () => {
  expect(tatolabAppOpenAtLoginFrom({ openAtLogin: true, status: "enabled" })).toEqual({ kind: "on" });
  expect(tatolabAppOpenAtLoginFrom({ openAtLogin: false, status: "requires-approval" })).toEqual({ kind: "needs_approval_in_login_items" });
  expect(tatolabAppOpenAtLoginFrom({ openAtLogin: false, status: "not-registered" })).toEqual({ kind: "off" });
  expect(tatolabAppOpenAtLoginFrom({ openAtLogin: false, status: "not-found" })).toEqual({ kind: "off" });
  expect(tatolabAppOpenAtLoginFrom({ openAtLogin: true })).toEqual({ kind: "on" });
});

test("turning_it_on_registers_the_bundles_login_item_and_a_status_awaiting_approval_is_not_a_refusal", async () => {
  const enabling = fakeAppLoginItemSettings((openAtLogin) => (openAtLogin ? "enabled" : "not-registered"));
  const loginItem = new LoginItemOfTheAppBundle(enabling.appLoginItemSettings);

  expect(await loginItem.setOpenAtLogin(true)).toEqual(succeeded(undefined));
  expect(await loginItem.readOpenAtLogin()).toEqual({ kind: "on" });
  expect(await loginItem.setOpenAtLogin(false)).toEqual(succeeded(undefined));
  expect(enabling.setsAsked).toEqual([true, false]);

  const awaitingApproval = new LoginItemOfTheAppBundle(fakeAppLoginItemSettings(() => "requires-approval").appLoginItemSettings);
  expect(await awaitingApproval.setOpenAtLogin(true)).toEqual(succeeded(undefined));
  expect(await awaitingApproval.readOpenAtLogin()).toEqual({ kind: "needs_approval_in_login_items" });
});

test("a_registration_macos_did_not_carry_out_or_electron_refused_is_refused", async () => {
  const notCarriedOut = new LoginItemOfTheAppBundle(fakeAppLoginItemSettings(() => "not-registered").appLoginItemSettings);
  expect(await notCarriedOut.setOpenAtLogin(true)).toEqual(
    failedWith("macOS did not add Tatolab to your login items. Add it in System Settings › General › Login Items."),
  );

  const stillAwaitingApproval = new LoginItemOfTheAppBundle(fakeAppLoginItemSettings(() => "requires-approval").appLoginItemSettings);
  expect(await stillAwaitingApproval.setOpenAtLogin(false)).toEqual(
    failedWith("macOS did not remove Tatolab from your login items. Remove it in System Settings › General › Login Items."),
  );

  const refused = new LoginItemOfTheAppBundle(fakeAppLoginItemSettings(() => "enabled", "Operation not permitted").appLoginItemSettings);
  expect(await refused.setOpenAtLogin(true)).toEqual(failedWith("Operation not permitted"));
});
