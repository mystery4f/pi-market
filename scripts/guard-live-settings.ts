// Guard: run the real SettingsStore against a COPY of the live settings.json and prove the
// file survives an add + remove cycle without losing entries or keys.
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsStore } from "../src/market/registry/settings.ts";

const live =
  process.argv[2] ?? join(process.env.USERPROFILE ?? "", ".pi", "agent", "settings.json");
const dir = mkdtempSync(join(tmpdir(), "pi-market-live-"));
const copy = join(dir, "settings.json");
copyFileSync(live, copy);

const before = JSON.parse(readFileSync(copy, "utf8")) as { packages: unknown[] } & Record<
  string,
  unknown
>;
console.log("before:", before.packages.length, "packages,", Object.keys(before).length, "keys");

const store = await SettingsStore.load(copy);
await store.addPack(join(dir, "market", "slug-probe"));
const added = JSON.parse(readFileSync(copy, "utf8")) as typeof before;
console.log("after add:", added.packages.length, "packages");
if (added.packages.length !== before.packages.length + 1) throw new Error("entry not appended");

const keysBefore = Object.keys(before);
const keysAfter = Object.keys(added);
const lostKeys = keysBefore.filter((key) => key !== "packages" && !keysAfter.includes(key));
if (lostKeys.length > 0) throw new Error(`keys lost: ${lostKeys.join(", ")}`);

const lostEntries = before.packages
  .map((entry) => JSON.stringify(entry))
  .filter((entry) => !added.packages.map((item) => JSON.stringify(item)).includes(entry));
if (lostEntries.length > 0) throw new Error(`packages lost: ${lostEntries.join(", ")}`);

const after2 = await SettingsStore.load(copy);
await after2.removePack(join(dir, "market", "slug-probe"));
const removed = JSON.parse(readFileSync(copy, "utf8")) as typeof before;
if (JSON.stringify(removed.packages) !== JSON.stringify(before.packages)) {
  throw new Error("remove did not restore the original list");
}
console.log("OK: add + remove round-trips the live settings without loss");
