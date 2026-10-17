// Registers every plan part, in dependency order.
import { billingPlan } from './billingPlan.js';
import { PLAN_PARTS } from './index.js';

if (PLAN_PARTS.length === 0) PLAN_PARTS.push(billingPlan);

export { PLAN_PARTS };
