import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get the current directory using `import.meta.url`
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function invariant(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const [, , packageName] = process.argv;
invariant(packageName, `No package name provided.`);

const rootGitIgnorePath = path.resolve(__dirname, "../../.gitignore");
const packageDirectory = path.resolve(
  __dirname,
  `../../packages/${packageName}`
);
const rootNpmIgnorePath = path.resolve(__dirname, "../../.npmignore");

// Read and process the root .gitignore
const rootGitIgnore = fs.existsSync(rootGitIgnorePath)
  ? fs.readFileSync(rootGitIgnorePath, "utf-8")
  : "";

// Read and process the package's ignore files
function readIgnoreFile(fileName) {
  const filePath = `${packageDirectory}/${fileName}`;

  if (fs.existsSync(filePath)) {
    // Get the relative path to the root
    const fileRelativeDirectory = path.relative(
      path.resolve(__dirname, "../.."),
      packageDirectory
    );

    return fs
      .readFileSync(filePath, "utf-8")
      .split("\n")
      .map(line => {
        // Adjust relative paths, skip comments and empty lines
        if (!line.trim() || line.startsWith("#")) return line;
        if (line.startsWith("!")) {
          return `!${path.join(fileRelativeDirectory, line.slice(1))}`;
        }
        return path.join(fileRelativeDirectory, line);
      })
      .join("\n");
  } else {
    return "";
  }
}

// Combine and de-duplicate lines
const combinedGitIgnore = Array.from(
  new Set([
    ...rootGitIgnore.split("\n"),
    "# Ignores added from .gitignore at the package level",
    ...readIgnoreFile(".gitignore").split("\n"),
    "# Ignores added from .npmignore at the package level",
    ...readIgnoreFile(".npmignore").split("\n"),
  ])
)
  .filter(Boolean)
  .join("\n");

// Write the merged .npmignore
fs.writeFileSync(rootNpmIgnorePath, combinedGitIgnore);
console.log(`Merged .gitignore written to ${rootGitIgnorePath}`);
