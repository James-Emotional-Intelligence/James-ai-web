import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/api-client';
import { User, RegistrationCode, CreatedRegistrationCode, AiWalletTransaction } from '../../../shared/types';
import {
  Users,
  Shield,
  Search,
  RefreshCw,
  Trash2,
  Lock,
  Unlock,
  Mail,
  Calendar,
  CheckCircle2,
  XCircle,
  Wallet,
  PlusCircle,
  MinusCircle,
  Infinity as InfinityIcon,
  Tag,
  Key,
  Copy,
  Check,
  Ban,
  History,
  FileText,
} from 'lucide-react';

export const AdminUsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'users' | 'codes'>('users');

  // Users State
  const [users, setUsers] = useState<User[]>([]);
  const [wallets, setWallets] = useState<Record<string, { balanceVnd: number; balanceFormatted: string; isUnlimited: boolean; aiEnabled: boolean }>>({});
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>('all');

  // Stats
  const [userStats, setUserStats] = useState({
    totalCount: 0,
    activeCount: 0,
    bannedCount: 0,
    adminCount: 0,
  });

  // Codes State
  const [codes, setCodes] = useState<RegistrationCode[]>([]);
  const [codeStats, setCodeStats] = useState({
    totalCount: 0,
    activeCount: 0,
    exhaustedCount: 0,
    revokedCount: 0,
  });
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [codeTypeFilter, setCodeTypeFilter] = useState<string>('all');
  const [codeStatusFilter, setCodeStatusFilter] = useState<string>('all');

  // Notifications
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // User Actions Modal
  const [actionModal, setActionModal] = useState<{
    type: 'ban' | 'unban' | 'delete' | 'role';
    targetUser: User;
    newRole?: 'admin' | 'user';
  } | null>(null);

  // Wallet Top-up / Deduct / Unlimited Modal
  const [walletModal, setWalletModal] = useState<{
    type: 'top_up' | 'deduct' | 'unlimited' | 'status';
    targetUser: User;
  } | null>(null);
  const [walletAmountVnd, setWalletAmountVnd] = useState<number>(25000);
  const [walletReason, setWalletReason] = useState<string>('');
  const [isUnlimitedTarget, setIsUnlimitedTarget] = useState<boolean>(true);
  const [unlimitedDays, setUnlimitedDays] = useState<number>(30);
  const [aiEnabledTarget, setAiEnabledTarget] = useState<boolean>(true);

  // Transaction History Modal
  const [historyModalUser, setHistoryModalUser] = useState<User | null>(null);
  const [historyTransactions, setHistoryTransactions] = useState<AiWalletTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Create Registration Code Modal
  const [showCreateCodeModal, setShowCreateCodeModal] = useState(false);
  const [newCodeType, setNewCodeType] = useState<'credit' | 'unlimited'>('credit');
  const [newCodeGrantVnd, setNewCodeGrantVnd] = useState<number>(50000);
  const [newCodeMaxUses, setNewCodeMaxUses] = useState<number>(1);
  const [newCodeExpiresDays, setNewCodeExpiresDays] = useState<number>(30);
  const [newCodeNote, setNewCodeNote] = useState<string>('');
  const [newCodePrefix, setNewCodePrefix] = useState<string>('JAMI');

  // Just Created Code Banner (Shown ONCE)
  const [justCreatedCode, setJustCreatedCode] = useState<CreatedRegistrationCode | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Processing state
  const [processing, setProcessing] = useState(false);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const res = await api.getAdminUsers({
        q: userSearchTerm.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setUsers(res.users);
      setUserStats({
        totalCount: res.totalCount,
        activeCount: res.activeCount,
        bannedCount: res.bannedCount,
        adminCount: res.adminCount,
      });

      // Load wallet info for users
      const walletMap: Record<string, any> = {};
      await Promise.all(
        res.users.slice(0, 50).map(async (u) => {
          try {
            const w = await api.adminGetAiWallet(u.id);
            walletMap[u.id] = {
              balanceVnd: w.view.balanceVnd,
              balanceFormatted: w.view.balanceFormatted,
              isUnlimited: w.view.isUnlimited,
              aiEnabled: w.view.aiEnabled,
            };
          } catch {
            walletMap[u.id] = { balanceVnd: 25000, balanceFormatted: '25.000đ', isUnlimited: false, aiEnabled: true };
          }
        })
      );
      setWallets(walletMap);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách người dùng.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchCodes = async () => {
    setLoadingCodes(true);
    setError(null);
    try {
      const res = await api.adminListRegistrationCodes();
      setCodes(res.codes);
      setCodeStats({
        totalCount: res.codes.length,
        activeCount: res.codes.filter((c) => c.status === 'active').length,
        exhaustedCount: res.codes.filter((c) => c.status === 'exhausted').length,
        revokedCount: res.codes.filter((c) => c.status === 'revoked').length,
      });
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách mã đăng ký.');
    } finally {
      setLoadingCodes(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      const timer = setTimeout(() => {
        fetchUsers();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      fetchCodes();
    }
  }, [activeTab, userSearchTerm, statusFilter, codeTypeFilter, codeStatusFilter]);

  const handleExecuteUserAction = async () => {
    if (!actionModal) return;
    setProcessing(true);
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
      setProcessing(false);
    }
  };

  const handleWalletSubmit = async () => {
    if (!walletModal) return;
    setProcessing(true);
    setError(null);
    setSuccessMsg(null);

    const { type, targetUser } = walletModal;
    const idempotencyKey = `adm_w_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    try {
      if (type === 'top_up') {
        const res = await api.adminTopUpAiWallet(targetUser.id, {
          amountVnd: Number(walletAmountVnd) || 25000,
          reason: walletReason.trim() || 'Admin nạp ngân sách thủ công',
          idempotencyKey,
        });
        setSuccessMsg(res.message || `Đã nạp ${walletAmountVnd.toLocaleString('vi-VN')}đ vào ví học sinh.`);
      } else if (type === 'deduct') {
        const res = await api.adminDeductAiWallet(targetUser.id, {
          amountVnd: Number(walletAmountVnd) || 10000,
          reason: walletReason.trim() || 'Admin trừ ngân sách thủ công',
          idempotencyKey,
        });
        setSuccessMsg(res.message || `Đã trừ ${walletAmountVnd.toLocaleString('vi-VN')}đ.`);
      } else if (type === 'unlimited') {
        const expDate = unlimitedDays > 0 ? new Date(Date.now() + unlimitedDays * 24 * 3600 * 1000).toISOString() : null;
        await api.adminSetUnlimitedAiWallet(targetUser.id, {
          unlimitedForever: isUnlimitedTarget,
          unlimitedUntil: isUnlimitedTarget && unlimitedDays > 0 ? expDate : null,
          reason: walletReason.trim() || 'Admin cập nhật trạng thái không giới hạn',
          idempotencyKey,
        });
        setSuccessMsg('Đã cập nhật trạng thái không giới hạn.');
      } else if (type === 'status') {
        await api.adminSetAiWalletStatus(targetUser.id, {
          aiEnabled: aiEnabledTarget,
          reason: walletReason.trim() || 'Admin thay đổi trạng thái hoạt động AI',
          idempotencyKey,
        });
        setSuccessMsg('Đã cập nhật trạng thái hoạt động của ví AI.');
      }

      setWalletModal(null);
      setWalletReason('');
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Thao tác ví thất bại.');
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenHistory = async (user: User) => {
    setHistoryModalUser(user);
    setLoadingHistory(true);
    try {
      const res = await api.adminGetAiWalletTransactions(user.id, 50);
      setHistoryTransactions(res.transactions);
    } catch (err: any) {
      setError(err.message || 'Không thể tải lịch sử giao dịch ví.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    setError(null);
    setSuccessMsg(null);

    const expDate = newCodeExpiresDays > 0 ? new Date(Date.now() + newCodeExpiresDays * 24 * 3600 * 1000).toISOString() : undefined;

    try {
      const res = await api.adminCreateRegistrationCode({
        rewardType: newCodeType,
        creditVnd: newCodeType === 'credit' ? Number(newCodeGrantVnd) : null,
        unlimitedForever: newCodeType === 'unlimited',
        unlimitedUntil: newCodeType === 'unlimited' && newCodeExpiresDays > 0 ? expDate : null,
        maxRedemptions: Number(newCodeMaxUses) || 1,
        expiresAt: expDate,
        note: newCodeNote.trim() || null,
      });

      setJustCreatedCode(res.code);
      setSuccessMsg('Đã tạo mã ưu đãi thành công! Hãy sao chép mã ngay vì mã chỉ hiển thị một lần.');
      setShowCreateCodeModal(false);
      setNewCodeNote('');
      await fetchCodes();
    } catch (err: any) {
      setError(err.message || 'Tạo mã ưu đãi thất bại.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRevokeCode = async (codeId: string) => {
    if (!confirm('Bạn có chắc chắn muốn thu hồi mã đăng ký này ngay lập tức?')) return;
    setProcessing(true);
    setError(null);
    try {
      await api.adminRevokeRegistrationCode(codeId, 'Admin thu hồi mã thủ công');
      setSuccessMsg('Đã thu hồi mã đăng ký thành công.');
      await fetchCodes();
    } catch (err: any) {
      setError(err.message || 'Thu hồi mã thất bại.');
    } finally {
      setProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#050806] text-[#F3FAF5] p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#16A34A] selection:text-[#050806]">
      <div className="max-w-[1750px] mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[rgba(34,197,94,0.2)] pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-[#16A34A]/20 to-[#14532D]/30 border border-[#22C55E]/30 rounded-xl text-[#22C55E]">
                <Shield className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-[#F3FAF5] via-[#86EFAC] to-[#22C55E] bg-clip-text text-transparent">
                  Quản lý Người Dùng & Ví Ngân Sách AI
                </h1>
                <p className="text-sm text-[#A9B8AE] mt-0.5">
                  Kiểm soát tài khoản, hạn mức ví AI (25.000đ mặc định), nạp/trừ thủ công và cấp mã kích hoạt JAMI AI
                </p>
              </div>
            </div>
          </div>

          {/* Tab Navigation & Refresh */}
          <div className="flex items-center gap-3">
            <div className="flex bg-[#0B120D] p-1 rounded-xl border border-[rgba(34,197,94,0.2)]">
              <button
                onClick={() => setActiveTab('users')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'users'
                    ? 'bg-[#16A34A] text-[#050806] shadow-sm'
                    : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Người Dùng & Ví AI</span>
              </button>
              <button
                onClick={() => setActiveTab('codes')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'codes'
                    ? 'bg-[#16A34A] text-[#050806] shadow-sm'
                    : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Mã Ưu Đãi / Kích Hoạt</span>
              </button>
            </div>

            <button
              onClick={activeTab === 'users' ? fetchUsers : fetchCodes}
              disabled={loadingUsers || loadingCodes}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#101A13] hover:bg-[#142219] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs font-bold text-[#F3FAF5] transition disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${(loadingUsers || loadingCodes) ? 'animate-spin text-[#22C55E]' : ''}`} />
              Làm mới
            </button>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-rose-950/40 border border-rose-500/40 rounded-2xl text-rose-200 text-sm">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200 text-xs cursor-pointer">✕</button>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-3 p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl text-emerald-200 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{successMsg}</div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200 text-xs cursor-pointer">✕</button>
          </div>
        )}

        {/* Just Created Registration Code Banner */}
        {justCreatedCode && (
          <div className="p-5 bg-gradient-to-r from-emerald-950/80 to-[#0B120D] border-2 border-[#22C55E] rounded-2xl space-y-3 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#22C55E] font-bold text-sm">
                <Key className="w-5 h-5" />
                <span>MÃ ĐĂNG KÝ VỪA ĐƯỢC TẠO THÀNH CÔNG (CHỈ HIỂN THỊ 1 LẦN)</span>
              </div>
              <button
                onClick={() => setJustCreatedCode(null)}
                className="text-xs text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer"
              >
                Đóng thông báo
              </button>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex-1 w-full font-mono text-lg font-black tracking-widest bg-[#050806] px-4 py-3 rounded-xl border border-[#22C55E]/50 text-[#86EFAC] text-center select-all">
                {justCreatedCode.plainCode}
              </div>
              <button
                onClick={() => copyToClipboard(justCreatedCode.plainCode)}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#16A34A]/25"
              >
                {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'Đã sao chép!' : 'Sao chép mã'}</span>
              </button>
            </div>
            <div className="text-xs text-[#A9B8AE] flex flex-wrap gap-4">
              <span>• Loại: <strong className="text-[#F3FAF5]">{justCreatedCode.rewardType === 'credit' ? `Cộng ${(justCreatedCode.creditVnd || 0).toLocaleString('vi-VN')}đ` : 'Không giới hạn'}</strong></span>
              <span>• Số lượt dùng tối đa: <strong className="text-[#F3FAF5]">{justCreatedCode.maxRedemptions}</strong></span>
              {justCreatedCode.expiresAt && <span>• Hết hạn: <strong className="text-[#F3FAF5]">{new Date(justCreatedCode.expiresAt).toLocaleDateString('vi-VN')}</strong></span>}
              {justCreatedCode.note && <span>• Ghi chú: <strong className="text-[#F3FAF5]">{justCreatedCode.note}</strong></span>}
            </div>
          </div>
        )}

        {/* TAB 1: USERS & AI WALLETS */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* User Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.18)] rounded-2xl p-4 space-y-1">
                <div className="text-xs font-semibold text-[#A9B8AE]">Tổng người dùng</div>
                <div className="text-2xl font-black text-[#F3FAF5]">{userStats.totalCount}</div>
              </div>
              <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.18)] rounded-2xl p-4 space-y-1">
                <div className="text-xs font-semibold text-emerald-400">Đang hoạt động</div>
                <div className="text-2xl font-black text-emerald-400">{userStats.activeCount}</div>
              </div>
              <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.18)] rounded-2xl p-4 space-y-1">
                <div className="text-xs font-semibold text-rose-400">Đã bị khóa</div>
                <div className="text-2xl font-black text-rose-400">{userStats.bannedCount}</div>
              </div>
              <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.18)] rounded-2xl p-4 space-y-1">
                <div className="text-xs font-semibold text-purple-400">Quản trị viên (Admin)</div>
                <div className="text-2xl font-black text-purple-400">{userStats.adminCount}</div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 bg-[#0B120D] p-3 rounded-2xl border border-[rgba(34,197,94,0.18)]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#A9B8AE] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm theo tên hoặc email..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[#050806] border border-[rgba(34,197,94,0.2)] rounded-xl text-xs text-[#F3FAF5] placeholder-[#A9B8AE] focus:outline-none focus:border-[#22C55E]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 bg-[#050806] border border-[rgba(34,197,94,0.2)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Chỉ tài khoản Hoạt động</option>
                <option value="banned">Chỉ tài khoản Bị khóa</option>
              </select>
            </div>

            {/* Users Table */}
            <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.18)] rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#F3FAF5]">
                  <thead className="bg-[#101A13] text-[#A9B8AE] font-bold border-b border-[rgba(34,197,94,0.18)]">
                    <tr>
                      <th className="px-5 py-3.5">Học sinh / Người dùng</th>
                      <th className="px-4 py-3.5">Vai trò</th>
                      <th className="px-4 py-3.5">Số dư Ví AI</th>
                      <th className="px-4 py-3.5">Trạng thái TK</th>
                      <th className="px-4 py-3.5">Ngày tạo</th>
                      <th className="px-5 py-3.5 text-right">Quản lý Ví AI & Quyền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(34,197,94,0.12)]">
                    {loadingUsers ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-[#A9B8AE]">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#22C55E]" />
                          Đang tải danh sách người dùng...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-[#A9B8AE]">
                          Không tìm thấy người dùng nào phù hợp với bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => {
                        const isSelf = currentUser?.id === u.id || currentUser?.email === u.email;
                        const isBanned = u.status === 'banned';
                        const isAdmin = u.role === 'admin';
                        const wallet = wallets[u.id];

                        return (
                          <tr key={u.id} className="hover:bg-[#142219]/40 transition">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                  isAdmin
                                    ? 'bg-purple-900 text-purple-200 border border-purple-500/40'
                                    : 'bg-[#101A13] text-[#86EFAC] border border-[#22C55E]/30'
                                }`}>
                                  {isAdmin ? <Shield className="w-4 h-4" /> : (u.preferredName || u.displayName || u.email).slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-bold text-[#F3FAF5] flex items-center gap-1.5">
                                    {u.displayName || u.preferredName}
                                    {isSelf && (
                                      <span className="px-1.5 py-0.2 text-[9px] font-bold bg-[#16A34A]/20 text-[#86EFAC] rounded border border-[#22C55E]/30">
                                        Bạn
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-[#A9B8AE] flex items-center gap-1 mt-0.5">
                                    <Mail className="w-3 h-3 text-[#A9B8AE]" />
                                    {u.email}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3.5">
                              {isAdmin ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-950/80 text-purple-300 border border-purple-500/30">
                                  <Shield className="w-3 h-3 text-purple-400" />
                                  Admin
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#101A13] text-[#A9B8AE] border border-[rgba(34,197,94,0.18)]">
                                  <Users className="w-3 h-3 text-[#A9B8AE]" />
                                  Học sinh
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3.5">
                              {wallet ? (
                                <div className="space-y-0.5">
                                  <div className="font-black text-sm flex items-center gap-1">
                                    {wallet.isUnlimited ? (
                                      <span className="text-emerald-400 inline-flex items-center gap-1">
                                        <InfinityIcon className="w-4 h-4" /> Không giới hạn
                                      </span>
                                    ) : (
                                      <span className={wallet.balanceVnd <= 2000 ? 'text-amber-400' : 'text-[#86EFAC]'}>
                                        {wallet.balanceFormatted}
                                      </span>
                                    )}
                                  </div>
                                  {!wallet.aiEnabled && (
                                    <span className="text-[10px] text-rose-400 font-bold">Ví đang bị khóa</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-[#A9B8AE]">25.000đ</span>
                              )}
                            </td>

                            <td className="px-4 py-3.5">
                              {isBanned ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-950/80 text-rose-300 border border-rose-500/30">
                                  <Lock className="w-3 h-3 text-rose-400" />
                                  Khóa (Banned)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  Hoạt động
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 text-[#A9B8AE] whitespace-nowrap">
                              {u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '—'}
                            </td>

                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Top-up Button */}
                                <button
                                  onClick={() => {
                                    setWalletModal({ type: 'top_up', targetUser: u });
                                    setWalletAmountVnd(25000);
                                  }}
                                  title="Nạp tiền thủ công vào ví AI"
                                  className="p-1.5 rounded-lg bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] border border-[#22C55E]/30 transition cursor-pointer"
                                >
                                  <PlusCircle className="w-3.5 h-3.5" />
                                </button>

                                {/* Deduct Button */}
                                <button
                                  onClick={() => {
                                    setWalletModal({ type: 'deduct', targetUser: u });
                                    setWalletAmountVnd(10000);
                                  }}
                                  title="Trừ tiền thủ công khỏi ví AI"
                                  className="p-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900 text-amber-300 border border-amber-500/30 transition cursor-pointer"
                                >
                                  <MinusCircle className="w-3.5 h-3.5" />
                                </button>

                                {/* Unlimited Toggle Button */}
                                <button
                                  onClick={() => {
                                    setWalletModal({ type: 'unlimited', targetUser: u });
                                    setIsUnlimitedTarget(!wallet?.isUnlimited);
                                  }}
                                  title="Cấp / Hủy gói Không giới hạn"
                                  className="p-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/30 transition cursor-pointer"
                                >
                                  <InfinityIcon className="w-3.5 h-3.5" />
                                </button>

                                {/* History Ledger Button */}
                                <button
                                  onClick={() => handleOpenHistory(u)}
                                  title="Xem lịch sử giao dịch ví"
                                  className="p-1.5 rounded-lg bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] hover:text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] transition cursor-pointer"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>

                                {/* Ban/Unban */}
                                {isBanned ? (
                                  <button
                                    onClick={() => setActionModal({ type: 'unban', targetUser: u })}
                                    title="Mở khóa tài khoản"
                                    className="p-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 transition cursor-pointer"
                                  >
                                    <Unlock className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setActionModal({ type: 'ban', targetUser: u })}
                                    disabled={isSelf}
                                    title={isSelf ? 'Không thể tự khóa mình' : 'Khóa tài khoản (Ban)'}
                                    className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Role Switch */}
                                <button
                                  onClick={() => setActionModal({ type: 'role', targetUser: u, newRole: isAdmin ? 'user' : 'admin' })}
                                  disabled={isSelf}
                                  title={isAdmin ? 'Hạ xuống quyền User' : 'Nâng cấp quyền Admin'}
                                  className="p-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900 text-purple-300 border border-purple-500/30 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  <Shield className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete */}
                                <button
                                  onClick={() => setActionModal({ type: 'delete', targetUser: u })}
                                  disabled={isSelf}
                                  title={isSelf ? 'Không thể tự xóa mình' : 'Xóa tài khoản'}
                                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-red-950 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-700/50 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
          </div>
        )}

        {/* TAB 2: REGISTRATION & PROMOTION CODES */}
        {activeTab === 'codes' && (
          <div className="space-y-6">
            {/* Code Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.18)] rounded-2xl p-4 space-y-1">
                <div className="text-xs font-semibold text-[#A9B8AE]">Tổng mã đã tạo</div>
                <div className="text-2xl font-black text-[#F3FAF5]">{codeStats.totalCount}</div>
              </div>
              <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.18)] rounded-2xl p-4 space-y-1">
                <div className="text-xs font-semibold text-emerald-400">Đang hiệu lực</div>
                <div className="text-2xl font-black text-emerald-400">{codeStats.activeCount}</div>
              </div>
              <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.18)] rounded-2xl p-4 space-y-1">
                <div className="text-xs font-semibold text-amber-400">Đã dùng hết lượt</div>
                <div className="text-2xl font-black text-amber-400">{codeStats.exhaustedCount}</div>
              </div>
              <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.18)] rounded-2xl p-4 space-y-1">
                <div className="text-xs font-semibold text-rose-400">Đã thu hồi</div>
                <div className="text-2xl font-black text-rose-400">{codeStats.revokedCount}</div>
              </div>
            </div>

            {/* Filter & Create Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0B120D] p-3 rounded-2xl border border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <select
                  value={codeTypeFilter}
                  onChange={(e) => setCodeTypeFilter(e.target.value)}
                  className="px-3 py-2 bg-[#050806] border border-[rgba(34,197,94,0.2)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer"
                >
                  <option value="all">Tất cả loại mã</option>
                  <option value="credit">Mã nạp tiền (Credit VND)</option>
                  <option value="unlimited">Mã Không giới hạn (Unlimited)</option>
                </select>
                <select
                  value={codeStatusFilter}
                  onChange={(e) => setCodeStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-[#050806] border border-[rgba(34,197,94,0.2)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="active">Chỉ mã Hoạt động</option>
                  <option value="exhausted">Chỉ mã Hết lượt</option>
                  <option value="revoked">Chỉ mã Đã thu hồi</option>
                </select>
              </div>

              <button
                onClick={() => setShowCreateCodeModal(true)}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-bold text-xs rounded-xl transition shadow-lg shadow-[#16A34A]/25 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Key className="w-4 h-4" />
                <span>+ Tạo Mã Ưu Đãi Mới</span>
              </button>
            </div>

            {/* Codes Table */}
            <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.18)] rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#F3FAF5]">
                  <thead className="bg-[#101A13] text-[#A9B8AE] font-bold border-b border-[rgba(34,197,94,0.18)]">
                    <tr>
                      <th className="px-5 py-3.5">Mã / Hash</th>
                      <th className="px-4 py-3.5">Loại ưu đãi</th>
                      <th className="px-4 py-3.5">Giá trị</th>
                      <th className="px-4 py-3.5">Lượt sử dụng</th>
                      <th className="px-4 py-3.5">Hạn dùng</th>
                      <th className="px-4 py-3.5">Trạng thái</th>
                      <th className="px-4 py-3.5">Ghi chú</th>
                      <th className="px-5 py-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(34,197,94,0.12)]">
                    {loadingCodes ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-[#A9B8AE]">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#22C55E]" />
                          Đang tải danh sách mã...
                        </td>
                      </tr>
                    ) : codes.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-[#A9B8AE]">
                          Chưa có mã ưu đãi nào được tạo.
                        </td>
                      </tr>
                    ) : (
                      codes.map((c) => (
                        <tr key={c.id} className="hover:bg-[#142219]/40 transition">
                          <td className="px-5 py-3.5 font-mono text-[11px] text-[#86EFAC]">
                            {c.codePrefix}-...
                            <span className="text-[9px] text-[#A9B8AE] block font-sans">
                              ID: {c.id.substring(0, 12)}...
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            {c.rewardType === 'unlimited' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-500/30">
                                <InfinityIcon className="w-3 h-3" /> Không giới hạn
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                                <Wallet className="w-3 h-3" /> Nạp tiền
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 font-bold text-sm">
                            {c.rewardType === 'credit' ? `${(c.creditVnd || 0).toLocaleString('vi-VN')}đ` : 'Không giới hạn'}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-bold text-[#F3FAF5]">{c.redemptionCount}</span>
                            <span className="text-[#A9B8AE]"> / {c.maxRedemptions}</span>
                          </td>
                          <td className="px-4 py-3.5 text-[#A9B8AE]">
                            {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('vi-VN') : 'Vĩnh viễn'}
                          </td>
                          <td className="px-4 py-3.5">
                            {c.status === 'active' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" /> Hoạt động
                              </span>
                            )}
                            {c.status === 'exhausted' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/30">
                                Hết lượt
                              </span>
                            )}
                            {c.status === 'revoked' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-500/30">
                                Đã thu hồi
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-[#A9B8AE] max-w-xs truncate">
                            {c.note || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            {c.status === 'active' && (
                              <button
                                onClick={() => handleRevokeCode(c.id)}
                                title="Thu hồi mã ngay lập tức"
                                className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 text-[11px] font-bold transition cursor-pointer"
                              >
                                Thu hồi
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* WALLET TOP-UP / DEDUCT / UNLIMITED MODAL */}
        {walletModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-[#16A34A]/20 text-[#22C55E] border border-[#22C55E]/30">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#F3FAF5]">
                    {walletModal.type === 'top_up' && 'Nạp ngân sách AI thủ công'}
                    {walletModal.type === 'deduct' && 'Trừ ngân sách AI thủ công'}
                    {walletModal.type === 'unlimited' && 'Cấu hình gói Không giới hạn'}
                    {walletModal.type === 'status' && 'Khóa / Mở khóa ví AI'}
                  </h3>
                  <p className="text-xs text-[#A9B8AE]">
                    Người dùng: <strong className="text-[#F3FAF5]">{walletModal.targetUser.email}</strong>
                  </p>
                </div>
              </div>

              {(walletModal.type === 'top_up' || walletModal.type === 'deduct') && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-[#F3FAF5] block mb-1">
                      Số tiền ({walletModal.type === 'top_up' ? 'Nạp thêm' : 'Trừ bớt'}) (VNĐ):
                    </label>
                    <input
                      type="number"
                      step={5000}
                      min={1000}
                      value={walletAmountVnd}
                      onChange={(e) => setWalletAmountVnd(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-[#050806] border border-[rgba(34,197,94,0.25)] rounded-xl text-sm font-bold text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none"
                    />
                    <div className="flex gap-2 mt-2">
                      {[10000, 25000, 50000, 100000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setWalletAmountVnd(amt)}
                          className="px-2.5 py-1 rounded-lg bg-[#101A13] hover:bg-[#142219] text-[11px] font-bold text-[#86EFAC] border border-[rgba(34,197,94,0.2)] cursor-pointer"
                        >
                          +{amt.toLocaleString('vi-VN')}đ
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {walletModal.type === 'unlimited' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isUnlimitedChk"
                      checked={isUnlimitedTarget}
                      onChange={(e) => setIsUnlimitedTarget(e.target.checked)}
                      className="w-4 h-4 rounded text-[#16A34A] focus:ring-[#22C55E] accent-[#16A34A]"
                    />
                    <label htmlFor="isUnlimitedChk" className="text-xs font-bold text-[#F3FAF5] cursor-pointer">
                      Kích hoạt gói Không giới hạn (Unlimited AI)
                    </label>
                  </div>
                  {isUnlimitedTarget && (
                    <div>
                      <label className="text-xs font-bold text-[#F3FAF5] block mb-1">Thời hạn (ngày):</label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={unlimitedDays}
                        onChange={(e) => setUnlimitedDays(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-[#050806] border border-[rgba(34,197,94,0.25)] rounded-xl text-sm text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[#F3FAF5] block mb-1">Lý do / Ghi chú kiểm toán:</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Học sinh đạt giải nhất cấp trường, hỗ trợ nạp thêm"
                  value={walletReason}
                  onChange={(e) => setWalletReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#050806] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setWalletModal(null)}
                  className="flex-1 py-2.5 px-4 bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={handleWalletSubmit}
                  className="flex-1 py-2.5 px-4 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-bold text-xs rounded-xl transition shadow-lg shadow-[#16A34A]/25 cursor-pointer disabled:opacity-50"
                >
                  {processing ? 'Đang lưu...' : 'Xác nhận'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CREATE REGISTRATION CODE MODAL */}
        {showCreateCodeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <form onSubmit={handleCreateCode} className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-[#16A34A]/20 text-[#22C55E] border border-[#22C55E]/30">
                  <Key className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#F3FAF5]">Tạo Mã Kích Hoạt / Ưu Đãi Mới</h3>
                  <p className="text-xs text-[#A9B8AE]">Mã sẽ được băm bảo mật HMAC-SHA256 trên cơ sở dữ liệu</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-[#F3FAF5] block mb-1">Loại ưu đãi:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewCodeType('credit')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        newCodeType === 'credit'
                          ? 'bg-[#16A34A] text-[#050806] border-[#22C55E]'
                          : 'bg-[#101A13] text-[#A9B8AE] border-[rgba(34,197,94,0.2)]'
                      }`}
                    >
                      Nạp tiền (VND)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCodeType('unlimited')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        newCodeType === 'unlimited'
                          ? 'bg-[#16A34A] text-[#050806] border-[#22C55E]'
                          : 'bg-[#101A13] text-[#A9B8AE] border-[rgba(34,197,94,0.2)]'
                      }`}
                    >
                      Không giới hạn
                    </button>
                  </div>
                </div>

                {newCodeType === 'credit' && (
                  <div>
                    <label className="text-xs font-bold text-[#F3FAF5] block mb-1">Số tiền tặng kèm (VNĐ):</label>
                    <input
                      type="number"
                      step={10000}
                      min={10000}
                      value={newCodeGrantVnd}
                      onChange={(e) => setNewCodeGrantVnd(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-[#050806] border border-[rgba(34,197,94,0.25)] rounded-xl text-sm font-bold text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none"
                    />
                    <div className="flex gap-2 mt-2">
                      {[25000, 50000, 100000, 200000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setNewCodeGrantVnd(amt)}
                          className="px-2 py-0.5 rounded-lg bg-[#101A13] hover:bg-[#142219] text-[10px] font-bold text-[#86EFAC] border border-[rgba(34,197,94,0.2)] cursor-pointer"
                        >
                          {amt.toLocaleString('vi-VN')}đ
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-[#F3FAF5] block mb-1">Số lượt dùng tối đa:</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={newCodeMaxUses}
                      onChange={(e) => setNewCodeMaxUses(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-[#050806] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#F3FAF5] block mb-1">Thời hạn (ngày):</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={newCodeExpiresDays}
                      onChange={(e) => setNewCodeExpiresDays(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-[#050806] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#F3FAF5] block mb-1">Tiền tố mã (Prefix):</label>
                  <input
                    type="text"
                    maxLength={8}
                    value={newCodePrefix}
                    onChange={(e) => setNewCodePrefix(e.target.value.toUpperCase())}
                    placeholder="JAMI"
                    className="w-full px-3.5 py-2.5 bg-[#050806] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none uppercase font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[#F3FAF5] block mb-1">Ghi chú đối tượng / Chiến dịch:</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Tặng học sinh THPT Chuyên Lê Hồng Phong"
                    value={newCodeNote}
                    onChange={(e) => setNewCodeNote(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#050806] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateCodeModal(false)}
                  className="flex-1 py-2.5 px-4 bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-2.5 px-4 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-bold text-xs rounded-xl transition shadow-lg shadow-[#16A34A]/25 cursor-pointer disabled:opacity-50"
                >
                  {processing ? 'Đang tạo...' : 'Tạo mã ngay'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* USER ACTION CONFIRMATION MODAL */}
        {actionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-2xl ${
                  actionModal.type === 'delete' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                  actionModal.type === 'ban' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                  actionModal.type === 'role' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {actionModal.type === 'delete' && <Trash2 className="w-6 h-6" />}
                  {actionModal.type === 'ban' && <Lock className="w-6 h-6" />}
                  {actionModal.type === 'unban' && <Unlock className="w-6 h-6" />}
                  {actionModal.type === 'role' && <Shield className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#F3FAF5]">
                    {actionModal.type === 'delete' && 'Xác nhận xóa tài khoản'}
                    {actionModal.type === 'ban' && 'Xác nhận khóa tài khoản (Ban)'}
                    {actionModal.type === 'unban' && 'Xác nhận mở khóa tài khoản'}
                    {actionModal.type === 'role' && 'Xác nhận thay đổi phân quyền'}
                  </h3>
                  <p className="text-xs text-[#A9B8AE]">Hành động này sẽ được ghi nhật ký kiểm toán hệ thống</p>
                </div>
              </div>

              <div className="p-3 bg-[#050806] rounded-xl border border-[rgba(34,197,94,0.18)] text-xs text-[#A9B8AE] space-y-1">
                <div>• Email: <strong className="text-[#F3FAF5]">{actionModal.targetUser.email}</strong></div>
                <div>• Họ tên: <strong className="text-[#F3FAF5]">{actionModal.targetUser.displayName || '—'}</strong></div>
                {actionModal.type === 'role' && (
                  <div>• Quyền mới: <strong className="text-purple-300">{actionModal.newRole === 'admin' ? 'Quản trị viên (Admin)' : 'Học sinh (User)'}</strong></div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  className="flex-1 py-2.5 px-4 bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={handleExecuteUserAction}
                  className={`flex-1 py-2.5 px-4 font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50 ${
                    actionModal.type === 'delete' ? 'bg-red-600 hover:bg-red-500 text-white' :
                    actionModal.type === 'ban' ? 'bg-rose-600 hover:bg-rose-500 text-white' :
                    'bg-[#16A34A] hover:bg-[#22C55E] text-[#050806]'
                  }`}
                >
                  {processing ? 'Đang thực hiện...' : 'Xác nhận'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* WALLET TRANSACTIONS LEDGER MODAL */}
        {historyModalUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#16A34A]/20 text-[#22C55E] border border-[#22C55E]/30 rounded-xl">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#F3FAF5]">Sổ cái giao dịch Ví AI</h3>
                    <p className="text-xs text-[#A9B8AE]">{historyModalUser.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setHistoryModalUser(null)}
                  className="p-1.5 text-[#A9B8AE] hover:text-[#F3FAF5] text-xs cursor-pointer"
                >
                  ✕ Đóng
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto divide-y divide-[rgba(34,197,94,0.12)] bg-[#050806] rounded-2xl border border-[rgba(34,197,94,0.18)] p-2">
                {loadingHistory ? (
                  <div className="py-8 text-center text-xs text-[#A9B8AE]">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#22C55E]" />
                    Đang tải sổ cái giao dịch...
                  </div>
                ) : historyTransactions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#A9B8AE]">Chưa có giao dịch nào trong sổ cái.</div>
                ) : (
                  historyTransactions.map((tx) => (
                    <div key={tx.id} className="p-3 text-xs flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="font-bold text-[#F3FAF5] flex items-center gap-2">
                          <span className={tx.amountVnd >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                            {tx.amountVnd >= 0 ? `+${tx.amountVnd.toLocaleString('vi-VN')}đ` : `${tx.amountVnd.toLocaleString('vi-VN')}đ`}
                          </span>
                          <span className="text-[10px] text-[#A9B8AE] uppercase px-1.5 py-0.2 bg-[#101A13] rounded border border-[rgba(34,197,94,0.18)]">
                            {tx.type}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#A9B8AE]">{tx.reason || 'Giao dịch AI'}</div>
                        <div className="text-[10px] text-[#A9B8AE]/70 font-mono">
                          {new Date(tx.createdAt).toLocaleString('vi-VN')} • Số dư sau: {tx.balanceAfterVnd.toLocaleString('vi-VN')}đ
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
