module.exports = {
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.json",
    },
  },
  moduleDirectories: ["node_modules"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  preset: "ts-jest",
  testMatch: ["**/test/**/*.test.ts"],
  // *.live.test.ts hits real YouTube. Excluded from the default run; see `npm run test:live`.
  testPathIgnorePatterns: ["/node_modules/", "\\.live\\.test\\.ts$"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
}
