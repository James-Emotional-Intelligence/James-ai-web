import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { libraryService } from '../server/services/library-service';

const sourceRoot = process.env.LIBRARY_SOURCE_ROOT || 'E:/';
const subjectNames: Record<string, string> = {
  'giao-duc-kinh-te-va-phap-luat': 'Giáo dục kinh tế và pháp luật',
  'hoat-dong-trai-nghiem-huong-nghiep': 'Hoạt động trải nghiệm, hướng nghiệp',
  'giao-duc-quoc-phong-va-an-ninh': 'Giáo dục quốc phòng và an ninh',
  'lich-su-va-dia-li': 'Lịch sử và Địa lí',
  'giao-duc-cong-dan': 'Giáo dục công dân',
  'giao-duc-the-chat': 'Giáo dục thể chất',
  'khoa-hoc-tu-nhien': 'Khoa học tự nhiên',
  'tieng-trung-quoc': 'Tiếng Trung Quốc',
  'tieng-phap': 'Tiếng Pháp',
  'tieng-nhat': 'Tiếng Nhật',
  'tieng-anh': 'Tiếng Anh',
  'tieng-duc': 'Tiếng Đức',
  'tieng-nga': 'Tiếng Nga',
  'cong-nghe': 'Công nghệ',
  'am-nhac': 'Âm nhạc',
  'mi-thuat': 'Mĩ thuật',
  'ngu-van': 'Ngữ văn',
  'tin-hoc': 'Tin học',
  'lich-su': 'Lịch sử',
  'dia-li': 'Địa lí',
  'hoa-hoc': 'Hóa học',
  'sinh-hoc': 'Sinh học',
  'vat-li': 'Vật lí',
  toan: 'Toán',
};

function metadata(fileName: string, grade: number) {
  const stem = fileName.replace(/\.pdf$/i, '');
  const kind = /-sbt-/.test(stem) ? 'sbt' : 'sgk';
  const body = stem.replace(/^\d{2}-(sgk|sbt)-/, '').replace(/^\d{2}-/, '');
  const matched = Object.entries(subjectNames)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([slug]) => body.includes(slug));
  const subject = matched?.[1] || 'Khác';
  const tail = matched ? body.slice(body.indexOf(matched[0]) + matched[0].length).replace(/^-/, '') : body;
  const readableTail = tail
    .replace(/global-success/g, 'Global Success')
    .replace(/tap-mot/g, 'tập một')
    .replace(/tap-hai/g, 'tập hai')
    .replace(/dinh-huong-nghe-nghiep/g, 'định hướng nghề nghiệp')
    .replace(/trai-nghiem-nghe-nghiep/g, 'trải nghiệm nghề nghiệp')
    .replace(/mo-dun/g, 'mô đun')
    .replace(/cong-nghe/g, 'công nghệ')
    .replace(/trong-trot/g, 'trồng trọt')
    .replace(/chan-nuoi/g, 'chăn nuôi')
    .replace(/che-bien-thuc-pham/g, 'chế biến thực phẩm')
    .replace(/trong-cay-an-qua/g, 'trồng cây ăn quả')
    .replace(/co-khi/g, 'cơ khí')
    .replace(/dien-dien-tu/g, 'điện, điện tử')
    .replace(/lam-nghiep-thuy-san/g, 'lâm nghiệp, thủy sản')
    .replace(/-/g, ' ')
    .trim();
  const prefix = body.startsWith('chuyen-de-hoc-tap-') ? 'Chuyên đề học tập ' : '';
  const title = `${kind === 'sbt' ? 'Sách bài tập' : 'Sách giáo khoa'} ${prefix}${subject} ${readableTail}`.replace(/\s+/g, ' ').trim();
  return { title, grade, subject, kind: kind as 'sgk' | 'sbt', fileName };
}

async function main() {
  let added = 0;
  let skipped = 0;
  for (let grade = 6; grade <= 12; grade++) {
    const dir = path.join(sourceRoot, `PDF SGK Lớp ${String(grade).padStart(2, '0')} 2026-2027`);
    const entries = (await fs.promises.readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const id = `lib_${crypto.createHash('sha256').update(`${grade}/${entry.name}`).digest('hex').slice(0, 24)}`;
      const result = await libraryService.addFromFile(path.join(dir, entry.name), {
        id,
        ...metadata(entry.name, grade),
      });
      if (result.added) added++;
      else skipped++;
    }
    console.log(`Lớp ${grade}: ${entries.length} PDF, đã thêm ${added}, đã có ${skipped}.`);
  }
  console.log(`Hoàn tất: ${added} tài liệu mới, ${skipped} tài liệu đã có.`);
}

main().catch((error) => {
  console.error('Không thể nhập thư viện:', error);
  process.exitCode = 1;
});
