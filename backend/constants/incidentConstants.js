const ALLOWED_INCIDENT_TYPES    = ['vehicle_breakdown', 'cargo_damage', 'road_incident', 'customer_refusal', 'traffic_jam'];
const ALLOWED_INCIDENT_STATUSES = ['open', 'investigating', 'resolved', 'closed'];
const ALLOWED_SEVERITIES        = ['low', 'medium', 'high', 'critical'];

const INCIDENT_SEVERITY = Object.freeze({
    LOW:      'low',
    MEDIUM:   'medium',
    HIGH:     'high',
    CRITICAL: 'critical',
});

const MAX_IMAGES_PER_INCIDENT = 3;

module.exports = {
    INCIDENT_SEVERITY,
    ALLOWED_INCIDENT_TYPES,
    ALLOWED_INCIDENT_STATUSES,
    ALLOWED_SEVERITIES,
    MAX_IMAGES_PER_INCIDENT,
};
