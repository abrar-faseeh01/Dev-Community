import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

// Path aliases (e.g. the ones added by `nest g library`) live in tsconfig.json,
// so they are read from there instead of being duplicated here.
const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  // NestJS 12's packages (e.g. @nestjs/testing) ship ESM-only — Jest's
  // default CommonJS runtime can't require() them. Running Jest itself in
  // ESM mode (see the "test" script's --experimental-vm-modules flag) is
  // the documented fix, rather than trying to force the package back to
  // CommonJS, which it no longer ships at all.
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    // Force real ESM output for the test compile — the base tsconfig's
    // "nodenext" module setting emits CommonJS for this CJS package
    // (no "type": "module" in package.json), which useESM's runtime
    // registration can't load ("exports is not defined").
    '^.+\\.(t|j)s$': ['ts-jest', { useESM: true, tsconfig: { module: 'ES2022' } }],
  },
  moduleNameMapper: pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    'libs/**/*.(t|j)s',
    'apps/**/*.(t|j)s',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};

export default config;
