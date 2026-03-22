/**
 * Sprint Guardian — Data Module Barrel Export
 */

export type {
  DataSource,
  DataResponse,
  SprintIssue,
  PRItem,
  DashboardApproval,
  DashboardAuditEntry,
  IntegrationStatus,
} from "./data-source.js";
export { wrapResponse } from "./data-source.js";
export { DemoDataSource } from "./demo-data-source.js";
export { RealDataSource } from "./real-data-source.js";
export {
  getDataSource,
  setDemoMode,
  isDemoMode,
} from "./data-source-manager.js";
