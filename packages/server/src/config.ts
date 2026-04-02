import "dotenv/config"

export const config = {
  port: parseInt(process.env.PORT || "7281", 10),
  projectDir: process.env.PROJECT_DIR || process.cwd(),
  model: process.env.MODEL || "sonnet",
  maxBudgetUsd: parseFloat(process.env.MAX_BUDGET_USD || "2.0"),
  maxTurns: parseInt(process.env.MAX_TURNS || "15", 10),
} as const
