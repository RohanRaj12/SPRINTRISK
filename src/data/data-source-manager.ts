/**
 * Sprint Guardian — DataSource Manager
 *
 * Always returns the live data source backed by real API calls
 * through Auth0 Token Vault.
 */

import type { DataSource } from "./data-source.js";
import { RealDataSource } from "./real-data-source.js";

const realSource = new RealDataSource();

/**
 * Get the live data source.
 */
export function getDataSource(): DataSource {
  return realSource;
}
