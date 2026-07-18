process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
process.env.GG_CLIENT_ID = process.env.GG_CLIENT_ID || 'TEST_GOOGLE_CLIENT_ID';

const assert = require('node:assert/strict');

// Dưới node:test cũ file này patch Module._load để tráo dependency trước khi require
// authService. Jest có module registry riêng nên chuyển sang jest.mock — các stub đặt
// tên tiền tố `mock` để babel-jest cho phép tham chiếu từ factory (hoisting rule).
const mockJwt = {
    sign: () => {
        throw new Error('jwt.sign was not configured for this test');
    },
    verify: () => {
        throw new Error('jwt.verify was not configured for this test');
    },
};

const mockBcrypt = {
    compare: async () => {
        throw new Error('bcrypt.compare was not configured for this test');
    },
};

const mockProfileRepository = {
    getAccountByEmail: async () => {
        throw new Error('getAccountByEmail was not configured for this test');
    },
    getProfileByAccountId: async () => {
        throw new Error('getProfileByAccountId was not configured for this test');
    },
    updateLastLogin: async () => {
        throw new Error('updateLastLogin was not configured for this test');
    },
    getProfileWithRole: async () => {
        throw new Error('getProfileWithRole was not configured for this test');
    },
};

// authService.js verifies Google credentials via `new OAuth2Client(...).verifyIdToken(...)`
// (google-auth-library SDK), not via raw fetch — stub the SDK instead of global.fetch.
const mockGoogleClient = {
    verifyIdToken: async () => {
        throw new Error('verifyIdToken was not configured for this test');
    },
};

// issueSession() persists a refresh token row via the real pool on success — stub it out
// so successful-login tests don't need a live Postgres connection.
const mockPool = {
    query: async () => ({ rows: [] }),
};

jest.mock('jsonwebtoken', () => mockJwt);
jest.mock('bcryptjs', () => mockBcrypt);
jest.mock('google-auth-library', () => ({
    OAuth2Client: class OAuth2ClientStub {
        verifyIdToken(...args) {
            return mockGoogleClient.verifyIdToken(...args);
        }
    },
}));
jest.mock('../../repositories/profileRepository', () => mockProfileRepository);
jest.mock('../../config/database', () => mockPool);

const authService = require('../../services/authService');

const originalFetch = global.fetch;

const original = {
    getAccountByEmail: mockProfileRepository.getAccountByEmail,
    getProfileByAccountId: mockProfileRepository.getProfileByAccountId,
    updateLastLogin: mockProfileRepository.updateLastLogin,
    compare: mockBcrypt.compare,
    sign: mockJwt.sign,
    verifyIdToken: mockGoogleClient.verifyIdToken,
};

const restoreMocks = () => {
    mockProfileRepository.getAccountByEmail = original.getAccountByEmail;
    mockProfileRepository.getProfileByAccountId = original.getProfileByAccountId;
    mockProfileRepository.updateLastLogin = original.updateLastLogin;
    mockBcrypt.compare = original.compare;
    mockJwt.sign = original.sign;
    mockGoogleClient.verifyIdToken = original.verifyIdToken;
    global.fetch = originalFetch;
};

const baseAccount = (overrides = {}) => ({
    id: 42,
    email: 'User@Example.com',
    password_hash: 'hashed-password',
    role_id: 3,
    role: 'Admin',
    is_active: true,
    ...overrides,
});

const baseProfile = (overrides = {}) => ({
    id: 42,
    full_name: 'Jane Doe',
    phone: '0123456789',
    role_id: 7,
    role: 'Manager',
    ...overrides,
});

afterEach(() => {
    restoreMocks();
});

test('throws 400 when email is missing', async () => {
    await assert.rejects(
        () => authService.login('', 'secret'),
        (err) => err instanceof authService.AuthError && err.status === 400,
    );
});

test('throws 400 when password is missing', async () => {
    await assert.rejects(
        () => authService.login('user@example.com', ''),
        (err) => err instanceof authService.AuthError && err.status === 400,
    );
});

test('throws 400 when both inputs are missing', async () => {
    await assert.rejects(
        () => authService.login('', ''),
        (err) => err instanceof authService.AuthError && err.status === 400,
    );
});

test('normalizes email before account lookup', async () => {
    const calls = [];
    mockProfileRepository.getAccountByEmail = async (email) => {
        calls.push(email);
        return null;
    };

    await assert.rejects(() => authService.login('  USER@Example.com  ', 'secret'));
    assert.deepEqual(calls, ['user@example.com']);
});

test('throws 404 when account does not exist', async () => {
    let compareCalled = false;
    mockProfileRepository.getAccountByEmail = async () => null;
    mockBcrypt.compare = async () => {
        compareCalled = true;
        return false;
    };

    await assert.rejects(
        () => authService.login('user@example.com', 'secret'),
        (err) => err instanceof authService.AuthError && err.status === 404,
    );
    assert.equal(compareCalled, false);
});

test('throws 401 when password is invalid', async () => {
    let updateCalled = false;
    mockProfileRepository.getAccountByEmail = async () => baseAccount();
    mockProfileRepository.getProfileByAccountId = async () => baseProfile();
    mockProfileRepository.updateLastLogin = async () => {
        updateCalled = true;
        return { id: 42 };
    };
    mockBcrypt.compare = async () => false;

    await assert.rejects(
        () => authService.login('user@example.com', 'wrong-password'),
        (err) => err instanceof authService.AuthError && err.status === 401,
    );
    assert.equal(updateCalled, false);
});

test('throws 403 when account is inactive', async () => {
    let updateCalled = false;
    mockProfileRepository.getAccountByEmail = async () => baseAccount({ is_active: false });
    mockProfileRepository.getProfileByAccountId = async () => baseProfile();
    mockProfileRepository.updateLastLogin = async () => {
        updateCalled = true;
        return { id: 42 };
    };
    mockBcrypt.compare = async () => true;

    await assert.rejects(
        () => authService.login('user@example.com', 'secret'),
        (err) => err instanceof authService.AuthError && err.status === 403,
    );
    assert.equal(updateCalled, false);
});

test('rejects email input with invalid symbols as not found', async () => {
    const calls = [];
    mockProfileRepository.getAccountByEmail = async (email) => {
        calls.push(email);
        return null;
    };

    await assert.rejects(
        () => authService.login('user!name@example.com', 'secret'),
        (err) => err instanceof authService.AuthError && err.status === 404,
    );
    assert.deepEqual(calls, ['user!name@example.com']);
});

test('rejects email input containing SQL injection text as plain text', async () => {
    const calls = [];
    mockProfileRepository.getAccountByEmail = async (email) => {
        calls.push(email);
        return null;
    };

    await assert.rejects(
        () => authService.login("admin@example.com' OR '1'='1", 'secret'),
        (err) => err instanceof authService.AuthError && err.status === 404,
    );
    assert.deepEqual(calls, ["admin@example.com' or '1'='1"]);
});

test('rejects password input containing SQL injection text', async () => {
    let updateCalled = false;
    mockProfileRepository.getAccountByEmail = async () => baseAccount();
    mockProfileRepository.getProfileByAccountId = async () => baseProfile();
    mockProfileRepository.updateLastLogin = async () => {
        updateCalled = true;
        return { id: 42 };
    };
    mockBcrypt.compare = async () => false;

    await assert.rejects(
        () => authService.login('user@example.com', "' OR '1'='1"),
        (err) => err instanceof authService.AuthError && err.status === 401,
    );
    assert.equal(updateCalled, false);
});

test('rejects malformed credentials with unicode and symbols', async () => {
    let updateCalled = false;
    mockProfileRepository.getAccountByEmail = async () => null;
    mockProfileRepository.updateLastLogin = async () => {
        updateCalled = true;
        return { id: 42 };
    };

    await assert.rejects(
        () => authService.login('usér+test@example.com', 'pa$$w0rd<script>'),
        (err) => err instanceof authService.AuthError && err.status === 404,
    );
    assert.equal(updateCalled, false);
});

test('loginWithGoogle rejects missing credential', async () => {
    await assert.rejects(
        () => authService.loginWithGoogle(''),
        (err) => err instanceof authService.AuthError && err.status === 400,
    );
});

test('loginWithGoogle rejects non-matching Google audience', async () => {
    mockGoogleClient.verifyIdToken = async () => ({
        getPayload: () => ({
            aud: 'unexpected-client-id',
            email: 'user@example.com',
            email_verified: 'true',
        }),
    });

    await assert.rejects(
        () => authService.loginWithGoogle('credential'),
        (err) => err instanceof authService.AuthError && err.status === 403,
    );
});

test('loginWithGoogle rejects unverified Google email', async () => {
    mockGoogleClient.verifyIdToken = async () => ({
        getPayload: () => ({
            aud: process.env.GG_CLIENT_ID,
            email: 'user@example.com',
            email_verified: 'false',
        }),
    });

    await assert.rejects(
        () => authService.loginWithGoogle('credential'),
        (err) => err instanceof authService.AuthError && err.status === 403,
    );
});

test('loginWithGoogle rejects Google accounts that are not provisioned internally', async () => {
    mockGoogleClient.verifyIdToken = async () => ({
        getPayload: () => ({
            aud: process.env.GG_CLIENT_ID,
            email: 'new-user@example.com',
            email_verified: 'true',
        }),
    });
    mockProfileRepository.getAccountByEmail = async () => null;

    await assert.rejects(
        () => authService.loginWithGoogle('credential'),
        (err) => err instanceof authService.AuthError && err.status === 403,
    );
});

test('loginWithGoogle signs in an existing internal user', async () => {
    const calls = [];
    mockGoogleClient.verifyIdToken = async () => ({
        getPayload: () => ({
            aud: process.env.GG_CLIENT_ID,
            email: 'User@Example.com',
            email_verified: 'true',
        }),
    });
    mockProfileRepository.getAccountByEmail = async (email) => {
        calls.push(email);
        return baseAccount();
    };
    mockProfileRepository.getProfileByAccountId = async () => baseProfile();
    mockProfileRepository.updateLastLogin = async () => ({ id: 42 });
    mockJwt.sign = () => 'jwt-token';

    const result = await authService.loginWithGoogle('credential');

    assert.deepEqual(calls, ['user@example.com']);
    assert.equal(result.token, 'jwt-token');
    assert.equal(result.user.email, 'User@Example.com');
});
