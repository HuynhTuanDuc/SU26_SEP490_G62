/**
 * Shim API `mock` của node:test chạy trên Jest (hoặc runner bất kỳ).
 *
 * Toàn bộ test cũ viết theo cú pháp node:test:
 *   const spy = mock.method(obj, 'name', impl);
 *   obj.name.mock.calls[0].arguments  → mảng đối số lời gọi đầu tiên
 *   mock.restoreAll()
 *
 * Jest có API khác (jest.spyOn → .mock.calls là mảng-mảng đối số, không có
 * .arguments) nên thay vì sửa ~500 chỗ assert, shim này tái hiện đúng ngữ nghĩa
 * node:test — độc lập với Jest, thuần JS.
 */

const restores = [];

function makeMockFn(implRef) {
    const calls = [];
    const fn = function (...args) {
        const record = { arguments: args, this: this, result: undefined, error: undefined };
        calls.push(record);
        try {
            const result = implRef.current.apply(this, args);
            record.result = result;
            return result;
        } catch (err) {
            record.error = err;
            throw err;
        }
    };
    fn.mock = {
        calls,
        callCount: () => calls.length,
        resetCalls: () => { calls.length = 0; },
        restore: () => {},
    };
    return fn;
}

const mock = {
    /** Thay method trên object bằng impl (mặc định giữ impl gốc), trả về hàm mock. */
    method(obj, name, impl) {
        const original = obj[name];
        const implRef = { current: impl ?? original };
        const fn = makeMockFn(implRef);
        fn.mock.restore = () => { obj[name] = original; };
        obj[name] = fn;
        restores.push(fn.mock.restore);
        return fn;
    },

    /** Hàm mock rời (tương đương mock.fn của node:test). */
    fn(impl = () => {}) {
        return makeMockFn({ current: impl });
    },

    /** Khôi phục mọi method đã mock (tương đương mock.restoreAll của node:test). */
    restoreAll() {
        while (restores.length) restores.pop()();
    },
};

module.exports = { mock };
