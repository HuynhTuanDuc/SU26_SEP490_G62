type SignOutFn = () => Promise<void>;

let _handler: SignOutFn | null = null;

export const authEvents = {
  register: (fn: SignOutFn) => {
    _handler = fn;
  },
  emitUnauthorized: async () => {
    if (_handler) await _handler();
  },
};
