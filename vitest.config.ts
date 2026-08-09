import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The full-snapshot suite compares 27 deep object trees; give it room.
    testTimeout: 60_000
  }
});
