import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const libRoot = path.dirname(
  fileURLToPath(import.meta.url)
);

const projectRoot =
  process.env.PROJECT_ROOT ??
  path.join(libRoot, "..", "..");

export async function runDashboardApi<
  T
>(
  command:
    | "signal"
    | "backtest"
    | "journal"
    | "automation-status"
    | "automation-control",
  flags: Record<string, string | number> = {}
): Promise<T> {
  const args = [
    "--import=tsx",
    path.join(
      projectRoot,
      "src/scripts/dashboardApi.ts"
    ),
    command
  ];

  for (const [key, value] of Object.entries(
    flags
  )) {
    args.push(`--${key}`, String(value));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      args,
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          PROJECT_ROOT: projectRoot
        }
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        try {
          const parsed = JSON.parse(
            stderr.trim() ||
              stdout.trim()
          ) as { error?: string };

          reject(
            new Error(
              parsed.error ??
                (stderr ||
                  `Dashboard API exited with code ${code}`)
            )
          );

          return;
        } catch {
          reject(
            new Error(
              stderr ||
                `Dashboard API exited with code ${code}`
            )
          );

          return;
        }
      }

      try {
        resolve(
          JSON.parse(stdout) as T
        );
      } catch {
        reject(
          new Error(
            "Failed to parse dashboard API output"
          )
        );
      }
    });
  });
}
