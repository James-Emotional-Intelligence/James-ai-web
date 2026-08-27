import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/api-client';
import { User } from '../../../shared/types';
import {
  Users,
  Shield,
  ShieldAlert,
  UserCheck,
  UserX,
  Search,
  RefreshCw,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
  Mail,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
} from 'lucide-react';

export const AdminUsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>('all');

  // Stats
  const [stats, setStats] = useState({
    totalCount: 0,
    activeCount: 0,
    bannedCount: 0,
    adminCount: 0,
  });

  // Action Confirmation Modal State
  const [actionModal, setActionModal] = useState<{
    type: 'ban' | 'unban' | 'delete' | 'role';
    targetUser: User;
    newRole?: 'admin' | 'user';
  } | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminUsers({
        q: searchTerm.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setUsers(res.users);
      setStats({
        totalCount: res.totalCount,
        activeCount: res.activeCount,
        bannedCount: res.bannedCount,
        adminCount: res.adminCount,
      });
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách người dùng. Vui lòng kiểm tra quyền quản trị.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter]);

  const handleExecuteAction = async () => {
    if (!actionModal) return;
    setProcessingAction(true);
    setError(null);
    setSuccessMsg(null);

    const { type, targetUser, newRole } = actionModal;

    try {
      if (type === 'ban') {
        const res = await api.banAdminUser(targetUser.id);
        setSuccessMsg(res.message || `Đã khóa tài khoản ${targetUser.email}.`);
      } else if (type === 'unban') {
        const res = await api.unbanAdminUser(targetUser.id);
        setSuccessMsg(res.message || `Đã mở khóa tài khoản ${targetUser.email}.`);
      } else if (type === 'delete') {
        const res = await api.deleteAdminUser(targetUser.id);
        setSuccessMsg(res.message || `Đã xóa tài khoản ${targetUser.email}.`);
      } else if (type === 'role' && newRole) {
        const res = await api.updateAdminUserRole(targetUser.id, newRole);
        setSuccessMsg(res.message || `Đã đổi quyền người dùng thành công.`);
      }

      setActionModal(null);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Thao tác không thành công.');
    } finally {
      setProcessingAction(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050806] text-[#F3FAF5] p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#16A34A] selection:text-[#050806]">
      <div className="max-w-[1750px] mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
                <Shield className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-200 via-white to-purple-200 bg-clip-text text-transparent">
                  Quản lý Người Dùng & Phân Quyền
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  Bảng điều khiển Quản trị viên (Admin) – Kiểm soát tài khoản, ban khóa và phân quyền hệ thống JAMI AI
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 rounded-xl text-sm font-medium text-slate-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
              Làm mới dữ liệu
            </button>
          </div>
        </div>

        {/* Notifications & Alerts */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-500/30 rounded-2xl text-red-200">
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm font-medium">{error}</div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-xs font-semibold">
              Đóng
            </button>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-3 p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl text-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm font-medium">{successMsg}</div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200 text-xs font-semibold">
              Đóng
            </button>
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Tổng tài khoản</span>
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white mt-2">{stats.totalCount}</div>
            <div className="text-xs text-slate-400 mt-1">Toàn bộ tài khoản trên hệ thống</div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Đang hoạt động</span>
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <UserCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-emerald-400 mt-2">{stats.activeCount}</div>
            <div className="text-xs text-slate-400 mt-1">Tài khoản hợp lệ có thể đăng nhập</div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Đã bị khóa (Ban)</span>
              <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl">
                <UserX className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-rose-400 mt-2">{stats.bannedCount}</div>
            <div className="text-xs text-slate-400 mt-1">Bị chặn đăng nhập và sử dụng</div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Quản trị viên (Admin)</span>
              <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
                <Shield className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-purple-400 mt-2">{stats.adminCount}</div>
            <div className="text-xs text-slate-400 mt-1">Tài khoản có quyền admin cao nhất</div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo email, họ tên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none transition"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-medium text-slate-400 mr-1 flex-shrink-0">Bộ lọc:</span>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Tất cả ({stats.totalCount})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                statusFilter === 'active'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              🟢 Hoạt động ({stats.activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('banned')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                statusFilter === 'banned'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              🔴 Đã khóa ({stats.bannedCount})
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-200">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-4">
                    Người dùng
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Vai trò
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Trạng thái
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Ngày đăng ký
                  </th>
                  <th scope="col" className="px-6 py-4 text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
                      Đang tải danh sách người dùng...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      <UserX className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                      Không tìm thấy tài khoản người dùng nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isSelf = currentUser?.id === u.id || currentUser?.email === u.email;
                    const isBanned = u.status === 'banned';
                    const isAdmin = u.role === 'admin';

                    return (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-md ${
                                isAdmin
                                  ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white ring-2 ring-purple-400/30'
                                  : isBanned
                                  ? 'bg-rose-950 border border-rose-700/50 text-rose-300'
                                  : 'bg-slate-800 border border-slate-700 text-indigo-300'
                              }`}
                            >
                              {isAdmin ? <Shield className="w-5 h-5" /> : (u.preferredName || u.displayName || u.email).slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-100 flex items-center gap-2">
                                {u.displayName || u.preferredName}
                                {isSelf && (
                                  <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-md">
                                    Bạn
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <Mail className="w-3.5 h-3.5 text-slate-500" />
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          {isAdmin ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-950/80 text-purple-300 border border-purple-500/30 shadow-sm">
                              <Shield className="w-3.5 h-3.5 text-purple-400" />
                              Quản trị viên (Admin)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              Học sinh / User
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {isBanned ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-300 border border-rose-500/30 shadow-sm">
                              <Lock className="w-3.5 h-3.5 text-rose-400" />
                              Đã bị khóa (Banned)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 shadow-sm">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              Hoạt động
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '—'}
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {/* Role Toggle Button */}
                            <button
                              onClick={() =>
                                setActionModal({
                                  type: 'role',
                                  targetUser: u,
                                  newRole: isAdmin ? 'user' : 'admin',
                                })
                              }
                              disabled={isSelf}
                              title={isAdmin ? 'Chuyển về quyền Người dùng thông thường' : 'Cấp quyền Quản trị viên (Admin)'}
                              className={`p-2 rounded-xl text-xs font-medium border transition ${
                                isAdmin
                                  ? 'bg-purple-950/40 hover:bg-purple-900/60 border-purple-700/50 text-purple-300'
                                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                              } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                              <Shield className="w-4 h-4" />
                            </button>

                            {/* Ban / Unban Button */}
                            {isBanned ? (
                              <button
                                onClick={() => setActionModal({ type: 'unban', targetUser: u })}
                                title="Mở khóa tài khoản"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-semibold transition"
                              >
                                <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                                Mở khóa
                              </button>
                            ) : (
                              <button
                                onClick={() => setActionModal({ type: 'ban', targetUser: u })}
                                disabled={isSelf}
                                title={isSelf ? 'Không thể tự khóa tài khoản của chính mình' : 'Khóa tài khoản (Ban)'}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Lock className="w-3.5 h-3.5 text-rose-400" />
                                Khóa (Ban)
                              </button>
                            )}

                            {/* Delete User Button */}
                            <button
                              onClick={() => setActionModal({ type: 'delete', targetUser: u })}
                              disabled={isSelf}
                              title={isSelf ? 'Không thể tự xóa tài khoản của chính mình' : 'Xóa vĩnh viễn tài khoản'}
                              className="p-2 bg-slate-800/80 hover:bg-red-950/60 border border-slate-700 hover:border-red-700/50 text-slate-400 hover:text-red-400 rounded-xl text-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Confirmation Modal */}
        {actionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-2xl ${
                    actionModal.type === 'delete'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : actionModal.type === 'ban'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : actionModal.type === 'role'
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {actionModal.type === 'delete' ? (
                    <AlertTriangle className="w-6 h-6" />
                  ) : actionModal.type === 'ban' ? (
                    <Lock className="w-6 h-6" />
                  ) : actionModal.type === 'role' ? (
                    <Shield className="w-6 h-6" />
                  ) : (
                    <Unlock className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {actionModal.type === 'delete' && 'Xác nhận Xóa Tài Khoản'}
                    {actionModal.type === 'ban' && 'Xác nhận Khóa Tài Khoản (Ban)'}
                    {actionModal.type === 'unban' && 'Xác nhận Mở Khóa Tài Khoản'}
                    {actionModal.type === 'role' && 'Xác nhận Thay Đổi Quyền'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Đối tượng: <span className="font-semibold text-slate-200">{actionModal.targetUser.email}</span>
                  </p>
                </div>
              </div>

              <div className="text-sm text-slate-300 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                {actionModal.type === 'delete' && (
                  <p className="text-red-300">
                    ⚠️ Hành động này sẽ <strong>xóa toàn bộ</strong> thông tin người dùng, hồ sơ, thời khóa biểu và bài tập
                    liên quan. Thao tác này <strong>không thể hoàn tác</strong>.
                  </p>
                )}
                {actionModal.type === 'ban' && (
                  <p>
                    Tài khoản này sẽ bị <strong>ngắt phiên đăng nhập ngay lập tức</strong> và bị chặn truy cập vào JAMI AI cho đến khi được Admin mở khóa lại.
                  </p>
                )}
                {actionModal.type === 'unban' && (
                  <p>Tài khoản sẽ được kích hoạt lại và người dùng có thể đăng nhập bình thường.</p>
                )}
                {actionModal.type === 'role' && (
                  <p>
                    Bạn có chắc chắn muốn chuyển vai trò của người dùng này thành{' '}
                    <strong className="text-purple-300 font-bold">
                      {actionModal.newRole === 'admin' ? 'Quản trị viên (Admin)' : 'Học sinh / User'}
                    </strong>
                    ?
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  disabled={processingAction}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition disabled:opacity-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleExecuteAction}
                  disabled={processingAction}
                  className={`px-4 py-2 text-sm font-bold rounded-xl transition flex items-center gap-2 ${
                    actionModal.type === 'delete'
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
                      : actionModal.type === 'ban'
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                      : actionModal.type === 'role'
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                  } disabled:opacity-50`}
                >
                  {processingAction && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {actionModal.type === 'delete' && 'Xóa vĩnh viễn'}
                  {actionModal.type === 'ban' && 'Khóa tài khoản ngay'}
                  {actionModal.type === 'unban' && 'Mở khóa ngay'}
                  {actionModal.type === 'role' && 'Lưu thay đổi'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
