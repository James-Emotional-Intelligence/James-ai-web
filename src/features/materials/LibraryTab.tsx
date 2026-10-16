import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, Eye, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import type { LibraryDocument } from '../../../shared/types';
import { api } from '../../lib/api-client';
import { useAuth } from '../auth/AuthProvider';

export const LibraryTab: React.FC = () => {
  const { user, profile } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [grade, setGrade] = useState(String(profile?.gradeLevel || 'all'));
  const [subject, setSubject] = useState('all');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploadGrade, setUploadGrade] = useState(String(profile?.gradeLevel || 9));
  const [uploadSubject, setUploadSubject] = useState('');
  const [uploadKind, setUploadKind] = useState<'sgk' | 'sbt' | 'other'>('other');

  const reload = async () => {
    try {
      const result = await api.getLibraryDocuments();
      setDocuments(result.documents);
      setError(null);
    } catch (reason: any) {
      setError(reason.message || 'Không thể tải thư viện tài liệu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const subjects = useMemo(() => [...new Set(documents.map((item) => item.subject))].sort((a, b) => a.localeCompare(b, 'vi')), [documents]);
  const filtered = useMemo(() => documents.filter((item) =>
    (grade === 'all' || item.grade === Number(grade)) &&
    (subject === 'all' || item.subject === subject) &&
    (!search.trim() || `${item.title} ${item.subject}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')))
  ), [documents, grade, subject, search]);

  const addDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !title.trim() || !uploadSubject.trim()) return;
    if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 100 * 1024 * 1024) {
      setError('Chỉ hỗ trợ PDF tối đa 100 MB.');
      return;
    }
    setUploading(true);
    try {
      await api.uploadLibraryDocument(file, { title: title.trim(), grade: Number(uploadGrade), subject: uploadSubject.trim(), kind: uploadKind });
      await reload();
      setShowUpload(false);
      setFile(null);
      setTitle('');
      setUploadSubject('');
    } catch (reason: any) {
      setError(reason.message || 'Không thể thêm tài liệu.');
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = async (document: LibraryDocument) => {
    if (!window.confirm(`Xóa “${document.title}” khỏi thư viện chung?`)) return;
    try {
      await api.deleteLibraryDocument(document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setError(null);
    } catch (reason: any) {
      setError(reason.message || 'Không thể xóa tài liệu.');
    }
  };

  return (
    <section className="space-y-4" aria-label="Thư viện tài liệu chung">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Thư viện tài liệu chung</h2>
          <p className="text-xs text-slate-400">Sách giáo khoa và tài liệu học tập cho lớp 6–12. Chọn lớp, tìm sách rồi đọc hoặc tải PDF.</p>
        </div>
        {isAdmin && <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"><Plus className="h-4 w-4" />Thêm tài liệu</button>}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-emerald-900/40 bg-[#0B140E] p-3">
        <label className="sr-only" htmlFor="library-grade">Lớp</label>
        <select id="library-grade" value={grade} onChange={(event) => { setGrade(event.target.value); setVisibleCount(24); }} className="rounded-xl border border-emerald-900/50 bg-[#101A13] px-3 py-2 text-xs text-white">
          <option value="all">Tất cả lớp</option>
          {[6, 7, 8, 9, 10, 11, 12].map((value) => <option key={value} value={value}>Lớp {value}</option>)}
        </select>
        <label className="sr-only" htmlFor="library-subject">Môn học</label>
        <select id="library-subject" value={subject} onChange={(event) => { setSubject(event.target.value); setVisibleCount(24); }} className="rounded-xl border border-emerald-900/50 bg-[#101A13] px-3 py-2 text-xs text-white">
          <option value="all">Tất cả môn học</option>
          {subjects.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <div className="relative min-w-44 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input aria-label="Tìm tài liệu" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(24); }} placeholder="Tìm tên sách, môn học..." className="w-full rounded-xl border border-emerald-900/50 bg-[#101A13] py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-500" />
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-800/40 bg-rose-950/30 p-3 text-xs text-rose-300">{error}</p>}
      {loading ? <p className="text-sm text-slate-400">Đang tải tài liệu...</p> : filtered.length === 0 ? <p className="rounded-2xl border border-emerald-900/40 p-8 text-center text-sm text-slate-400">Chưa có tài liệu phù hợp.</p> : (
        <>
          <p className="text-xs text-slate-400">{filtered.length} tài liệu</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.slice(0, visibleCount).map((document) => (
              <article key={document.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-emerald-900/40 bg-[#0B140E] p-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-emerald-300"><BookOpen className="h-4 w-4" />Lớp {document.grade} · {document.subject}</div>
                  <h3 className="text-sm font-bold text-white">{document.title}</h3>
                  <p className="mt-2 text-[11px] text-slate-400">{document.kind.toUpperCase()} · {(document.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={api.getLibraryPreviewUrl(document.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600"><Eye className="h-3.5 w-3.5" />Đọc PDF</a>
                  <a href={api.getLibraryDownloadUrl(document.id)} download={document.fileName} className="flex items-center gap-1 rounded-lg border border-emerald-800 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-950"><Download className="h-3.5 w-3.5" />Tải về</a>
                  {isAdmin && <button onClick={() => void deleteDocument(document)} aria-label={`Xóa ${document.title}`} className="ml-auto rounded-lg border border-rose-900/60 px-2 py-2 text-rose-300 hover:bg-rose-950"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </article>
            ))}
          </div>
          {visibleCount < filtered.length && <button onClick={() => setVisibleCount((count) => count + 24)} className="rounded-xl border border-emerald-800 px-4 py-2 text-xs font-bold text-emerald-300">Xem thêm</button>}
        </>
      )}

      {isAdmin && showUpload && (
        <div role="dialog" aria-modal="true" aria-label="Thêm tài liệu vào thư viện chung" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form onSubmit={addDocument} className="w-full max-w-md space-y-3 rounded-2xl border border-emerald-800 bg-[#0B140E] p-5 text-white">
            <div className="flex items-center justify-between"><h3 className="font-bold">Thêm tài liệu vào thư viện chung</h3><button type="button" onClick={() => setShowUpload(false)} aria-label="Đóng"><X className="h-5 w-5" /></button></div>
            <label className="block text-xs">Tệp PDF<input type="file" accept=".pdf,application/pdf" required onChange={(event) => { const chosen = event.target.files?.[0] || null; setFile(chosen); if (chosen) setTitle(chosen.name.replace(/\.pdf$/i, '').replace(/-/g, ' ')); }} className="mt-1 block w-full text-xs" /></label>
            <label className="block text-xs">Tên tài liệu<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} className="mt-1 w-full rounded-lg border border-emerald-800 bg-[#101A13] p-2" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">Lớp<select value={uploadGrade} onChange={(event) => setUploadGrade(event.target.value)} className="mt-1 w-full rounded-lg border border-emerald-800 bg-[#101A13] p-2">{[6, 7, 8, 9, 10, 11, 12].map((value) => <option key={value} value={value}>Lớp {value}</option>)}</select></label>
              <label className="text-xs">Loại<select value={uploadKind} onChange={(event) => setUploadKind(event.target.value as 'sgk' | 'sbt' | 'other')} className="mt-1 w-full rounded-lg border border-emerald-800 bg-[#101A13] p-2"><option value="sgk">SGK</option><option value="sbt">SBT</option><option value="other">Khác</option></select></label>
            </div>
            <label className="block text-xs">Môn học<input value={uploadSubject} onChange={(event) => setUploadSubject(event.target.value)} required maxLength={100} placeholder="Ví dụ: Toán" className="mt-1 w-full rounded-lg border border-emerald-800 bg-[#101A13] p-2" /></label>
            <button type="submit" disabled={uploading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 p-2.5 text-xs font-bold disabled:opacity-50"><Upload className="h-4 w-4" />{uploading ? 'Đang tải lên...' : 'Thêm tài liệu'}</button>
          </form>
        </div>
      )}
    </section>
  );
};
