import test from 'node:test';
import assert from 'node:assert/strict';
import {compactHoldingNumber} from '../../src/modules/portfolio/ui/holding-table-columns';
test('large holding numbers are compact without changing the numeric inputs',()=>{
 assert.equal(compactHoldingNumber(40385),'40.39K');
 assert.equal(compactHoldingNumber(23462975488),'23.46B');
 assert.equal(compactHoldingNumber(1542568153692),'1.54T');
});
