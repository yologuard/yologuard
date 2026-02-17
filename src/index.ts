#!/usr/bin/env node

import packageJson from "../package.json" with { type: "json" };

const main = () => {
  console.log(`yologuard v${packageJson.version}`);
  process.exit(0);
};

main();
