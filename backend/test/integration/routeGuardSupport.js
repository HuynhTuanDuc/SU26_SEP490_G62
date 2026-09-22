const { api, authHeader, seedDriverWorld } = require('./support');

/**
 * Mã ca chặn quyền mang hậu tố G (guard) — vd TC-INT-TripController-G001.
 *
 * Từ khi bộ ca gom theo CONTROLLER thay vì theo file route, ca chặn quyền và ca nghiệp vụ
 * của cùng một controller nằm chung một dải mã. Đánh số trơn sẽ đụng nhau
 * (TC-INT-TripController-001 vừa là "claim chuyến" vừa là "chặn coordinator"), nên tách
 * hẳn dải bằng chữ G thay vì cộng offset — offset sẽ trôi mỗi lần thêm ca nghiệp vụ.
 */
const withIds = (moduleName, rawCases) =>
    rawCases.map((item, index) => ({
        tcId: `TC-INT-${moduleName}-G${String(index + 1).padStart(3, '0')}`,
        ...item,
    }));

const forbid = (role, audience, routes) => routes.map(([method, path]) => ({
    method,
    path,
    role,
    expected: 403,
    scenario: `${role} token is rejected from ${audience} ${method} ${path} route before controller logic runs`,
}));

const unauth = (audience, routes) => routes.map(([method, path]) => ({
    method,
    path,
    expected: 403,
    scenario: `unauthenticated request is rejected from ${audience} ${method} ${path} route before controller logic runs`,
}));

const runRouteGuardSuite = (ctx, moduleName, rawCases) => {
    describe(`${moduleName} route guard coverage`, () => {
        let world;

        beforeEach(async () => {
            world = await seedDriverWorld();
        });

        it.each(withIds(moduleName, rawCases))('$tcId — $scenario', async ({ method, path, role, expected, body }) => {
            const req = api(ctx.app)[method.toLowerCase()](path);

            if (role) {
                req.set(authHeader(world.accounts[role].token));
            }

            if (body !== undefined) {
                req.send(body);
            }

            const res = await req;
            expect(res.status).toBe(expected);
        });
    });
};

module.exports = {
    forbid,
    runRouteGuardSuite,
    unauth,
};
