process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
process.env.GG_CLIENT_ID = process.env.GG_CLIENT_ID || 'TEST_GOOGLE_CLIENT_ID';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
const originalFetch = global.fetch;

const jwtStub = {
    sign: () => {
        throw new Error('jwt.sign was not configured for this test');
    },
    verify: () => {
        throw new Error('jwt.verify was not configured for this test');
    },
};

const bcryptStub = {
    compare: async () => {
        throw new Error('bcrypt.compare was not configured for this test');
    },
};

const profileRepositoryStub = {
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

Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'jsonwebtoken') return jwtStub;
    if (request === 'bcryptjs') return bcryptStub;
    if (request === '../repositories/profileRepository') return profileRepositoryStub;
    return originalLoad.call(this, request, parent, isMain);
};

const authService = require('../services/authService');

Module._load = originalLoad;

const original = {
    getAccountByEmail: profileRepositoryStub.getAccountByEmail,
    getProfileByAccountId: profileRepositoryStub.getProfileByAccountId,
    updateLastLogin: profileRepositoryStub.updateLastLogin,
    compare: bcryptStub.compare,
    sign: jwtStub.sign,
};

const restoreMocks = () => {
    profileRepositoryStub.getAccountByEmail = original.getAccountByEmail;
    profileRepositoryStub.getProfileByAccountId = original.getProfileByAccountId;
    profileRepositoryStub.updateLastLogin = original.updateLastLogin;
    bcryptStub.compare = original.compare;
    jwtStub.sign = original.sign;
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

test.afterEach(() => {
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
    profileRepositoryStub.getAccountByEmail = async (email) => {
        calls.push(email);
        return null;
    };

    await assert.rejects(() => authService.login('  USER@Example.com  ', 'secret'));
    assert.deepEqual(calls, ['user@example.com']);
});

test('throws 404 when account does not exist', async () => {
    let compareCalled = false;
    profileRepositoryStub.getAccountByEmail = async () => null;
    bcryptStub.compare = async () => {
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
    profileRepositoryStub.getAccountByEmail = async () => baseAccount();
    profileRepositoryStub.getProfileByAccountId = async () => baseProfile();
    profileRepositoryStub.updateLastLogin = async () => {
        updateCalled = true;
        return { id: 42 };
    };
    bcryptStub.compare = async () => false;

    await assert.rejects(
        () => authService.login('user@example.com', 'wrong-password'),
        (err) => err instanceof authService.AuthError && err.status === 401,
    );
    assert.equal(updateCalled, false);
});

test('throws 403 when account is inactive', async () => {
    let updateCalled = false;
    profileRepositoryStub.getAccountByEmail = async () => baseAccount({ is_active: false });
    profileRepositoryStub.getProfileByAccountId = async () => baseProfile();
    profileRepositoryStub.updateLastLogin = async () => {
        updateCalled = true;
        return { id: 42 };
    };
    bcryptStub.compare = async () => true;

    await assert.rejects(
        () => authService.login('user@example.com', 'secret'),
        (err) => err instanceof authService.AuthError && err.status === 403,
    );
    assert.equal(updateCalled, false);
});

test('rejects email input with invalid symbols as not found', async () => {
    const calls = [];
    profileRepositoryStub.getAccountByEmail = async (email) => {
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
    profileRepositoryStub.getAccountByEmail = async (email) => {
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
    profileRepositoryStub.getAccountByEmail = async () => baseAccount();
    profileRepositoryStub.getProfileByAccountId = async () => baseProfile();
    profileRepositoryStub.updateLastLogin = async () => {
        updateCalled = true;
        return { id: 42 };
    };
    bcryptStub.compare = async () => false;

    await assert.rejects(
        () => authService.login('user@example.com', "' OR '1'='1"),
        (err) => err instanceof authService.AuthError && err.status === 401,
    );
    assert.equal(updateCalled, false);
});

test('rejects malformed credentials with unicode and symbols', async () => {
    let updateCalled = false;
    profileRepositoryStub.getAccountByEmail = async () => null;
    profileRepositoryStub.updateLastLogin = async () => {
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
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
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
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
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
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            aud: process.env.GG_CLIENT_ID,
            email: 'new-user@example.com',
            email_verified: 'true',
        }),
    });
    profileRepositoryStub.getAccountByEmail = async () => null;

    await assert.rejects(
        () => authService.loginWithGoogle('credential'),
        (err) => err instanceof authService.AuthError && err.status === 403,
    );
});

test('loginWithGoogle signs in an existing internal user', async () => {
    const calls = [];
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            aud: process.env.GG_CLIENT_ID,
            email: 'User@Example.com',
            email_verified: 'true',
        }),
    });
    profileRepositoryStub.getAccountByEmail = async (email) => {
        calls.push(email);
        return baseAccount();
    };
    profileRepositoryStub.getProfileByAccountId = async () => baseProfile();
    profileRepositoryStub.updateLastLogin = async () => ({ id: 42 });
    jwtStub.sign = () => 'jwt-token';

    const result = await authService.loginWithGoogle('credential');

    assert.deepEqual(calls, ['user@example.com']);
    assert.equal(result.token, 'jwt-token');
    assert.equal(result.user.email, 'User@Example.com');
});

