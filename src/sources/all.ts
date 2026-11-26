// Registers every plan part, in dependency order.
import { billingPlan } from './billingPlan.js';
import { PLAN_PARTS } from './index.js';
import { monitoringPlan } from './monitoringPlan.js';
import { servicesPlan } from './servicesPlan.js';

if (PLAN_PARTS.length === 0) PLAN_PARTS.push(billingPlan, servicesPlan, monitoringPlan);

export { PLAN_PARTS };
