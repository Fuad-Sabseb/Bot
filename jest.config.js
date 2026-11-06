module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/backend/tests"],
  testMatch: ["**/*.test.ts"],
  setupFiles: ["dotenv/config"],
  verbose: true,
  testTimeout: 30000,
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "backend/tsconfig.json",
      },
    ],
  },
};
