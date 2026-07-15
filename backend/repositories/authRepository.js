const pool = require('../config/database');

const ensureRefreshTokenTable = async () => {
    await pool.query(
        `CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
            token_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ NULL,
            replaced_by_token_id TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
    );
};

const insertRefreshToken = async ({ tokenId, userId, tokenHash, expiresAt }) => {
    await pool.query(
        `INSERT INTO auth_refresh_tokens (token_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [tokenId, userId, tokenHash, expiresAt],
    );
};

const revokeRefreshToken = async (tokenId, replacedByTokenId = null) => {
    await pool.query(
        `UPDATE auth_refresh_tokens
         SET revoked_at = COALESCE(revoked_at, NOW()),
             replaced_by_token_id = COALESCE($2, replaced_by_token_id)
         WHERE token_id = $1`,
        [tokenId, replacedByTokenId],
    );
};

const getRefreshTokenById = async (tokenId) => {
    const { rows } = await pool.query(
        `SELECT token_id, user_id, token_hash, expires_at, revoked_at
         FROM auth_refresh_tokens
         WHERE token_id = $1`,
        [tokenId],
    );
    return rows[0] ?? null;
};

module.exports = {
    ensureRefreshTokenTable,
    insertRefreshToken,
    revokeRefreshToken,
    getRefreshTokenById,
};
