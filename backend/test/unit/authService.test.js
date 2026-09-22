/**
 * L1 Unit Test — authService
 *
 * Mock: repository + emailService + google-auth-library (mạng ngoài).
 * GIỮ THẬT: jsonwebtoken, bcryptjs, crypto — đây chính là phần cần được kiểm chứng
 * (token ký ra có đúng loại không, hash có so khớp không). Mock chúng thì test chỉ
 * còn kiểm tra chính cái mock.
 */
process.env.JWT_SECRET = 'test-secret-cho-unit-test';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

jest.mock('../../repositories/profileRepository');
jest.mock('../../repositories/authRepository', () => ({
    ensureRefreshTokenTable: jest.fn().mockResolvedValue(undefined),
    insertRefreshToken: jest.fn().mockResolvedValue(undefined),
    revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
    getRefreshTokenById: jest.fn(),
}));
jest.mock('../../services/emailService', () => ({
    sendPasswordResetCodeEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('google-auth-library', () => {
    const verifyIdToken = jest.fn();
    return { OAuth2Client: jest.fn(() => ({ verifyIdToken })), __verifyIdToken: verifyIdToken };
});

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const profileRepository = require('../../repositories/profileRepository');
const authRepository = require('../../repositories/authRepository');
const emailService = require('../../services/emailService');
const { __verifyIdToken } = require('google-auth-library');
const authService = require('../../services/authService');

const MAT_KHAU = 'MatKhau@123';
let HASH_DUNG;

const TAI_KHOAN = () => ({
    id: 5, email: 'taixe01@logiscount.vn', role: 'driver', is_active: true,
    password_hash: HASH_DUNG, must_change_password: false, role_id: 4,
});

beforeAll(() => { HASH_DUNG = bcrypt.hashSync(MAT_KHAU, 4); });

beforeEach(() => {
    jest.clearAllMocks();
    authRepository.ensureRefreshTokenTable.mockResolvedValue(undefined);
    authRepository.insertRefreshToken.mockResolvedValue(undefined);
    authRepository.revokeRefreshToken.mockResolvedValue(undefined);
    profileRepository.getAccountByEmail.mockResolvedValue(TAI_KHOAN());
    profileRepository.getProfileByAccountId.mockResolvedValue({
        full_name: 'Lê Văn Tài', phone: '0901000001', avatar_url: null, role_id: 4,
    });
    profileRepository.updateLastLogin.mockResolvedValue(undefined);
});

describe('authService.login', () => {
    it('TC-UNIT-AuthService-001 — issues a token and returns the profile on a correct email and password', async () => {
        const result = await authService.login('taixe01@logiscount.vn', MAT_KHAU);

        const decoded = authService.verifyToken(result.token);
        expect(decoded).toMatchObject({ userId: 5, role: 'driver', tokenType: 'access' });
        expect(result.user).toMatchObject({ id: 5, full_name: 'Lê Văn Tài', role: 'driver' });
        expect(profileRepository.updateLastLogin).toHaveBeenCalledWith(5);
    });

    it('TC-UNIT-AuthService-002 — a phone login is looked up in both local and international form', async () => {
        profileRepository.getAccountByPhone.mockResolvedValue(TAI_KHOAN());

        await authService.login('0901000001', MAT_KHAU);

        expect(profileRepository.getAccountByPhone).toHaveBeenCalledWith('0901000001', '84901000001');
        expect(profileRepository.getAccountByEmail).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AuthService-003 — rejects a missing password without looking the account up', async () => {
        await expect(authService.login('taixe01@logiscount.vn', ''))
            .rejects.toMatchObject({ message: 'Email hoặc số điện thoại và mật khẩu là bắt buộc.', status: 400 });

        expect(profileRepository.getAccountByEmail).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AuthService-004 — returns 404 when the account does not exist', async () => {
        profileRepository.getAccountByEmail.mockResolvedValue(null);

        await expect(authService.login('khongco@logiscount.vn', MAT_KHAU))
            .rejects.toMatchObject({ message: 'Tài khoản không tồn tại.', status: 404 });
    });

    it('TC-UNIT-AuthService-005 — blocks login for a locked account (BR-DRV-001)', async () => {
        profileRepository.getAccountByEmail.mockResolvedValue({ ...TAI_KHOAN(), is_active: false });

        await expect(authService.login('taixe01@logiscount.vn', MAT_KHAU))
            .rejects.toMatchObject({ message: 'Tài khoản của bạn đã bị khóa.', status: 403 });

        expect(profileRepository.updateLastLogin).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AuthService-006 — blocks login for an account with no role assigned', async () => {
        profileRepository.getAccountByEmail.mockResolvedValue({ ...TAI_KHOAN(), role: null });

        await expect(authService.login('taixe01@logiscount.vn', MAT_KHAU))
            .rejects.toMatchObject({ message: 'Tài khoản chưa được gán vai trò.', status: 403 });
    });

    it('TC-UNIT-AuthService-007 — returns 401 on a wrong password and issues no session', async () => {
        await expect(authService.login('taixe01@logiscount.vn', 'SaiMatKhau'))
            .rejects.toMatchObject({ message: 'Mật khẩu không đúng.', status: 401 });

        expect(authRepository.insertRefreshToken).not.toHaveBeenCalled();
        expect(profileRepository.updateLastLogin).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AuthService-008 — stores the refresh token as a hash, never in plain text', async () => {
        const result = await authService.login('taixe01@logiscount.vn', MAT_KHAU);

        const [luu] = authRepository.insertRefreshToken.mock.calls[0];
        const bamMongDoi = crypto.createHash('sha256').update(result.refreshToken).digest('hex');
        expect(luu.tokenHash).toBe(bamMongDoi);
        expect(luu.tokenHash).not.toBe(result.refreshToken);
        expect(luu.userId).toBe(5);
    });
});

describe('authService.verifyToken', () => {
    it('TC-UNIT-AuthService-009 — decodes a valid access token', async () => {
        const { token } = await authService.login('taixe01@logiscount.vn', MAT_KHAU);

        expect(authService.verifyToken(token)).toMatchObject({ userId: 5, tokenType: 'access' });
    });

    it('TC-UNIT-AuthService-010 — a real refresh token cannot be used as an access token, the signing secret differs', async () => {
        const { refreshToken } = await authService.login('taixe01@logiscount.vn', MAT_KHAU);

        expect(() => authService.verifyToken(refreshToken)).toThrow('Invalid token');
    });

    it('TC-UNIT-AuthService-040 — a token signed with the right secret but declaring tokenType=refresh is still rejected', () => {
        // Chốt chặn thứ hai, độc lập với chữ ký: nếu access secret và refresh secret có
        // lúc nào đó trùng nhau (cấu hình sai), chỉ còn guard tokenType đứng giữa.
        const gia = jwt.sign({ userId: 5, role: 'driver', tokenType: 'refresh' }, process.env.JWT_SECRET);

        expect(() => authService.verifyToken(gia)).toThrow('Invalid token');
    });

    it('TC-UNIT-AuthService-041 — a legacy token without a tokenType field is still accepted, backward compatible', () => {
        const cu = jwt.sign({ userId: 5, role: 'driver' }, process.env.JWT_SECRET);

        expect(authService.verifyToken(cu)).toMatchObject({ userId: 5 });
    });

    it('TC-UNIT-AuthService-011 — rejects a token signed with a different secret', () => {
        const gia = jwt.sign({ userId: 5, tokenType: 'access' }, 'secret-gia-mao');

        expect(() => authService.verifyToken(gia)).toThrow('Invalid token');
    });

    it('TC-UNIT-AuthService-012 — rejects a garbage string', () => {
        expect(() => authService.verifyToken('khong-phai-jwt')).toThrow('Invalid token');
    });
});

describe('authService.refreshSession', () => {
    const dungRefreshToken = async () => {
        const { refreshToken } = await authService.login('taixe01@logiscount.vn', MAT_KHAU);
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        return { refreshToken, decoded };
    };

    beforeEach(() => {
        profileRepository.getAccountById.mockResolvedValue(TAI_KHOAN());
    });

    it('TC-UNIT-AuthService-013 — a valid refresh issues a new session and revokes the old token', async () => {
        const { refreshToken, decoded } = await dungRefreshToken();
        authRepository.getRefreshTokenById.mockResolvedValue({
            user_id: 5,
            revoked_at: null,
            expires_at: new Date(Date.now() + 86_400_000),
            token_hash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        });

        const result = await authService.refreshSession(refreshToken);

        expect(authService.verifyToken(result.token)).toMatchObject({ userId: 5 });
        const [tokenCu, thayTheBoi] = authRepository.revokeRefreshToken.mock.calls.at(-1);
        expect(tokenCu).toBe(decoded.tokenId);
        expect(thayTheBoi).toEqual(expect.any(String));
        expect(thayTheBoi).not.toBe(decoded.tokenId);
    });

    it('TC-UNIT-AuthService-014 — returns 401 when the refresh token is missing', async () => {
        await expect(authService.refreshSession(null))
            .rejects.toMatchObject({ message: 'Refresh token is required', status: 401 });
    });

    it('TC-UNIT-AuthService-015 — returns 401 when the token is absent from the database', async () => {
        const { refreshToken } = await dungRefreshToken();
        authRepository.getRefreshTokenById.mockResolvedValue(null);

        await expect(authService.refreshSession(refreshToken))
            .rejects.toMatchObject({ message: 'Refresh token is invalid', status: 401 });
    });

    it('TC-UNIT-AuthService-016 — returns 401 when the token belongs to another user', async () => {
        const { refreshToken } = await dungRefreshToken();
        authRepository.getRefreshTokenById.mockResolvedValue({
            user_id: 99, revoked_at: null,
            expires_at: new Date(Date.now() + 86_400_000),
            token_hash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        });

        await expect(authService.refreshSession(refreshToken))
            .rejects.toMatchObject({ message: 'Refresh token is invalid', status: 401 });
    });

    it('TC-UNIT-AuthService-017 — returns 401 when the token has already been revoked', async () => {
        const { refreshToken } = await dungRefreshToken();
        authRepository.getRefreshTokenById.mockResolvedValue({
            user_id: 5, revoked_at: new Date(),
            expires_at: new Date(Date.now() + 86_400_000),
            token_hash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        });

        await expect(authService.refreshSession(refreshToken))
            .rejects.toMatchObject({ message: 'Refresh token has been revoked', status: 401 });
    });

    it('TC-UNIT-AuthService-018 — revokes and returns 401 when the token has expired', async () => {
        const { refreshToken, decoded } = await dungRefreshToken();
        authRepository.getRefreshTokenById.mockResolvedValue({
            user_id: 5, revoked_at: null,
            expires_at: new Date(Date.now() - 1000),
            token_hash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        });

        await expect(authService.refreshSession(refreshToken))
            .rejects.toMatchObject({ message: 'Refresh token has expired', status: 401 });

        expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith(decoded.tokenId, null);
    });

    it('TC-UNIT-AuthService-019 — revokes and returns 401 when the token hash does not match the stored one', async () => {
        const { refreshToken, decoded } = await dungRefreshToken();
        authRepository.getRefreshTokenById.mockResolvedValue({
            user_id: 5, revoked_at: null,
            expires_at: new Date(Date.now() + 86_400_000),
            token_hash: 'bam-cua-token-khac',
        });

        await expect(authService.refreshSession(refreshToken))
            .rejects.toMatchObject({ message: 'Refresh token mismatch', status: 401 });

        expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith(decoded.tokenId, null);
    });

    it('TC-UNIT-AuthService-020 — returns 403 when the account is locked after the token was issued', async () => {
        const { refreshToken } = await dungRefreshToken();
        authRepository.getRefreshTokenById.mockResolvedValue({
            user_id: 5, revoked_at: null,
            expires_at: new Date(Date.now() + 86_400_000),
            token_hash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        });
        profileRepository.getAccountById.mockResolvedValue({ ...TAI_KHOAN(), is_active: false });

        await expect(authService.refreshSession(refreshToken))
            .rejects.toMatchObject({ message: 'Tài khoản của bạn đã bị khóa.', status: 403 });
    });
});

describe('authService.revokeRefreshToken', () => {
    it('TC-UNIT-AuthService-021 — logout with a valid token revokes the stored record', async () => {
        const { refreshToken } = await authService.login('taixe01@logiscount.vn', MAT_KHAU);
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        authRepository.revokeRefreshToken.mockClear();

        await authService.revokeRefreshToken(refreshToken);

        expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith(decoded.tokenId, null);
    });

    it('TC-UNIT-AuthService-022 — logout with a broken token is ignored silently and throws nothing', async () => {
        await expect(authService.revokeRefreshToken('token-rac')).resolves.toBeUndefined();

        expect(authRepository.revokeRefreshToken).not.toHaveBeenCalled();
    });
});

describe('authService — luồng quên mật khẩu', () => {
    const layMaVuaGui = () => emailService.sendPasswordResetCodeEmail.mock.calls.at(-1)[2];

    it('TC-UNIT-AuthService-023 — returns 404 for an unregistered email and sends no code', async () => {
        profileRepository.getAccountByEmail.mockResolvedValue(null);

        await expect(authService.requestPasswordReset('la@logiscount.vn'))
            .rejects.toMatchObject({ message: 'Email không tồn tại.', status: 404 });

        expect(emailService.sendPasswordResetCodeEmail).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AuthService-024 — rejects a malformed email before any lookup', async () => {
        await expect(authService.requestPasswordReset('khong-phai-email'))
            .rejects.toMatchObject({ message: 'Email không hợp lệ.', status: 400 });

        expect(profileRepository.getAccountByEmail).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AuthService-025 — sends a 6-character code to the right mailbox on a valid request', async () => {
        const email = 'reset025@logiscount.vn';
        profileRepository.getAccountByEmail.mockResolvedValue({ ...TAI_KHOAN(), email });

        const result = await authService.requestPasswordReset(email);

        expect(emailService.sendPasswordResetCodeEmail).toHaveBeenCalledWith(email, 'Lê Văn Tài', expect.any(String));
        expect(layMaVuaGui()).toHaveLength(6);
        expect(result.expires_in_seconds).toBe(600);
    });

    it('TC-UNIT-AuthService-026 — blocks an immediate resend under the cooldown window', async () => {
        const email = 'reset026@logiscount.vn';
        profileRepository.getAccountByEmail.mockResolvedValue({ ...TAI_KHOAN(), email });
        await authService.requestPasswordReset(email);

        await expect(authService.requestPasswordReset(email))
            .rejects.toMatchObject({ status: 429 });
    });

    it('TC-UNIT-AuthService-027 — rejects a wrong confirmation code', async () => {
        const email = 'reset027@logiscount.vn';
        profileRepository.getAccountByEmail.mockResolvedValue({ ...TAI_KHOAN(), email });
        await authService.requestPasswordReset(email);

        await expect(authService.verifyPasswordResetCode(email, 'ZZZZZZ'))
            .rejects.toMatchObject({ message: 'Mã xác nhận không đúng.' });
    });

    it('TC-UNIT-AuthService-028 — rejects a code that is not 6 characters long', async () => {
        await expect(authService.verifyPasswordResetCode('reset028@logiscount.vn', 'ABC'))
            .rejects.toMatchObject({ message: 'Mã xác nhận không hợp lệ.' });
    });

    it('TC-UNIT-AuthService-029 — reports an error when confirming without ever requesting a code', async () => {
        await expect(authService.verifyPasswordResetCode('chuayeucau@logiscount.vn', 'ABC123'))
            .rejects.toThrow('Không tìm thấy yêu cầu đặt lại mật khẩu');
    });

    it('TC-UNIT-AuthService-030 — a successful reset stores a hash matching the new password', async () => {
        const email = 'reset030@logiscount.vn';
        profileRepository.getAccountByEmail.mockResolvedValue({ ...TAI_KHOAN(), email });
        await authService.requestPasswordReset(email);
        const ma = layMaVuaGui();
        await authService.verifyPasswordResetCode(email, ma);

        await authService.resetPassword(email, ma, 'MatKhauMoi@1', 'MatKhauMoi@1');

        const [userId, hashMoi] = profileRepository.updatePasswordHash.mock.calls[0];
        expect(userId).toBe(5);
        expect(bcrypt.compareSync('MatKhauMoi@1', hashMoi)).toBe(true);
    });

    it('TC-UNIT-AuthService-031 — blocks resetting the password before the code has been confirmed', async () => {
        const email = 'reset031@logiscount.vn';
        profileRepository.getAccountByEmail.mockResolvedValue({ ...TAI_KHOAN(), email });
        await authService.requestPasswordReset(email);
        const ma = layMaVuaGui();

        await expect(authService.resetPassword(email, ma, 'MatKhauMoi@1', 'MatKhauMoi@1'))
            .rejects.toThrow('Vui lòng xác nhận mã trước khi đặt lại mật khẩu.');

        expect(profileRepository.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AuthService-032 — rejects a password confirmation that does not match', async () => {
        await expect(authService.resetPassword('reset032@logiscount.vn', 'ABC123', 'MatKhau@1', 'KhacHan@1'))
            .rejects.toThrow('Xác nhận mật khẩu không khớp.');

        expect(profileRepository.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AuthService-033 — rejects a 5-character new password, below the minimum of 6', async () => {
        await expect(authService.resetPassword('reset033@logiscount.vn', 'ABC123', '12345', '12345'))
            .rejects.toThrow('Mật khẩu mới phải có ít nhất 6 ký tự.');
    });

    it('TC-UNIT-AuthService-034 — accepts a new password of exactly 6 characters (lower boundary)', async () => {
        const email = 'reset034@logiscount.vn';
        profileRepository.getAccountByEmail.mockResolvedValue({ ...TAI_KHOAN(), email });
        await authService.requestPasswordReset(email);
        const ma = layMaVuaGui();
        await authService.verifyPasswordResetCode(email, ma);

        await expect(authService.resetPassword(email, ma, '123456', '123456')).resolves.toMatchObject({
            message: 'Đặt lại mật khẩu thành công.',
        });
    });
});

describe('authService.loginWithGoogle', () => {
    const veGoogle = (payload) => __verifyIdToken.mockResolvedValue({ getPayload: () => payload });

    it('TC-UNIT-AuthService-035 — rejects an unverified Google email', async () => {
        veGoogle({ email: 'taixe01@logiscount.vn', email_verified: 'false' });

        await expect(authService.loginWithGoogle('id-token'))
            .rejects.toMatchObject({ message: 'Google email is not verified.', status: 403 });
    });

    it('TC-UNIT-AuthService-036 — rejects a Google account not provisioned for internal access', async () => {
        veGoogle({ email: 'nguoila@gmail.com', email_verified: 'true' });
        profileRepository.getAccountByEmail.mockResolvedValue(null);

        await expect(authService.loginWithGoogle('id-token'))
            .rejects.toMatchObject({ status: 403 });
    });

    it('TC-UNIT-AuthService-037 — rejects a locked Google account', async () => {
        veGoogle({ email: 'taixe01@logiscount.vn', email_verified: 'true' });
        profileRepository.getAccountByEmail.mockResolvedValue({ ...TAI_KHOAN(), is_active: false });

        await expect(authService.loginWithGoogle('id-token'))
            .rejects.toMatchObject({ message: 'Your account has been deactivated.', status: 403 });
    });

    it('TC-UNIT-AuthService-038 — a valid Google credential issues a session like a normal login', async () => {
        veGoogle({ email: 'TaiXe01@LogisCount.vn ', email_verified: 'true' });

        const result = await authService.loginWithGoogle('id-token');

        expect(profileRepository.getAccountByEmail).toHaveBeenCalledWith('taixe01@logiscount.vn');
        expect(authService.verifyToken(result.token)).toMatchObject({ userId: 5 });
    });

    it('TC-UNIT-AuthService-039 — rejects a missing credential before calling Google', async () => {
        await expect(authService.loginWithGoogle(null))
            .rejects.toMatchObject({ message: 'Google credential is required.', status: 400 });

        expect(__verifyIdToken).not.toHaveBeenCalled();
    });
});
