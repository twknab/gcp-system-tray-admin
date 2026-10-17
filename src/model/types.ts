// Shared types. See specs/001-cloudbar-mvp/data-model.md.

export type StatusLevel = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface Status {
  level: StatusLevel;
  reason?: string;
}

export type FailureKind = 'disabled' | 'denied' | 'timeout' | 'network' | 'auth' | 'quota' | 'other';

export interface Failure {
  kind: FailureKind;
  reason: string;
}

export type SourceResult<T> =
  | { ok: true; data: T; fetchedAt: string }
  | { ok: false; kind: FailureKind; reason: string; fetchedAt: string; lastGood?: { data: T; fetchedAt: string } };

export type ResourceType = 'run' | 'sql' | 'vertex' | 'storage';

/** Provider state mapped to CloudBar's vocabulary, before monitoring is considered. */
export type MappedState =
  | { kind: 'ready' }
  | { kind: 'degraded'; reason: string }
  | { kind: 'down'; reason: string }
  | { kind: 'unknown'; reason: string };

export interface Project {
  projectId: string;
  displayName: string;
  projectNumber: string;
}

export interface ProjectBilling {
  billingEnabled: boolean;
  billingAccountId?: string;
}

export interface EnabledServices {
  count: number;
  names: string[];
}

export interface Resource {
  type: ResourceType;
  id: string;
  name: string;
  projectId: string;
  location: string;
  reportedState: string;
  mapped: MappedState;
  consoleUrl: string;
  /** storage only */
  createdAt?: string;
  sizeBytes?: number | 'pending' | 'unavailable';
  sizeAsOf?: string;
}

export interface ResourceList {
  resources: Resource[];
  /** e.g. Cloud Run regions the global list could not reach */
  unreachable?: string[];
}

export type AlertSeverity = 'critical' | 'error' | 'warning' | 'unspecified';

export interface Alert {
  id: string;
  policyName: string;
  projectId: string;
  severity: AlertSeverity;
  openedAt: string;
  resourceType?: ResourceType;
  resourceName?: string;
  consoleUrl: string;
}

export interface MonitoringPolicies {
  policyCount: number;
  /** resource types covered by at least one enabled policy */
  coveredTypes: ResourceType[];
}

export interface BillingAccountInfo {
  id: string;
  displayName: string;
  open: boolean;
  currencyCode?: string;
}

export interface CostRow {
  month: string; // YYYYMM
  currency: string;
  netMinor: number;
}

export interface Costs {
  rows: CostRow[];
  exportTime: string | null;
  dryRunBytes?: number;
}

export interface Budget {
  name: string;
  scope: 'account' | 'filtered';
  amount: { kind: 'specified'; minor: number; currency: string } | { kind: 'lastPeriod' };
  period: 'month' | 'other';
}

export interface BucketSizes {
  /** bucket name → bytes */
  sizes: Record<string, number>;
  asOf: string | null;
}

export type MoneyByCurrency = Record<string, number>;

export interface BudgetLine {
  name: string;
  currency: string | null;
  amountMinor: number | null;
  remainingMinor: number | null;
  note?: string;
}

export interface AccountSummary {
  id: string;
  displayName: string;
  ok: boolean;
  reason?: string;
  mtd: MoneyByCurrency;
  lastMonth: MoneyByCurrency | null;
  budgetLines: BudgetLine[];
  budgetsUnavailable?: string;
}

export interface BillingSummary {
  available: boolean;
  mtd: MoneyByCurrency;
  lastMonth: MoneyByCurrency | null;
  coveredAccounts: number;
  visibleAccounts: number;
  oldestExportTime: string | null;
  stale: boolean;
  budgetLines: BudgetLine[];
  overBudget: boolean;
  accounts: AccountSummary[];
  unavailableReason?: string;
  monthLabel: string;
  lastMonthLabel: string;
}

export interface Snapshot {
  schemaVersion: 1;
  updatedAt: string;
  sources: Record<string, SourceResult<unknown>>;
}

export interface TtlConfig {
  alerts: number;
  resources: number;
  projects: number;
  services: number;
  costs: number;
  budgets: number;
  storageSize: number;
}

export interface Config {
  billingExports: Record<string, string>;
  vertexRegions: string[];
  runRegions: string[];
  excludeProjects: string[];
  quotaProject?: string;
  maxBytesBilled: number;
  ttl: TtlConfig;
  nodePath?: string;
  /** where the config was loaded from (for the Settings shortcut) */
  path: string;
}

export interface SetupFinding {
  area: 'credentials' | 'quotaProject' | 'permissions' | 'api' | 'billingExport' | 'budgets';
  level: 'pass' | 'warn' | 'fail';
  message: string;
  nextStep?: string;
  link?: string;
  projectId?: string;
}

// ---------- View model (pure output of model/view.ts, input of render/swiftbar.ts) ----------

export interface ViewItem {
  title: string;
  status: Status;
  tooltip?: string;
  details: string[];
  consoleUrl: string;
}

export interface ViewGroup {
  type: ResourceType;
  label: string;
  count: number;
  status: Status;
  items: ViewItem[];
  overflow?: { count: number; url: string };
  unavailable: { projectLabel: string; reason: string }[];
}

export interface ViewProject {
  label: string;
  apiCount: number | null;
  consoleUrl: string;
  note?: string;
}

export interface ViewAlerts {
  available: boolean;
  reason?: string;
  policyCount: number | null;
  alerts: { title: string; status: Status; url: string }[];
}

export interface ViewModel {
  overall: Status;
  titleAmount: string | null;
  billing: BillingSummary;
  groups: ViewGroup[];
  alerts: ViewAlerts | null;
  projects: ViewProject[] | null;
  projectsUnavailable?: string;
  setupIssues: { message: string; nextStep?: string }[];
  updatedAt: string | null;
  now: string;
  offline: boolean;
  paths: { node: string; cli: string; config: string; docs: string };
}
