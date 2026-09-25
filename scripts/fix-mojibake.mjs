import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { Buffer } from 'node:buffer';

const cp1252ToBytes = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85,
  '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8A,
  '\u2039': 0x8B, '\u0152': 0x8C, '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92,
  '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B, '\u0153': 0x9C,
  '\u017E': 0x9E, '\u0178': 0x9F, '\u00AD': 0xAD, '\u00A0': 0xA0
};

const SPECIFIC_REPLACEMENTS = [
  ['biá»ƒu', 'biểu'],
  ['liá»‡u', 'liệu'],
  ['lá»‹ch', 'lịch'],
  ['nhiá»‡m', 'nhiệm'],
  ['khoÃ¡', 'khóa'],
  ['thá»i', 'thời'],
  ['khÃ³a', 'khóa'],
  ['thÃ nh cÃ´ng', 'thành công'],
  ['thÃ nh', 'thành'],
  ['cÃ´ng', 'công'],
  ['khÃ´ng', 'không'],
  ['cá»§a', 'của'],
  ['báº¡n', 'bạn'],
  ['chÃ­nh', 'chính'],
  ['quáº£n', 'quản'],
  ['trá»‹', 'trị'],
  ['viÃªn', 'viên'],
  ['ngÆ°á» i', 'người'],
  ['dÃ¹ng', 'dùng'],
  ['tá»“n', 'tồn'],
  ['táº¡i', 'tại'],
  ['hoáº·c', 'hoặc'],
  ['thuá»™c', 'thuộc'],
  ['tÃ i', 'tài'],
  ['khoáº£n', 'khoản'],
  ['Ä‘Ã£', 'đã'],
  ['Ä‘Äƒng', 'đăng'],
  ['nháº­p', 'nhập'],
  ['háº¿t', 'hết'],
  ['háº¡n', 'hạn'],
  ['há»£p', 'hợp'],
  ['lá»‡', 'lệ'],
  ['vÃ´', 'vô'],
  ['hiá»‡u', 'hiệu'],
  ['hÃ³a', 'hóa'],
  ['Káº¿t', 'Kết'],
  ['ná»‘i', 'nối'],
  ['cÆ¡', 'cơ'],
  ['sá»Ÿ', 'sở'],
  ['dá»¯', 'dữ'],
  ['táº¡m', 'tạm'],
  ['giÃ¡n', 'gián'],
  ['Ä‘oáº¡n', 'đoạn'],
  ['Vui', 'Vui'],
  ['lÃ²ng', 'lòng'],
  ['táº£i', 'tải'],
  ['láº¡i', 'lại'],
  ['trang', 'trang'],
  ['thá»­', 'thử'],
  ['YÃªu', 'Yêu'],
  ['cáº§u', 'cầu'],
  ['quyá» n', 'quyền'],
  ['thá»ƒ', 'thể'],
  ['tá»±', 'tự'],
  ['khÃ³a', 'khóa'],
  ['duy', 'duy'],
  ['nháº¥t', 'nhất'],
  ['má»Ÿ', 'mở'],
  ['Vai', 'Vai'],
  ['trÃ²', 'trò'],
  ['chá»‰', 'chỉ'],
  ['cÃ³', 'có'],
  ['lÃ ', 'là'],
  ['gá»¡', 'gỡ'],
  ['bá» ', 'bỏ'],
  ['mÃ¬nh', 'mình'],
  ['háº¡', 'hạ'],
  ['cá» ', 'của'],
  ['cáº­p', 'cập'],
  ['xÃ³a', 'xóa'],
  ['náº¡p', 'nạp'],
  ['ngÃ¢n', 'ngân'],
  ['sÃ¡ch', 'sách'],
  ['trá»«', 'trừ'],
  ['gÃ³i', 'gói'],
  ['giá»›i', 'giới'],
  ['á»©', 'ứ'],
  ['á»§', 'ủ'],
  ['áº­', 'ậ'],
  ['á»£', 'ợ'],
  ['á» ', 'ở'],
  ['á»•', 'ổ'],
  ['á»‰', 'ỉ'],
  ['á»‘', 'ố'],
  ['á»“', 'ồ'],
  ['á»—', 'ỗ'],
  ['á»™', 'ộ'],
  ['áº¿', 'ế'],
  ['á» ', 'ề'],
  ['á»ƒ', 'ể'],
  ['á»…', 'ễ'],
  ['á»‡', 'ệ'],
  ['Ã¡', 'á'],
  ['Ã ', 'à'],
  ['áº£', 'ả'],
  ['Ã£', 'ã'],
  ['áº¡', 'ạ'],
  ['Ã¢', 'â'],
  ['áº¥', 'ấ'],
  ['áº§', 'ầ'],
  ['áº©', 'ẩ'],
  ['áº«', 'ẫ'],
  ['áº­', 'ậ'],
  ['Äƒ', 'ă'],
  ['áº¯', 'ắ'],
  ['áº±', 'ằ'],
  ['áº³', 'ẳ'],
  ['áºµ', 'ẵ'],
  ['áº·', 'ặ'],
  ['Ã©', 'é'],
  ['Ã¨', 'è'],
  ['áº»', 'ẻ'],
  ['áº½', 'ẽ'],
  ['áº¹', 'ẹ'],
  ['Ãª', 'ê'],
  ['Ã­', 'í'],
  ['Ã¬', 'ì'],
  ['á»‰', 'ỉ'],
  ['Ä©', 'ĩ'],
  ['á»‹', 'ị'],
  ['Ã³', 'ó'],
  ['Ã²', 'ò'],
  ['á» ', 'ỏ'],
  ['Ãµ', 'õ'],
  ['á» ', 'ọ'],
  ['Ã´', 'ô'],
  ['Æ¡', 'ơ'],
  ['á»›', 'ớ'],
  ['á» ', 'ờ'],
  ['á»Ÿ', 'ở'],
  ['á»¡', 'ỡ'],
  ['á»£', 'ợ'],
  ['Ãº', 'ú'],
  ['Ã¹', 'ù'],
  ['á»§', 'ủ'],
  ['Å©', 'ũ'],
  ['á»¥', 'ụ'],
  ['Æ°', 'ư'],
  ['á»©', 'ứ'],
  ['á»«', 'ừ'],
  ['á»­', 'ử'],
  ['á»¯', 'ữ'],
  ['á»±', 'ự'],
  ['Ã½', 'ý'],
  ['á»³', 'ỳ'],
  ['á»·', 'ỷ'],
  ['á»¹', 'ỹ'],
  ['á»µ', 'ỵ'],
  ['Ä‘', 'đ'],
  ['Ä ', 'Đ'],
];

function stringToCp1252Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (cp1252ToBytes[ch] !== undefined) {
      bytes.push(cp1252ToBytes[ch]);
    } else {
      const code = str.charCodeAt(i);
      if (code <= 0xFF) {
        bytes.push(code);
      } else {
        return null;
      }
    }
  }
  return Buffer.from(bytes);
}

function restoreMojibakeSequence(match) {
  const bytes = stringToCp1252Bytes(match);
  if (!bytes) return match;
  try {
    const decoded = bytes.toString('utf8');
    if (!decoded.includes('\uFFFD') && decoded !== match) {
      return decoded;
    }
  } catch (e) {}
  return match;
}

const MOJIBAKE_CLUSTER_REGEX = /(?:(?:[\u00C0-\u00DF][\u0080-\u00BF\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178\u00AD\u00A0])|(?:[\u00E0-\u00EF][\u0080-\u00BF\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178\u00AD\u00A0]{2}))+/g;

function fixFile(filePath) {
  if (!/\.(ts|tsx|js|mjs|json|sql)$/.test(filePath)) return false;
  if (filePath.includes('node_modules') || filePath.includes('dist') || filePath.includes('.git') || filePath.includes('release-package')) return false;

  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  content = content.replace(MOJIBAKE_CLUSTER_REGEX, (match) => {
    return restoreMojibakeSequence(match);
  });

  for (const [bad, good] of SPECIFIC_REPLACEMENTS) {
    if (content.includes(bad)) {
      content = content.replaceAll(bad, good);
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[Fixed Mojibake] ${filePath}`);
    return true;
  }
  return false;
}

function walkAndFix(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        walkAndFix(fullPath);
      }
    } else {
      fixFile(fullPath);
    }
  }
}

const targetDirs = ['server', 'src', 'shared', 'tests'];
for (const dir of targetDirs) {
  walkAndFix(path.resolve(process.cwd(), dir));
}
