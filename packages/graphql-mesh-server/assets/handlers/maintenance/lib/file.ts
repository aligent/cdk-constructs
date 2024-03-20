import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const MAINTENANCE_FILE_PATH = process.env.MAINTENANCE_FILE_PATH!;
const FILE_NAME = "maintenance";
const PATHS = [
  `${MAINTENANCE_FILE_PATH}/${FILE_NAME}.disabled`,
  `${MAINTENANCE_FILE_PATH}/${FILE_NAME}.enabled`,
];

export const getFilePath = (): string => {
  for (const path of PATHS) {
    if (existsSync(path)) {
      return path;
    }
  }

  // If the maintenance file wasn't found, create one
  writeFileSync(PATHS[0], "");
  return PATHS[0];
};

export const getFile = (): string => {
  return readFileSync(getFilePath(), "utf-8");
};

export const getCurrentStatus = (): "disabled" | "enabled" => {
  return inMaintenanceMode() ? "enabled" : "disabled";
};

export const inMaintenanceMode = (): boolean => {
  return getFilePath().includes("enabled");
};

export const toggleMaintenanceStatus = () => {
  const desiredStatus = inMaintenanceMode() ? "disabled" : "enabled";

  renameSync(
    getFilePath(),
    `${MAINTENANCE_FILE_PATH}/${FILE_NAME}.${desiredStatus}`
  );
};
