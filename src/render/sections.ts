// Registers menu sections in contract order.
import { renderBilling } from './billing.js';
import { SECTIONS } from './swiftbar.js';

if (SECTIONS.length === 0) SECTIONS.push(renderBilling);

export { renderMenu } from './swiftbar.js';
