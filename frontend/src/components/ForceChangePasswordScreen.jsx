import { useState } from "react";
import { apiRequest } from "../services/apiClient";

export default function ForceChangePasswordScreen({ user, onChanged, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!currentPassword) return setError("Vui lòng nhập mật khẩu tạm thời.");
    if (newPassword.length < 6) return setError("Mật khẩu mới phải có ít nhất 6 ký tự.");
    if (newPassword !== confirmPassword) return setError("Mật khẩu xác nhận không khớp.");
    if (newPassword === currentPassword) return setError("Mật khẩu mới phải khác mật khẩu tạm thời.");

    setSubmitting(true);
    try {
      await apiRequest("/api/profile/me/password", {
        method: "PATCH",
        body: { currentPassword, newPassword },
      });
      onChanged?.();
    } catch (err) {
      setError(err.message || "Không thể đổi mật khẩu.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <h2 className="text-lg font-bold text-gray-800 mb-1">Đổi mật khẩu bắt buộc</h2>
        <p className="text-xs text-gray-500 mb-6">
          Tài khoản {user?.email} vừa được đặt lại mật khẩu. Vui lòng đổi sang mật khẩu mới trước khi tiếp tục sử dụng hệ thống.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Mật khẩu tạm thời (đã nhận qua email)</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Mật khẩu mới</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Xác nhận mật khẩu mới</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </label>

          {error && <p className="text-xs text-rose-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg py-2.5 transition-colors"
          >
            {submitting ? "Đang lưu..." : "Đổi mật khẩu"}
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Đăng xuất
          </button>
        </form>
      </div>
    </main>
  );
}
