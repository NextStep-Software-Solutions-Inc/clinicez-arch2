"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAdmin } from "../AdminLayoutClient";
import { adminService, AdminBlogDto } from "@/services/admin.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { z } from "zod";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  IconNotebook, 
  IconSearch, 
  IconLoader, 
  IconPlus, 
  IconEdit, 
  IconTrash, 
  IconCircleCheck, 
  IconAlertCircle, 
  IconCircleX,
  IconBold,
  IconItalic,
  IconHeading,
  IconQuote,
  IconList,
  IconCode,
  IconLink,
  IconEye,
  IconPencil,
  IconSend,
  IconEyeOff,
  IconExternalLink
} from "@tabler/icons-react";

const blogArticleSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric and hyphens only"),
  author: z.string().min(2, "Author must be at least 2 characters").max(50),
  category: z.string().min(1),
  status: z.enum(["Draft", "Published"]),
  bannerUrl: z.string().optional().refine(val => !val || val.startsWith("http://") || val.startsWith("https://"), {
    message: "Banner URL must start with http:// or https://"
  }),
  summary: z.string().min(10, "Summary must be at least 10 characters").max(500),
  content: z.string().min(20, "Content must be at least 20 characters")
});

export default function AdminBlogPage() {
  const { hasPermission } = useAdmin();
  const [blogs, setBlogs] = useState<AdminBlogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Dialog and form states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBlog, setEditingBlog] = useState<AdminBlogDto | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {}
  });

  const showConfirm = (title: string, description: string, onConfirm: () => void) => {
    setConfirmDialog({
      open: true,
      title,
      description,
      onConfirm
    });
  };
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    summary: "",
    content: "",
    author: "",
    category: "General",
    status: "Draft" as "Draft" | "Published",
    bannerUrl: ""
  });

  const validation = blogArticleSchema.safeParse(formData);
  const isValid = validation.success;
  const validationErrors = validation.success ? {} : validation.error.flatten().fieldErrors as Record<string, string[]>;

  const loadBlogs = async () => {
    try {
      setLoading(true);
      const data = await adminService.getBlogs();
      setBlogs(data);
    } catch (err: any) {
      setError(err.message || "Failed to load blog posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPermission("manage:blogs")) {
      setError("Unauthorized access");
      setLoading(false);
      return;
    }
    loadBlogs();
  }, [hasPermission]);

  const handleOpenCreate = () => {
    setEditingBlog(null);
    setActiveTab("write");
    setFormData({
      title: "",
      slug: "",
      summary: "",
      content: "",
      author: "",
      category: "General",
      status: "Draft",
      bannerUrl: ""
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (blog: AdminBlogDto) => {
    setEditingBlog(blog);
    setActiveTab("write");
    setFormData({
      title: blog.title,
      slug: blog.slug,
      summary: blog.summary,
      content: blog.content,
      author: blog.author,
      category: blog.category,
      status: blog.status,
      bannerUrl: blog.bannerUrl || ""
    });
    setDialogOpen(true);
  };

  const handleTitleChange = (title: string) => {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
    setFormData(prev => ({ ...prev, title, slug }));
  };

  const insertMarkdown = (prefix: string, suffix: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = formData.content;
    const selection = currentVal.substring(start, end);

    const replacement = prefix + (selection || "text") + suffix;
    const newVal = currentVal.substring(0, start) + replacement + currentVal.substring(end);

    setFormData(prev => ({ ...prev, content: newVal }));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selection || "text").length);
    }, 50);
  };

  const parseMarkdown = (text: string) => {
    if (!text) return <p className="text-muted-foreground text-sm italic">Write content to see the live rendering here...</p>;
    const lines = text.split("\n");
    let inList = false;
    const elements: React.ReactNode[] = [];

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("# ")) {
        if (inList) inList = false;
        elements.push(
          <h1 key={idx} className="text-2xl font-black mt-6 mb-3 text-slate-900 dark:text-white border-b pb-1.5 border-slate-100 dark:border-slate-800">
            {trimmed.slice(2)}
          </h1>
        );
        return;
      }

      if (trimmed.startsWith("## ")) {
        if (inList) inList = false;
        elements.push(
          <h2 key={idx} className="text-xl font-bold mt-5 mb-2.5 text-slate-800 dark:text-slate-200">
            {trimmed.slice(3)}
          </h2>
        );
        return;
      }

      if (trimmed.startsWith("### ")) {
        if (inList) inList = false;
        elements.push(
          <h3 key={idx} className="text-lg font-bold mt-4 mb-2 text-slate-700 dark:text-slate-350">
            {trimmed.slice(4)}
          </h3>
        );
        return;
      }

      if (trimmed.startsWith("> ")) {
        if (inList) inList = false;
        elements.push(
          <blockquote key={idx} className="border-l-4 border-primary bg-slate-50 dark:bg-slate-900/40 px-4 py-3 my-4 italic text-slate-700 dark:text-slate-300 rounded-r-xl leading-relaxed">
            {trimmed.slice(2)}
          </blockquote>
        );
        return;
      }

      if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
        inList = true;
        elements.push(
          <li key={idx} className="list-disc ml-6 my-1.5 text-sm text-slate-600 dark:text-slate-400">
            {parseInlineMarkdown(trimmed.slice(2))}
          </li>
        );
        return;
      }

      if (trimmed === "") {
        if (inList) inList = false;
        elements.push(<div key={idx} className="h-3" />);
        return;
      }

      if (inList) inList = false;
      elements.push(
        <p key={idx} className="my-2.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {parseInlineMarkdown(trimmed)}
        </p>
      );
    });

    return elements;
  };

  const parseInlineMarkdown = (text: string): React.ReactNode => {
    if (text.includes("**") || text.includes("`")) {
      const boldParts = text.split("**");
      return boldParts.map((part, i) => {
        if (i % 2 === 1) {
          return <strong key={i} className="font-extrabold text-slate-900 dark:text-white">{part}</strong>;
        }
        if (part.includes("`")) {
          const codeParts = part.split("`");
          return codeParts.map((subPart, j) => {
            if (j % 2 === 1) {
              return <code key={j} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono text-primary font-bold">{subPart}</code>;
            }
            return subPart;
          });
        }
        return part;
      });
    }
    return text;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.slug || !formData.content) {
      toast.error("Please fill in all required fields.");
      return;
    }

    try {
      setFormLoading(true);
      if (editingBlog) {
        await adminService.updateBlog(editingBlog.id, formData);
        toast.success("Blog article updated successfully!");
      } else {
        await adminService.createBlog(formData);
        toast.success("Blog article created successfully!");
      }
      setDialogOpen(false);
      loadBlogs();
    } catch (err: any) {
      toast.error(err.message || "Failed to save blog post");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    showConfirm(
      "Delete Marketing Article",
      "Are you sure you want to delete this article? This action is permanent and cannot be undone.",
      async () => {
        try {
          await adminService.deleteBlog(id);
          toast.success("Blog article deleted successfully.");
          setBlogs(prev => prev.filter(b => b.id !== id));
        } catch (err: any) {
          toast.error(err.message || "Failed to delete blog post");
        }
      }
    );
  };

  const handleTogglePublish = (blog: AdminBlogDto) => {
    const newStatus = blog.status === "Published" ? "Draft" : "Published";
    const actionText = newStatus === "Published" ? "publish" : "revert to draft";

    showConfirm(
      `${newStatus === "Published" ? "Publish" : "Revert to Draft"} Article`,
      `Are you sure you want to ${actionText} "${blog.title}"? This will update its public listing visibility.`,
      async () => {
        try {
          setFormLoading(true);
          await adminService.updateBlog(blog.id, {
            title: blog.title,
            slug: blog.slug,
            content: blog.content,
            summary: blog.summary,
            author: blog.author,
            category: blog.category,
            status: newStatus,
            bannerUrl: blog.bannerUrl
          });
          toast.success(`Article successfully ${newStatus === "Published" ? "published" : "moved to drafts"}!`);
          loadBlogs();
        } catch (err: any) {
          toast.error(err.message || "Failed to update article status");
        } finally {
          setFormLoading(false);
        }
      }
    );
  };

  // Filter blogs
  const filteredBlogs = blogs.filter(b => 
    b.title.toLowerCase().includes(search.toLowerCase()) ||
    b.author.toLowerCase().includes(search.toLowerCase()) ||
    b.category.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading blog articles...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 text-destructive p-8 text-center max-w-xl mx-auto rounded-3xl">
        <IconCircleX className="h-12 w-12 mx-auto mb-4" />
        <CardTitle className="text-lg font-bold">Error Accessing Blogs</CardTitle>
        <p className="text-sm mt-2 opacity-90 leading-relaxed">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Blog Content Manager</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Write, schedule, and edit marketing blog posts published on the public landing page.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="rounded-full shadow-md">
          <IconPlus className="h-4.5 w-4.5 mr-1" />
          Write Article
        </Button>
      </div>

      {/* Main Card Table */}
      <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30 dark:bg-slate-900">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search title, author, category..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>
          <div className="text-xs text-muted-foreground font-semibold">
            Showing {filteredBlogs.length} of {blogs.length} articles
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead className="pl-6 py-4 font-bold text-xs uppercase tracking-wider">Article Title</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Category</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Author</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Created Date</TableHead>
                <TableHead className="pr-6 py-4 font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBlogs.length > 0 ? (
                filteredBlogs.map((b) => (
                  <TableRow key={b.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="pl-6 py-4 max-w-md">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                          <IconNotebook className="h-5 w-5" />
                        </div>
                        <div className="truncate">
                          <span className="block font-bold text-sm text-slate-800 dark:text-slate-200 truncate">
                            {b.title}
                          </span>
                          <span className="block text-[10px] font-mono text-muted-foreground truncate">
                            /{b.slug}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-xs font-semibold">
                      <Badge variant="secondary" className="rounded-md">{b.category}</Badge>
                    </td>
                    <td className="py-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                      {b.author || "Anonymous"}
                    </td>
                    <td className="py-4">
                      {b.status === "Published" ? (
                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
                          <IconCircleCheck className="h-3.5 w-3.5" />
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-500 border-slate-200 bg-slate-50/50 dark:bg-slate-950/20 dark:border-slate-800 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
                          <IconAlertCircle className="h-3.5 w-3.5" />
                          Draft
                        </Badge>
                      )}
                    </td>
                    <td className="py-4 text-xs text-muted-foreground font-semibold">
                      {new Date(b.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                      })}
                    </td>
                    <td className="pr-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {b.status === "Published" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleTogglePublish(b)}
                            className="h-8 w-8 rounded-xl text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                            title="Revert to Draft"
                          >
                            <IconEyeOff className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleTogglePublish(b)}
                            className="h-8 w-8 rounded-xl text-green-600 hover:text-green-800 hover:bg-green-50"
                            title="Publish Article"
                          >
                            <IconSend className="h-4 w-4" />
                          </Button>
                        )}
                        {b.status === "Published" && (
                          <Link
                            href={`/blogs/${b.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-xl text-blue-500 hover:text-blue-700 hover:bg-blue-55 transition-colors"
                            title="View Live Article"
                          >
                            <IconExternalLink className="h-4 w-4" />
                          </Link>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(b)}
                          className="h-8 w-8 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                        >
                          <IconEdit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(b.id)}
                          className="h-8 w-8 rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <IconTrash className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-sm">
                    No articles found. Add your first marketing post!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Write / Edit Blog Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-full sm:max-w-5xl max-h-[90vh] flex flex-col rounded-3xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <DialogTitle>{editingBlog ? "Edit Article Details" : "Create New Marketing Article"}</DialogTitle>
            <DialogDescription>
              Draft or publish markdown articles that appear on the Clinic EZ landing page.
            </DialogDescription>
          </DialogHeader>

          {/* Write vs Preview Tab Switcher */}
          <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 py-3 gap-2 shrink-0 bg-slate-50/20 dark:bg-slate-900/10">
            <button
              type="button"
              onClick={() => setActiveTab("write")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "write"
                  ? "bg-primary/10 text-primary"
                  : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850"
              }`}
            >
              <IconPencil className="h-4 w-4" />
              Write Article
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "preview"
                  ? "bg-primary/10 text-primary"
                  : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850"
              }`}
            >
              <IconEye className="h-4 w-4" />
              Live Preview
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            {activeTab === "write" ? (
              /* Scrollable Write Container */
              <div className="flex-1 overflow-y-auto p-6 space-y-5 min-h-0">
                <div className="grid grid-cols-2 gap-4">
                  {/* Title */}
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Article Title *</label>
                    <Input
                      required
                      placeholder="Enter a descriptive title..."
                      value={formData.title}
                      onChange={e => handleTitleChange(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>

                  {/* Slug */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Slug Path *</label>
                    <Input
                      required
                      placeholder="e.g. dynamic-clinics-setup"
                      value={formData.slug}
                      onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                      className="rounded-xl font-mono text-xs"
                    />
                  </div>

                  {/* Author */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Author Name</label>
                    <Input
                      placeholder="e.g. Wave Ambray"
                      value={formData.author}
                      onChange={e => setFormData(prev => ({ ...prev, author: e.target.value }))}
                      className="rounded-xl"
                    />
                  </div>

                  {/* Category */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Category</label>
                    <select
                      value={formData.category}
                      onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="General">General</option>
                      <option value="Product Updates">Product Updates</option>
                      <option value="Guides">Guides</option>
                      <option value="Health Tech">Health Tech</option>
                    </select>
                  </div>

                  {/* Status (Only editable during update) */}
                  {editingBlog ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                      <select
                        value={formData.status}
                        onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as "Draft" | "Published" }))}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="Draft">Draft</option>
                        <option value="Published">Published</option>
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                      <Input
                        disabled
                        value="Draft (Forced on Creation)"
                        className="rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-500"
                      />
                    </div>
                  )}

                  {/* Banner URL */}
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Banner Image URL</label>
                    <Input
                      placeholder="e.g. https://images.unsplash.com/photo-..."
                      value={formData.bannerUrl}
                      onChange={e => setFormData(prev => ({ ...prev, bannerUrl: e.target.value }))}
                      className="rounded-xl font-mono text-xs"
                    />
                  </div>

                  {/* Summary */}
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Short Summary</label>
                    <Textarea
                      placeholder="Write a brief intro/summary of the post..."
                      value={formData.summary}
                      onChange={e => setFormData(prev => ({ ...prev, summary: e.target.value }))}
                      className="rounded-xl min-h-16"
                    />
                  </div>

                  {/* Content with Writing helper toolbar */}
                  <div className="col-span-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Article Content *</label>
                      <span className="text-[10px] text-muted-foreground font-bold font-mono">Markdown Enabled</span>
                    </div>
                    
                    {/* Markdown Writing Helper Toolbar */}
                    <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-t-xl border border-input border-b-0 bg-slate-50/50 dark:bg-slate-900/50">
                      <button
                        type="button"
                        title="Heading 1"
                        onClick={() => insertMarkdown("# ", "")}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      >
                        <IconHeading className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        title="Heading 2"
                        onClick={() => insertMarkdown("## ", "")}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold"
                      >
                        H2
                      </button>
                      <button
                        type="button"
                        title="Bold"
                        onClick={() => insertMarkdown("**", "**")}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      >
                        <IconBold className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        title="Italic"
                        onClick={() => insertMarkdown("*", "*")}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      >
                        <IconItalic className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        title="Blockquote"
                        onClick={() => insertMarkdown("> ", "")}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      >
                        <IconQuote className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        title="List"
                        onClick={() => insertMarkdown("- ", "")}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      >
                        <IconList className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        title="Code Block"
                        onClick={() => insertMarkdown("`", "`")}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      >
                        <IconCode className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        title="Insert Link"
                        onClick={() => insertMarkdown("[", "](url)")}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      >
                        <IconLink className="h-4.5 w-4.5" />
                      </button>
                    </div>

                    <Textarea
                      ref={textareaRef}
                      required
                      placeholder="Write the full post markdown here..."
                      value={formData.content}
                      onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
                      className="rounded-t-none rounded-b-xl min-h-48 font-mono text-sm border-t-0"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Scrollable Preview Container */
              <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
                {/* Mock Banner */}
                <div className="w-full h-40 rounded-2xl relative overflow-hidden bg-slate-900 shrink-0">
                  {formData.bannerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img 
                      src={formData.bannerUrl} 
                      alt="Banner Preview" 
                      className="w-full h-full object-cover opacity-75"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-primary to-violet-500 opacity-60 flex items-center justify-center">
                      <span className="text-white text-xs font-bold font-mono">No Banner Selected</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-white mb-2">
                      {formData.category}
                    </span>
                    <h2 className="text-lg font-bold text-white">{formData.title || "Untitled Article"}</h2>
                  </div>
                </div>

                {/* Mock Metadata */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
                  <span>Author: <strong>{formData.author || "Unknown"}</strong></span>
                  <span>Status: <strong className="text-primary">{formData.status}</strong></span>
                  <span>Views: <strong>0 views (new)</strong></span>
                </div>

                {/* Mock Rendered Content */}
                <div className="p-6 border border-slate-200/60 dark:border-slate-850 bg-white dark:bg-slate-950 rounded-2xl prose dark:prose-invert">
                  {parseMarkdown(formData.content)}
                </div>
              </div>
            )}

            {/* Fixed Action Footer */}
            <DialogFooter className="p-6 border-t border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-end gap-2 bg-slate-50/40 dark:bg-slate-900/10">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="rounded-full">
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || formLoading} className="rounded-full shadow-md">
                {formLoading ? "Saving..." : editingBlog ? "Update Article" : "Create Article"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Custom Confirmation Alert Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight">{confirmDialog.title}</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 leading-relaxed pt-2">
              {confirmDialog.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                confirmDialog.onConfirm();
                setConfirmDialog(prev => ({ ...prev, open: false }));
              }}
              className="rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/95"
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
