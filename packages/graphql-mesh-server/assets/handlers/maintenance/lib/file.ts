import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const IP_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([1-9]|[1-2][0-9]|3[1-2]))?$/;

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

export const getFileContents = (): string => {
  return readFileSync(getFilePath(), "utf-8");
};

export const setFileContents = (input: string): void => {
  if (!validateIps(input)) throw new Error("List of IP addresses not valid");
  writeFileSync(getFilePath(), input);
};

export const updateFileContents = (input: string): void => {
  if (!input) throw new Error("Nothing to update.");
  if (!validateIps(input)) throw new Error("List of IP addresses not valid");

  setFileContents(`${getFileContents()},${input}`);
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

const validateIps = (ipList: string) => {
  const ips = ipList.split(",");
  return Boolean(ips.find(ip => !IP_REGEX.test(ip)));
};
