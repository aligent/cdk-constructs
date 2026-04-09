#!/usr/bin/env node

/**
 * Resolves which workspace packages are transitively affected by updated dependencies.
 *
 * Parses yarn.lock (Yarn Berry format) to build the dependency graph, then walks
 * upward from the updated deps to find which workspace packages depend on them.
 *
 * Usage: node resolve-affected-packages.js <dep1> <dep2> ...
 * Output: one workspace package name per line
 */

const fs = require("fs");

const updatedDeps = process.argv.slice(2);
if (updatedDeps.length === 0) {
  process.exit(0);
}

const lockfile = fs.readFileSync("yarn.lock", "utf8");

// Parse yarn.lock into entries separated by blank lines
const blocks = lockfile.split(/\n\n+/).filter((b) => b.trim());

// For each entry, extract: package name, whether it's a workspace package, and its dependencies
const entries = [];

for (const block of blocks) {
  const lines = block.split("\n");
  const header = lines[0];

  // Skip metadata lines (comments, __metadata, etc.)
  if (!header.startsWith('"')) continue;

  // Extract package name from header
  // Format: "@scope/name@npm:^1.0.0, @scope/name@npm:^1.1.0":
  // or: "@scope/name@workspace:packages/foo":
  const nameMatch = header.match(/^"(@?[^@]+)@/);
  if (!nameMatch) continue;

  const pkgName = nameMatch[1];

  // Check if workspace package
  const isWorkspace = header.includes("@workspace:");

  // Extract dependencies
  const deps = [];
  let inDeps = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s+dependencies:/.test(line)) {
      inDeps = true;
      continue;
    }
    if (inDeps) {
      const depMatch = line.match(/^\s{4}([^\s:]+):/);
      if (depMatch) {
        deps.push(depMatch[1]);
      } else {
        inDeps = false;
      }
    }
  }

  entries.push({ pkgName, isWorkspace, deps });
}

// Build reverse dependency map: dep name -> set of package names that depend on it
const reverseDeps = new Map();
for (const entry of entries) {
  for (const dep of entry.deps) {
    if (!reverseDeps.has(dep)) reverseDeps.set(dep, new Set());
    reverseDeps.get(dep).add(entry.pkgName);
  }
}

// BFS upward from updated deps to find affected workspace packages
const visited = new Set();
const queue = [...updatedDeps];
const affectedWorkspaces = new Set();

// Index workspace packages by name for quick lookup
const workspaceNames = new Set(
  entries.filter((e) => e.isWorkspace).map((e) => e.pkgName)
);

while (queue.length > 0) {
  const dep = queue.shift();
  if (visited.has(dep)) continue;
  visited.add(dep);

  const dependents = reverseDeps.get(dep);
  if (!dependents) continue;

  for (const dependent of dependents) {
    if (workspaceNames.has(dependent)) {
      affectedWorkspaces.add(dependent);
    } else if (!visited.has(dependent)) {
      queue.push(dependent);
    }
  }
}

// Output sorted workspace package names
for (const pkg of [...affectedWorkspaces].sort()) {
  console.log(pkg);
}
