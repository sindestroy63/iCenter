"use strict";

if (process.env.ICENTER_USE_ISOLATED_PRISMA_CLIENT === "1") {
  const fs = require("node:fs");
  const path = require("node:path");
  const Module = require("node:module");
  const clientPath = path.resolve(__dirname, "..", "node_modules", ".prisma", "client-lowerqa");
  const entryPath = path.join(clientPath, "index.js");

  if (!fs.existsSync(entryPath)) {
    throw new Error("Isolated Prisma Client for lowerqa has not been generated");
  }

  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === "@prisma/client") {
      return resolveFilename.call(this, entryPath, parent, isMain, options);
    }

    return resolveFilename.call(this, request, parent, isMain, options);
  };
}
