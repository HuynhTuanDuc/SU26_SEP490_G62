const kpiService = require('../services/kpiService');

// ─── Driver: GET /api/kpi/me?month=6&year=2026 ────────────────────────────────

const getMyKPI = async (req, res) => {
    try {
        const { month, year } = req.query;
        const data = await kpiService.getMyKPI(req.user.userId, { month, year });
        res.json({ kpi: data });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// ─── Driver: GET /api/kpi/leaderboard?month=6&year=2026 ──────────────────────

const getLeaderboard = async (req, res) => {
    try {
        const { month, year } = req.query;
        const data = await kpiService.getLeaderboard(req.user.userId, { month, year });
        res.json(data);
    } catch (err) {
        const code = err.message.includes('chưa được gán') ? 422 : 400;
        res.status(code).json({ error: err.message });
    }
};

module.exports = { getMyKPI, getLeaderboard };
