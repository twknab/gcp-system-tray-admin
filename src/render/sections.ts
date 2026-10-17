// Registers menu sections in contract order.
import { renderBilling } from './billing.js';
import { renderProjects, renderServices } from './services.js';
import { SECTIONS } from './swiftbar.js';

if (SECTIONS.length === 0) SECTIONS.push(renderBilling, renderServices, renderProjects);

export { renderMenu } from './swiftbar.js';
