import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getFilePath, getMaintenanceFile, setWhitelist } from "./file";

describe("maintenance file storage", () => {
  it("resolves the file path under the current MAINTENANCE_FILE_PATH", () => {
    const dir = mkdtempSync(join(tmpdir(), "maint-"));
    process.env.MAINTENANCE_FILE_PATH = dir;

    expect(getFilePath().startsWith(dir)).toBe(true);
  });

  it("keeps state in separate directories isolated from each other", () => {
    const dirA = mkdtempSync(join(tmpdir(), "maint-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "maint-b-"));

    process.env.MAINTENANCE_FILE_PATH = dirA;
    setWhitelist(["10.0.0.1"]);

    process.env.MAINTENANCE_FILE_PATH = dirB;
    expect(getMaintenanceFile().whitelist).toEqual([]);

    process.env.MAINTENANCE_FILE_PATH = dirA;
    expect(getMaintenanceFile().whitelist).toEqual(["10.0.0.1"]);
  });
});
