/**
 * Sprint Guardian — DataSource Manager
 *
 * Factory that returns the correct DataSource based on the
 * current mode (demo vs live). NEVER mixes sources.
 *
 * Safety rules:
 * - Never silently fallback to demo data
 * - Never mix demo + real in same response
 * - Always log data source selection
 */

import type { DataSource } from "./data-source.js";
import { DemoDataSource } from "./demo-data-source.js";
import { RealDataSource } from "./real-data-source.js";

// Singleton instances
const demoSource = new DemoDataSource();
const realSource = new RealDataSource();

// In-memory demo mode state (per org in production, single flag for now)
let globalDemoMode = true;

/**
 * Get the current data source based on demo mode setting.
 */
export function getDataSource(demoMode?: boolean): DataSource {
  const isDemo = demoMode ?? globalDemoMode;

  if (isDemo) {
    console.log("[DataSourceManager] Using DEMO data source");
    return demoSource;
  }

  console.log("[DataSourceManager] Using LIVE data source");
  return realSource;
}

/**
 * Set the global demo mode flag.
 */
export function setDemoMode(enabled: boolean): void {
  console.log(`[DataSourceManager] Demo mode ${enabled ? "ENABLED" : "DISABLED"}`);
  globalDemoMode = enabled;
}

/**
 * Get the current demo mode state.
 */
export function isDemoMode(): boolean {
  return globalDemoMode;
}
