"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/transport/apiClient";
import { 
  IconCalendar, 
  IconUser, 
  IconEye, 
  IconArrowLeft,
  IconBrandFacebook, 
  IconBrandTwitter, 
  IconBrandLinkedin, 
  IconLink,
  IconLoader
} from "@tabler/icons-react";
import { toast } from "sonner";

interface BlogArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  summary: string;
  author: string;
  category: string;
  createdAt: string;
  publishedAt?: string;
  bannerUrl?: string;
  views: number;
}

export default function BlogDetailPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params?.slug as string;

  const [blog, setBlog] = useState<BlogArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    const fetchBlogDetails = async () => {
      try {
        const res = await apiClient.get<BlogArticle>(`/blogs/${slug}`);
        setBlog(res.data);
      } catch (err: any) {
        console.error("Failed to load blog post", err);
        setError("We couldn't find the article you were looking for.");
      } finally {
        setLoading(false);
      }
    };

    fetchBlogDetails();
  }, [slug]);

  const handleCopyLink = () => {
    if (!blog) return;
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("Article link copied to clipboard!");
  };

  // Simple Markdown Parser to render Rich Formatted Text
  const parseMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    let inList = false;
    const elements: React.ReactNode[] = [];

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // Heading 1
      if (trimmed.startsWith("# ")) {
        if (inList) { inList = false; }
        elements.push(
          <h1 key={idx} className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-8 mb-4 bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-350 bg-clip-text text-transparent">
            {trimmed.slice(2)}
          </h1>
        );
        return;
      }

      // Heading 2
      if (trimmed.startsWith("## ")) {
        if (inList) { inList = false; }
        elements.push(
          <h2 key={idx} className="text-xl sm:text-2xl font-bold tracking-tight mt-8 mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
            {trimmed.slice(3)}
          </h2>
        );
        return;
      }

      // Heading 3
      if (trimmed.startsWith("### ")) {
        if (inList) { inList = false; }
        elements.push(
          <h3 key={idx} className="text-lg sm:text-xl font-bold tracking-tight mt-6 mb-3">
            {trimmed.slice(4)}
          </h3>
        );
        return;
      }

      // Blockquotes
      if (trimmed.startsWith("> ")) {
        if (inList) { inList = false; }
        elements.push(
          <blockquote key={idx} className="border-l-4 border-primary bg-slate-50 dark:bg-slate-900/40 px-6 py-4 my-6 italic text-slate-700 dark:text-slate-300 rounded-r-2xl leading-relaxed">
            {trimmed.slice(2).replace(/\"/g, '"')}
          </blockquote>
        );
        return;
      }

      // Lists
      if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
        inList = true;
        elements.push(
          <li key={idx} className="list-disc ml-6 my-2 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed pl-1">
            {parseInlineMarkdown(trimmed.slice(2))}
          </li>
        );
        return;
      }

      // Empty Lines
      if (trimmed === "") {
        if (inList) { inList = false; }
        elements.push(<div key={idx} className="h-4" />);
        return;
      }

      // Paragraphs
      if (inList) { inList = false; }
      elements.push(
        <p key={idx} className="my-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
          {parseInlineMarkdown(trimmed)}
        </p>
      );
    });

    return elements;
  };

  // Basic parser for inline styles like **bold** and `code`
  const parseInlineMarkdown = (text: string): React.ReactNode => {
    // Regex for bold text (**bold**)
    const boldRegex = /\*\*(.*?)\*\*/g;
    // Regex for inline code (`code`)
    const codeRegex = /`(.*?)`/g;

    let parts: React.ReactNode[] = [text];

    // Split and parse inline bold elements
    let match;
    const tempParts: React.ReactNode[] = [];
    
    // Very simple inline parser:
    // Check if contains bold
    if (text.includes("**") || text.includes("`")) {
      // Let's render custom text with bold/code formats
      const boldParts = text.split("**");
      return boldParts.map((part, i) => {
        if (i % 2 === 1) {
          // Check inline code inside bold
          return <strong key={i} className="font-extrabold text-slate-900 dark:text-white">{part}</strong>;
        }
        // Check inline code inside normal text
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading article details...</p>
        </div>
      </div>
    );
  }

  if (error || !blog) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
        <div className="max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-xl space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
            <IconLoader className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">Article Not Found</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {error || "The blog post may have been drafted or removed."}
            </p>
          </div>
          <Link 
            href="/blogs"
            className="inline-flex items-center text-sm font-bold text-primary hover:opacity-85 pt-2"
          >
            <IconArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Insights
          </Link>
        </div>
      </div>
    );
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-foreground pb-24 transition-colors duration-300">
      
      {/* Article Header Banner */}
      <div className="w-full h-[40vh] sm:h-[50vh] relative bg-slate-900 overflow-hidden">
        {blog.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img 
            src={blog.bannerUrl} 
            alt={blog.title}
            className="w-full h-full object-cover opacity-80"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-primary to-violet-600 opacity-60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
        
        {/* Banner Content (Bottom aligned overlay) */}
        <div className="absolute bottom-0 left-0 w-full p-6 sm:p-12 max-w-5xl mx-auto right-0 flex flex-col justify-end">
          <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-bold text-white mb-4 w-fit shadow-md">
            {blog.category}
          </span>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight max-w-4xl drop-shadow-sm">
            {blog.title}
          </h1>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-4xl mx-auto px-6 sm:px-8 mt-12 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Side: Metadata & Social Share (Sticky) */}
        <aside className="lg:col-span-1 space-y-8 lg:sticky lg:top-24 h-fit">
          
          {/* Back button */}
          <Link 
            href="/blogs"
            className="inline-flex items-center text-xs font-bold text-slate-500 hover:text-primary transition-colors uppercase tracking-wider"
          >
            <IconArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Insights
          </Link>

          {/* Post Information */}
          <div className="space-y-4 rounded-3xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
            <div className="space-y-3">
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground font-extrabold">Author</span>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs">
                  {blog.author.split(" ").map(n => n[0]).join("")}
                </div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{blog.author}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground font-extrabold">Published</span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                {new Date(blog.publishedAt || blog.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric"
                })}
              </span>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold">
                <IconEye className="h-4 w-4" />
                <span>{blog.views} views</span>
              </div>
            </div>
          </div>

          {/* Social share shortcuts */}
          <div className="space-y-3 p-2">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground font-extrabold text-center lg:text-left">Share Article</span>
            <div className="flex items-center justify-center lg:justify-start gap-2.5">
              <a 
                href={`https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 transition-colors shadow-xs"
                title="Share on Facebook"
              >
                <IconBrandFacebook className="h-4.5 w-4.5" />
              </a>
              <a 
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(blog.title)}`}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-sky-500 transition-colors shadow-xs"
                title="Share on Twitter"
              >
                <IconBrandTwitter className="h-4.5 w-4.5" />
              </a>
              <a 
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-700 transition-colors shadow-xs"
                title="Share on LinkedIn"
              >
                <IconBrandLinkedin className="h-4.5 w-4.5" />
              </a>
              <button 
                onClick={handleCopyLink}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-emerald-600 transition-colors shadow-xs"
                title="Copy Link"
              >
                <IconLink className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

        </aside>

        {/* Right Side: Article Body Content */}
        <article className="lg:col-span-3 prose prose-slate dark:prose-invert max-w-none">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 p-8 sm:p-12 shadow-xs min-h-[400px]">
            {parseMarkdown(blog.content)}
          </div>
        </article>

      </div>
    </main>
  );
}
