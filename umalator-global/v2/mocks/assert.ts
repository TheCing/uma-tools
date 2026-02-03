/**
 * Browser mock for node:assert
 * In development, uses console.assert for debugging
 * In production, becomes a no-op for performance
 */

// CC_DEBUG is defined by Vite's define config
declare const CC_DEBUG: boolean;

const assertFn = CC_DEBUG
  ? console.assert.bind(console)
  : function() {};

export const strict = assertFn;
export default { strict: assertFn };
