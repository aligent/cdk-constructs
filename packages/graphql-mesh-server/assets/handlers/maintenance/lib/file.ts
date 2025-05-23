import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const IP_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([1-9]|[1-2][0-9]|3[1-2]))?$/;
const IP_V6_REGEX =
  /(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))/;

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const MAINTENANCE_FILE_PATH = process.env.MAINTENANCE_FILE_PATH!;
const FILE_NAME = "maintenance";
const PATHS = [
  `${MAINTENANCE_FILE_PATH}/${FILE_NAME}.disabled`,
  `${MAINTENANCE_FILE_PATH}/${FILE_NAME}.enabled`,
];

export interface MaintenanceFile {
  whitelist: Array<string>;
  sites: Record<string, boolean>;
}

export const getFilePath = (): string => {
  for (const path of PATHS) {
    if (existsSync(path)) {
      return path;
    }
  }

  // If the maintenance file wasn't found, create one
  writeFileSync(PATHS[0], JSON.stringify({whitelist: [], sites: {}}));
  return PATHS[0];
};

export const getMaintenanceFile = (): MaintenanceFile => {
  const fileContents = readFileSync(getFilePath(), "utf-8");
  return JSON.parse(fileContents) as MaintenanceFile;
};

export const setWhitelist = (whitelist: Array<string>): void => {
  if (!validateIps(whitelist)) throw new Error("List of IP addresses is not valid");
  let maintFile = getMaintenanceFile();
  maintFile.whitelist = [...new Set(whitelist)]

  writeFileSync(getFilePath(), JSON.stringify(maintFile), { encoding: "utf-8" });
};

export const updateWhitelist = (whitelist: Array<string>): void => {
  if (!validateIps(whitelist)) throw new Error("List of IP addresses is not valid");
  const maintFile = getMaintenanceFile();

  setWhitelist(maintFile.whitelist.concat(whitelist));
};

export const updateMaintenanceStatus = (sites: Record<string, boolean>) => {
  let maintFile = getMaintenanceFile();
  maintFile.sites = sites;
  writeFileSync(getFilePath(), JSON.stringify(maintFile), { encoding: "utf-8" });
}

export const toggleMaintenanceStatus = (status: boolean) => {
  const desiredStatus = status ? "enabled" : "disabled";

  renameSync(
    getFilePath(),
    `${MAINTENANCE_FILE_PATH}/${FILE_NAME}.${desiredStatus}`
  );
};

const validateIps = (ipList: Array<string>) => {
  return (
    ipList.find(ip => !IP_REGEX.test(ip) && !IP_V6_REGEX.test(ip)) === undefined
  );
};
