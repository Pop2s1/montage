#!/usr/bin/env node
require("./ensure-db-url.js");
const { execSync } = require("child_process");

execSync("prisma generate && prisma migrate deploy && next build", {
  stdio: "inherit",
  env: process.env,
});
