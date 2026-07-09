const ALLOWED_EXPENSE_TYPES = ['fuel', 'toll', 'parking', 'ferry', 'minor_repair', 'other'];

// Customer pays these — added to receipt total, not company expense
const PASS_THROUGH_EXPENSE_TYPES = new Set(['toll', 'parking', 'ferry']);

module.exports = { ALLOWED_EXPENSE_TYPES, PASS_THROUGH_EXPENSE_TYPES };
