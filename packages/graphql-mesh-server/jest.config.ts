/* eslint-disable */
export default {
  displayName: "graphql-mesh-server",
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
  moduleFileExtensions: ["ts", "js", "html"],
  coverageDirectory: "../../coverage/packages/graphql-mesh-server",
  setupFiles: ['./jest.mock-env.ts'],
};
