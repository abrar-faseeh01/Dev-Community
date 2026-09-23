import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Loads next.config.js and .env files into the test environment.
  dir: "./",
});

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // next/jest doesn't read tsconfig.json's path aliases on its own.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

// Exported this way so next/jest can load the (async) Next.js config first.
export default createJestConfig(config);
