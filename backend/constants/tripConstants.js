const SHIPMENT_STATUS = Object.freeze({
    AVAILABLE: 'available',
    CLAIMED: 'claimed',
    PICKING: 'picking',
    TRANSIT: 'transit',
    ARRIVED: 'arrived',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    FAILED: 'failed',
    RETURNING: 'returning',
});

const ASSIGNMENT_TYPE = Object.freeze({
    SELF_CLAIM: 'self_claim',
    COORDINATOR_ASSIGN: 'coordinator_assign',
});

// CANCELLED is terminal — driver is freed after cancellation (not active)
// RETURNING is active — driver is returning cargo to pickup point
const ACTIVE_STATUSES = Object.freeze([
    SHIPMENT_STATUS.CLAIMED,
    SHIPMENT_STATUS.PICKING,
    SHIPMENT_STATUS.TRANSIT,
    SHIPMENT_STATUS.ARRIVED,
    SHIPMENT_STATUS.RETURNING,
]);

const CANCELLABLE_STATUSES = Object.freeze([
    SHIPMENT_STATUS.CLAIMED,
    SHIPMENT_STATUS.PICKING,
    SHIPMENT_STATUS.TRANSIT,
]);

// Strict forward-only transitions via PATCH /status endpoint
// PICKING → TRANSIT goes through POST /start-transit (with mandatory loading proof, BR-013/014)
// ARRIVED → COMPLETED goes through POST /complete (with 2 mandatory photos)
const ALLOWED_TRANSITIONS = Object.freeze({
    [SHIPMENT_STATUS.CLAIMED]:   [SHIPMENT_STATUS.PICKING],
    [SHIPMENT_STATUS.TRANSIT]:   [SHIPMENT_STATUS.ARRIVED],
    [SHIPMENT_STATUS.ARRIVED]:   [SHIPMENT_STATUS.FAILED],
    [SHIPMENT_STATUS.FAILED]:    [SHIPMENT_STATUS.RETURNING],
    [SHIPMENT_STATUS.RETURNING]: [SHIPMENT_STATUS.COMPLETED],
});

const RELEASABLE_STATUSES = Object.freeze([
    SHIPMENT_STATUS.CLAIMED,
    SHIPMENT_STATUS.PICKING,
]);

// Status → lifecycle timestamp column (must cover every writable status)
const STATUS_TIMESTAMP_COL = Object.freeze({
    [SHIPMENT_STATUS.PICKING]:   'picking_at',
    [SHIPMENT_STATUS.TRANSIT]:   'transit_at',
    [SHIPMENT_STATUS.ARRIVED]:   'arrived_at',
    [SHIPMENT_STATUS.COMPLETED]: 'completed_at',
    [SHIPMENT_STATUS.FAILED]:    'failed_at',
    [SHIPMENT_STATUS.RETURNING]: 'returning_at',
    [SHIPMENT_STATUS.CANCELLED]: 'cancelled_at',
});

module.exports = {
    SHIPMENT_STATUS,
    ASSIGNMENT_TYPE,
    ACTIVE_STATUSES,
    CANCELLABLE_STATUSES,
    RELEASABLE_STATUSES,
    ALLOWED_TRANSITIONS,
    STATUS_TIMESTAMP_COL,
};
