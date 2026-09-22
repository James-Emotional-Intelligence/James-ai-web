import { db } from '../server/db/mysql';
import { UserRepository } from '../server/repositories/user-repository';

async function main() {
  const args = process.argv.slice(2);
  let email = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      email = args[i + 1].trim().toLowerCase();
      i++;
    } else if (!args[i].startsWith('-') && !email) {
      email = args[i].trim().toLowerCase();
    }
  }

  if (!email || !email.includes('@')) {
    console.error('❌ Lỗi: Vui lòng cung cấp email hợp lệ cần nâng cấp lên Quản trị viên (Admin).');
    console.log('Cách dùng: npm run admin:promote -- --email admin@domain.com');
    console.log('       hoặc: tsx scripts/promote-admin.ts --email admin@domain.com');
    process.exit(1);
  }

  console.log(`[JAMI Admin CLI] Đang khởi tạo kết nối database để cấp quyền Admin cho: ${email}...`);

  try {
    await db.init();
    const userRepo = UserRepository.getInstance();
    const user = await userRepo.findByEmail(email);

    if (!user) {
      console.error(`❌ Lỗi: Không tìm thấy tài khoản người dùng với email "${email}".`);
      process.exit(1);
    }

    if (user.role === 'admin') {
      console.log(`ℹ️ Tài khoản ${email} (${user.displayName || user.id}) hiện ĐÃ LÀ Quản trị viên (Admin).`);
      process.exit(0);
    }

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE users SET role = 'admin', updated_at = NOW(3) WHERE id = ?`,
          [user.id]
        );
        try {
          await conn.execute(
            `INSERT INTO admin_audit_logs (id, admin_user_id, action, target_user_id, details, ip_address, user_agent, created_at)
             VALUES (?, 'system_cli', 'promote_admin', ?, ?, '127.0.0.1', 'JAMI CLI promote-admin.ts', NOW(3))`,
            [`log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`, user.id, JSON.stringify({ email, previousRole: user.role, newRole: 'admin' })]
          );
        } catch {
          // In case admin_audit_logs does not exist, transaction still succeeds
        }
      });
    }

    await userRepo.setUserRole(user.id, 'admin');

    console.log(`✅ THÀNH CÔNG! Đã nâng cấp tài khoản "${email}" thành Quản trị viên (role: admin).`);
    console.log(`   - User ID: ${user.id}`);
    console.log(`   - Display Name: ${user.displayName || 'Chưa đặt'}`);
    console.log(`   - Role: admin`);
    console.log(`   - Trạng thái: ${user.status}`);
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Lỗi khi thực hiện nâng quyền Quản trị viên:', err.message);
    process.exit(1);
  }
}

main();
