const DEFAULT_MAX_LIMIT = 100;

const toPositiveInteger = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.floor(parsed);
};

const parsePaginationQuery = (query = {}, { defaultLimit = 10, maxLimit = DEFAULT_MAX_LIMIT } = {}) => {
    const page = toPositiveInteger(query.page, 1);
    const requestedLimit = toPositiveInteger(query.limit, defaultLimit);
    const limit = Math.min(maxLimit, requestedLimit);

    return {
        page,
        limit,
        offset: (page - 1) * limit,
    };
};

const buildPaginationMeta = ({ total = 0, page = 1, limit = 10 } = {}) => {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safePage = toPositiveInteger(page, 1);
    const safeLimit = toPositiveInteger(limit, 10);
    const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));

    return {
        total: safeTotal,
        page: safePage,
        limit: safeLimit,
        totalPages,
        hasPreviousPage: safePage > 1,
        hasNextPage: safePage < totalPages,
    };
};

module.exports = {
    parsePaginationQuery,
    buildPaginationMeta,
};
