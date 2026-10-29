import React, { useEffect, useState, useMemo } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from './_auth';
import { adminService, AdminBlogDto } from '@/services/admin.service';
import { getPublicSiteUrl } from '@/lib/urls';
import { toast } from 'sonner';
import {
  IconArticle,
  IconRefresh,
  IconExternalLink,
  IconPlus,
  IconEdit,
  IconTrash,
  IconSearch,
  IconAlertCircle,
  IconEye,
  IconPencil,
  IconLoader,
  IconX,
  IconCheck,
} from '@tabler/icons-react';

function renderSimpleMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n');
  return (
    <div className="space-y-2 text-xs leading-relaxed text-text">
      {lines.map((line, idx) => {
        if (line.startsWith('# ')) {
          return <h1 key={idx} className="text-base font-bold text-text pt-2">{line.slice(2)}</h1>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={idx} className="text-sm font-bold text-text pt-1.5">{line.slice(3)}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={idx} className="text-xs font-bold text-text pt-1">{line.slice(4)}</h3>;
        }
        if (line.startsWith('> ')) {
          return (
            <blockquote key={idx} className="border-l-2 border-primary pl-3 py-1 text-text-muted italic bg-surface-muted rounded-r">
              {line.slice(2)}
            </blockquote>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <li key={idx} className="list-disc list-inside text-text-secondary pl-2">
              {line.slice(2)}
            </li>
          );
        }
        if (!line.trim()) {
          return <div key={idx} className="h-1.5" />;
        }
        return <p key={idx} className="text-text-secondary">{line}</p>;
      })}
    </div>
  );
}

function BlogPage() {
  const [blogs, setBlogs] = useState<AdminBlogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Article Modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBlog, setEditingBlog] = useState<AdminBlogDto | null>(null);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('Clinical Governance');
  const [status, setStatus] = useState<'Draft' | 'Published'>('Published');
  const [bannerUrl, setBannerUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');

  // Delete state
  const [blogToDelete, setBlogToDelete] = useState<AdminBlogDto | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadBlogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.getBlogs();
      setBlogs(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load blog editorial articles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBlogs();
  }, []);

  const handleOpenCreate = () => {
    setEditingBlog(null);
    setTitle('');
    setSlug('');
    setAuthor('ClinicEZ Editorial Team');
    setCategory('Clinical Governance');
    setStatus('Published');
    setBannerUrl('');
    setSummary('');
    setContent('# New Practice Advisory\n\nEnter the full statutory guidance and clinical documentation here...\n\n- Key Point 1\n- Key Point 2');
    setActiveTab('write');
    setDialogOpen(true);
  };

  const handleOpenEdit = (b: AdminBlogDto) => {
    setEditingBlog(b);
    setTitle(b.title);
    setSlug(b.slug);
    setAuthor(b.author);
    setCategory(b.category);
    setStatus(b.status === 'Draft' ? 'Draft' : 'Published');
    setBannerUrl(b.bannerUrl || '');
    setSummary(b.summary);
    setContent(b.content || '');
    setActiveTab('write');
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      toast.error('Title and slug are required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Partial<AdminBlogDto> = {
        title: title.trim(),
        slug: slug.trim().toLowerCase(),
        author: author.trim(),
        category,
        status,
        bannerUrl: bannerUrl.trim() || undefined,
        summary: summary.trim(),
        content: content.trim(),
      };

      if (editingBlog) {
        await adminService.updateBlog(editingBlog.id, payload);
        toast.success(`Article '${title}' updated.`);
      } else {
        await adminService.createBlog(payload);
        toast.success(`Article '${title}' published.`);
      }
      setDialogOpen(false);
      await loadBlogs();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save article');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!blogToDelete) return;

    setDeleteLoading(true);
    try {
      await adminService.deleteBlog(blogToDelete.id);
      toast.success(`Article '${blogToDelete.title}' deleted.`);
      setBlogToDelete(null);
      await loadBlogs();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete article');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredBlogs = useMemo(() => {
    return blogs.filter((b) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        b.title.toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.summary.toLowerCase().includes(q);

      const matchesCategory =
        categoryFilter === 'ALL' || b.category.toLowerCase() === categoryFilter.toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [blogs, search, categoryFilter]);

  const categories = useMemo(() => {
    const set = new Set(blogs.map((b) => b.category));
    return ['ALL', ...Array.from(set)];
  }, [blogs]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Blog CRM & Editorial Articles</h1>
          <p className="text-xs text-text-muted mt-1">
            Publish educational content, clinical practice guides, and statutory PhilHealth notices.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadBlogs}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-text-secondary bg-surface border border-border hover:bg-surface-muted rounded-xl transition-colors cursor-pointer"
          >
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <IconPlus className="h-4 w-4" />
            <span>New Article</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadBlogs}
            className="px-3 py-1 font-semibold rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles by title, author, or keyword..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'ALL' ? 'All Categories' : c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4-State Cards Grid */}
      {loading ? (
        /* Skeleton Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl bg-surface border border-border space-y-4 animate-pulse"
            >
              <div className="flex justify-between">
                <div className="h-4 w-20 bg-surface-muted rounded-md" />
                <div className="h-4 w-16 bg-surface-muted rounded-md" />
              </div>
              <div className="h-5 w-48 bg-surface-muted rounded-md" />
              <div className="h-10 w-full bg-surface-muted rounded-md" />
              <div className="pt-3 border-t border-border flex justify-between">
                <div className="h-3 w-20 bg-surface-muted rounded-md" />
                <div className="h-3 w-16 bg-surface-muted rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredBlogs.length === 0 ? (
        /* Contextual Empty State */
        <div className="p-12 rounded-2xl bg-surface border border-dashed border-border text-center space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-surface-muted text-text-muted">
            <IconArticle className="h-8 w-8" />
          </div>
          <h3 className="font-bold text-sm text-text">No Blog Articles Found</h3>
          <p className="text-xs text-text-muted max-w-sm mx-auto">
            {search || categoryFilter !== 'ALL'
              ? 'No articles match your search criteria. Try resetting filters.'
              : 'Zero editorial articles currently exist. Publish your first clinical guide or announcement.'}
          </p>
          <div className="pt-2">
            {search || categoryFilter !== 'ALL' ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCategoryFilter('ALL');
                }}
                className="px-4 py-2 text-xs font-semibold text-primary bg-primary-subtle rounded-xl hover:bg-primary/20 transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                <IconPlus className="h-4 w-4" />
                <span>Write First Article</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Active Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBlogs.map((b) => (
            <div
              key={b.id}
              className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-4 hover:shadow-md transition-all"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-subtle text-primary border border-primary/20">
                    {b.category}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      b.status === 'Published'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    }`}
                  >
                    {b.status}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-sm text-text leading-snug line-clamp-2">
                    {b.title}
                  </h3>
                  <p className="text-xs text-text-muted line-clamp-3 mt-1 leading-relaxed">
                    {b.summary}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
                <span className="text-[11px] text-text-muted">By {b.author}</span>

                <div className="flex items-center gap-1.5">
                  <a
                    href={getPublicSiteUrl(`/blogs/${b.slug}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-surface-muted transition-colors"
                    title="View Live Article on Public Site"
                  >
                    <IconExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(b)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition-colors cursor-pointer"
                    title="Edit Article"
                  >
                    <IconEdit className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlogToDelete(b)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Delete Article"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Article Editor Dialog with Live Markdown Preview */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setDialogOpen(false)}
        >
          <div
            className="w-full max-w-3xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-text"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary-subtle text-primary">
                  <IconArticle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text">
                    {editingBlog ? 'Edit Editorial Article' : 'Author New Blog Article'}
                  </h2>
                  <p className="text-xs text-text-muted">Live Markdown formatting and SEO metadata</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="flex flex-col">
              <div className="p-6 max-h-[68vh] overflow-y-auto space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Article Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        if (!editingBlog && !slug) {
                          setSlug(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '-')
                              .replace(/(^-|-$)+/g, '')
                          );
                        }
                      }}
                      placeholder="e.g. PhilHealth Yakap Transmittal Standards 2026"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Slug (URL Segment)</label>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) =>
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''))
                      }
                      placeholder="e.g. yakap-transmittal-standards"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Author</label>
                    <input
                      type="text"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="ClinicEZ Editorial Team"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Category</label>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="Clinical Governance"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Publication Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                    >
                      <option value="Published">Published</option>
                      <option value="Draft">Draft</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Banner Image URL (Optional)</label>
                  <input
                    type="url"
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Article Summary / Excerpt</label>
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Brief 1-2 sentence overview for cards and social previews..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                  />
                </div>

                {/* Markdown Editor / Preview Switcher */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between border-b border-border pb-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('write')}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                          activeTab === 'write'
                            ? 'bg-primary text-white'
                            : 'text-text-muted hover:text-text'
                        }`}
                      >
                        <IconPencil className="h-3.5 w-3.5" />
                        <span>Write Markdown</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('preview')}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                          activeTab === 'preview'
                            ? 'bg-primary text-white'
                            : 'text-text-muted hover:text-text'
                        }`}
                      >
                        <IconEye className="h-3.5 w-3.5" />
                        <span>Live Preview</span>
                      </button>
                    </div>
                    <span className="text-[11px] text-text-muted">
                      Markdown supported: # H1, ## H2, &gt; quote, - list
                    </span>
                  </div>

                  {activeTab === 'write' ? (
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="# Article Title\n\nWrite your detailed content here..."
                      rows={10}
                      className="w-full px-4 py-3 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden leading-relaxed"
                    />
                  ) : (
                    <div className="min-h-52 p-4 rounded-xl bg-surface border border-border overflow-y-auto">
                      {renderSimpleMarkdown(content)}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-surface-muted border-t border-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {submitting && <IconLoader className="h-4 w-4 animate-spin" />}
                  <span>{editingBlog ? 'Save Article Changes' : 'Publish Article'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {blogToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setBlogToDelete(null)}
        >
          <div
            className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-6 text-text space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                <IconTrash className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-text">Delete Article</h3>
                <p className="text-xs text-text-muted">ClinicEZ Editorial Operations</p>
              </div>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              Are you sure you want to permanently delete article &ldquo;{blogToDelete.title}&rdquo;? It will be removed immediately from the public site.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setBlogToDelete(null)}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {deleteLoading && <IconLoader className="h-4 w-4 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: 'blog',
  component: BlogPage,
});
