// Registers every plan part, in dependency order.
import { billingPlan } from './billingPlan.js';
import { PLAN_PARTS } from './index.js';
import { servicesPlan } from './servicesPlan.js';

if (PLAN_PARTS.length === 0) PLAN_PARTS.push(billingPlan, servicesPlan);

export { PLAN_PARTS };
