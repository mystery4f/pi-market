import { cpus } from "node:os";
import { defineConfig } from "vitest/config";

const workers = Math.min(8, Math.max(1, cpus().length));

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
          environment: "node",
          maxWorkers: workers,
        },
      },
      {
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          environment: "node",
          // Suites that touch the real filesystem get slower, not faster, with more workers.
          maxWorkers: 2,
        },
      },
    ],
  },
});
