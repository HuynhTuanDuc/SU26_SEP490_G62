const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePaginationQuery, buildPaginationMeta } = require('../utils/pagination');

test('parsePaginationQuery normalizes invalid values and computes offset', () => {
    assert.deepEqual(parsePaginationQuery({ page: '-2', limit: 'abc' }, { defaultLimit: 15 }), {
        page: 1,
        limit: 15,
        offset: 0,
    });

    assert.deepEqual(parsePaginationQuery({ page: '3', limit: '500' }, { defaultLimit: 10, maxLimit: 100 }), {
        page: 3,
        limit: 100,
        offset: 200,
    });
});

test('buildPaginationMeta returns stable metadata for paginated APIs', () => {
    assert.deepEqual(buildPaginationMeta({ total: 42, page: 2, limit: 10 }), {
        total: 42,
        page: 2,
        limit: 10,
        totalPages: 5,
        hasPreviousPage: true,
        hasNextPage: true,
    });

    assert.deepEqual(buildPaginationMeta({ total: 0, page: 1, limit: 10 }), {
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
    });
});
