"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/transport/apiClient";
import {
  IconCalendar,
  IconUser,
  IconEye,
  IconShare,
  IconBrandFacebook,
  IconBrandTwitter,
  IconLink,
  IconLoader,
  IconArrowRight,
} from "@tabler/icons-react";
import { toast } from "sonner";

export interface BlogArticleSummary {
  id: string;
  title: string;
  slug: string;
  summary: string;
  author: string;
  category: string;
  createdAt: string;
  publishedAt?: string;
  bannerUrl?: string;
  views: number;
}

export function BlogsClient({ initialBlogs }: { initialBlogs: BlogArticleSummary[] }) {
  const [blogs, setBlogs] = useState<BlogArticleSummary[]>(initialBlogs);
  const [loading, setLoading] = useState(initialBlogs.length === 0);

  useEffect(() => {
    let isMounted = true;
    const fetchBlogs = async () => {
      try {
        const res = await apiClient.get<BlogArticleSummary[]>("/blogs");
        if (isMounted && Array.isArray(res.data)) {
          setBlogs(res.data);
        }
      } catch {
        // Keep initial ISR data or empty state when portal-api is unreachable
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchBlogs();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopyLink = (slug: string) => {
    const url = `${window.location.origin}/blogs/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Blog link copied to clipboard!");
  };

  if (loading && blogs.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading insights &amp; updates...</p>
        </div>
      </div>
    );
  }

  const featuredBlog = blogs[0];
  const otherBlogs = blogs.slice(1);
  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 text-foreground transition-colors duration-300 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-10%] left-[20%] w-[60%] h-[35%] rounded-full bg-primary/5 blur-[130px] pointer-events-none -z-10" />

      {/* Hero section */}
      <section className="pt-32 pb-16 px-6 lg:px-8 text-center max-w-3xl mx-auto">
        <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary mb-4">
          Clinic EZ Insights
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6 bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
          Insights &amp; Updates
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Discover clinical workflows, advanced health technology updates, and best practices directly from the Clinic EZ team.
        </p>
      </section>

      {/* Main Grid */}
      <section className="py-8 px-6 lg:px-8 max-w-7xl mx-auto w-full mb-24 space-y-16">
        {/* Featured Post */}
        {featuredBlog ? (
          <div className="group relative overflow-hidden rounded-3xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs transition-all hover:shadow-xl hover:shadow-primary/5 flex flex-col lg:flex-row">
            {/* Banner Image */}
            <div className="lg:w-3/5 h-64 lg:h-auto min-h-[300px] relative overflow-hidden bg-slate-100 dark:bg-slate-800">
              {featuredBlog.bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featuredBlog.bannerUrl}
                  alt={featuredBlog.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-primary/10 to-violet-500/10 flex items-center justify-center">
                  <span className="text-muted-foreground font-semibold">Clinic EZ Blog</span>
                </div>
              )}
            </div>

            {/* Metadata and Content */}
            <div className="lg:w-2/5 p-8 lg:p-12 flex flex-col justify-center relative">
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {featuredBlog.category}
                </span>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold">
                  <IconEye className="h-4 w-4" />
                  {featuredBlog.views} views
                </div>
              </div>

              <h2 className="text-2xl lg:text-3xl font-black mb-4 group-hover:text-primary transition-colors leading-tight">
                <Link href={`/blogs/${featuredBlog.slug}`}>{featuredBlog.title}</Link>
              </h2>

              <p className="text-muted-foreground text-sm lg:text-base mb-6 leading-relaxed line-clamp-3">
                {featuredBlog.summary}
              </p>

              {/* Author & Actions bar */}
              <div className="mt-auto pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <IconUser className="h-4 w-4" />
                    <span className="font-bold">{featuredBlog.author}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <IconCalendar className="h-4 w-4" />
                    <span>
                      {new Date(featuredBlog.publishedAt || featuredBlog.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {/* Social Share Controls */}
                <div className="flex items-center gap-2">
                  <a
                    href={`https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${siteOrigin}/blogs/${featuredBlog.slug}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Share on Facebook"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 transition-colors"
                  >
                    <IconBrandFacebook className="h-4 w-4" />
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(`${siteOrigin}/blogs/${featuredBlog.slug}`)}&text=${encodeURIComponent(featuredBlog.title)}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Share on Twitter"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-sky-500 transition-colors"
                  >
                    <IconBrandTwitter className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    aria-label="Copy blog link"
                    onClick={() => handleCopyLink(featuredBlog.slug)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-emerald-600 transition-colors"
                  >
                    <IconLink className="h-4 w-4" />
                  </button>
                  <Link
                    href={`/blogs/${featuredBlog.slug}`}
                    className="ml-2 inline-flex items-center text-xs font-bold text-primary hover:opacity-85"
                  >
                    Read
                    <IconArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No articles found. Check back later!
          </div>
        )}

        {/* Grid of Other Blogs */}
        {otherBlogs.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {otherBlogs.map((blog) => (
              <div
                key={blog.id}
                className="group flex flex-col rounded-3xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs transition-all hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1"
              >
                {/* Banner */}
                <div className="h-48 w-full relative overflow-hidden bg-slate-100 dark:bg-slate-800">
                  {blog.bannerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={blog.bannerUrl}
                      alt={blog.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-primary/10 to-violet-500/10 flex items-center justify-center" />
                  )}
                  <span className="absolute top-4 left-4 inline-flex items-center rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs px-2.5 py-0.5 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-sm">
                    {blog.category}
                  </span>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col flex-grow">
                  <h3 className="text-lg font-bold mb-3 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                    <Link href={`/blogs/${blog.slug}`}>{blog.title}</Link>
                  </h3>

                  <p className="text-muted-foreground text-xs leading-relaxed mb-6 line-clamp-3">
                    {blog.summary}
                  </p>

                  {/* Footer metadata */}
                  <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
                    <span>{blog.author}</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <IconEye className="h-3.5 w-3.5" />
                        {blog.views}
                      </div>
                      <button
                        type="button"
                        aria-label="Share blog link"
                        onClick={() => handleCopyLink(blog.slug)}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary transition-colors"
                      >
                        <IconShare className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
