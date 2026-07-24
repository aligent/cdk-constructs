import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const IP_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([1-9]|[1-2][0-9]|3[1-2]))?$/;
const IP_V6_REGEX =
  /(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))/;

const FILE_NAME = "maintenance";

// Resolved lazily so each caller honours the current MAINTENANCE_FILE_PATH
// rather than a value captured at module load.
const getPaths = (): [string, string] => {
  const basePath = process.env.MAINTENANCE_FILE_PATH;
  if (!basePath) throw new Error("Maintenance File path is missing.");

  return [
    `${basePath}/${FILE_NAME}.disabled`,
    `${basePath}/${FILE_NAME}.enabled`,
  ];
};

export interface MaintenanceFile {
  whitelist: Array<string>;
  sites: Record<string, boolean>;
}

export const getFilePath = (): string => {
  const paths = getPaths();
  for (const path of paths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // If the maintenance file wasn't found, create one
  writeFileSync(paths[0], JSON.stringify({ whitelist: [], sites: {} }));
  return paths[0];
};

export const getMaintenanceFile = (): MaintenanceFile => {
  const fileContents = readFileSync(getFilePath(), "utf-8");
  return JSON.parse(fileContents) as MaintenanceFile;
};

export const setWhitelist = (whitelist: Array<string>): void => {
  if (!validateIps(whitelist))
    throw new Error("List of IP addresses is not valid");
  const maintFile = getMaintenanceFile();
  maintFile.whitelist = [...new Set(whitelist)];

  writeFileSync(getFilePath(), JSON.stringify(maintFile), {
    encoding: "utf-8",
  });
};

export const updateWhitelist = (whitelist: Array<string>): void => {
  if (!validateIps(whitelist))
    throw new Error("List of IP addresses is not valid");
  const maintFile = getMaintenanceFile();

  setWhitelist(maintFile.whitelist.concat(whitelist));
};

export const updateMaintenanceStatus = (sites: Record<string, boolean>) => {
  const maintFile = getMaintenanceFile();
  maintFile.sites = sites;
  writeFileSync(getFilePath(), JSON.stringify(maintFile), {
    encoding: "utf-8",
  });
};

export const toggleMaintenanceStatus = (status: boolean) => {
  const [disabledPath, enabledPath] = getPaths();
  const target = status ? enabledPath : disabledPath;

  renameSync(getFilePath(), target);
};

const validateIps = (ipList: Array<string>) => {
  return (
    ipList.find(ip => !IP_REGEX.test(ip) && !IP_V6_REGEX.test(ip)) === undefined
  );
};
