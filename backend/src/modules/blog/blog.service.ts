import { prisma } from "../../database/prisma";
import { ModerationStatus, NotificationType } from "@prisma/client";
import { sendTelegramNotification } from "../telegram/bot";

export const BLOG_CATEGORIES = [
  "Programming",
  "Software Engineering",
  "Technology",
  "Project Ideas",
  "Academic Discussion",
  "Career Development",
  "Student Experiences",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export interface CreatePostInput {
  title: string;
  content: string;
  category: string;
  tags?: string;
  coverImage?: string;
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string;
  coverImage?: string;
}

export class BlogService {
  /**
   * Helper: Check if user has global ADMIN role.
   */
  static async isGlobalAdmin(userId: string): Promise<boolean> {
    const adminRole = await prisma.userGlobalRole.findFirst({
      where: { userId, role: "ADMIN" },
    });
    return !!adminRole;
  }

  /**
   * Helper: Generate URL-safe slug from title with deduplication.
   */
  static async generateUniqueSlug(title: string): Promise<string> {
    const baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "article";

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await prisma.blogPost.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!existing) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  // ==========================================
  // 1. POST CRUD & DISCOVERY
  // ==========================================

  /**
   * Create a new blog post.
   */
  static async createPost(authorId: string, data: CreatePostInput) {
    if (!data.title || data.title.trim().length < 3) {
      throw new Error("INVALID_INPUT: Title must be at least 3 characters long.");
    }
    if (!data.content || data.content.trim().length < 10) {
      throw new Error("INVALID_INPUT: Content must be at least 10 characters long.");
    }
    if (!data.category || !data.category.trim()) {
      throw new Error("INVALID_INPUT: Category is required.");
    }

    const isAdmin = await this.isGlobalAdmin(authorId);
    const slug = await this.generateUniqueSlug(data.title);

    // Admins are auto-approved; students require moderation
    const status = isAdmin ? ModerationStatus.APPROVED : ModerationStatus.PENDING;

    const post = await prisma.blogPost.create({
      data: {
        title: data.title.trim(),
        slug,
        content: data.content.trim(),
        category: data.category.trim(),
        tags: data.tags ? data.tags.trim() : null,
        coverImage: data.coverImage ? data.coverImage.trim() : null,
        authorId,
        status,
        moderatedById: isAdmin ? authorId : null,
        moderatedAt: isAdmin ? new Date() : null,
      },
      include: {
        author: {
          select: { id: true, fullName: true, campusId: true },
        },
      },
    });

    return post;
  }

  /**
   * List blog posts with rich filtering, search, and sorting.
   */
  static async listPosts(
    userId: string,
    filters: {
      category?: string;
      tag?: string;
      search?: string;
      authorId?: string;
      myPosts?: boolean;
      status?: ModerationStatus;
      sort?: "recent" | "popular";
      limit?: number;
      offset?: number;
    }
  ) {
    const isAdmin = await this.isGlobalAdmin(userId);
    const where: any = { isDeleted: false };

    if (filters.myPosts) {
      where.authorId = userId;
      if (filters.status) {
        where.status = filters.status;
      }
    } else if (isAdmin) {
      if (filters.status) where.status = filters.status;
      if (filters.authorId) where.authorId = filters.authorId;
    } else {
      // Ordinary students only see APPROVED posts
      where.status = ModerationStatus.APPROVED;
      if (filters.authorId) where.authorId = filters.authorId;
    }

    if (filters.category) {
      where.category = { equals: filters.category.trim(), mode: "insensitive" };
    }

    if (filters.tag) {
      where.tags = { contains: filters.tag.trim(), mode: "insensitive" };
    }

    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
        { tags: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ];
    }

    let orderBy: any = { createdAt: "desc" };
    if (filters.sort === "popular") {
      orderBy = { views: "desc" };
    }

    const take = Math.min(filters.limit || 50, 100);
    const skip = filters.offset || 0;

    const [posts, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        orderBy,
        take,
        skip,
        include: {
          author: { select: { id: true, fullName: true, campusId: true } },
          _count: {
            select: {
              likes: true,
              comments: { where: { isDeleted: false } },
            },
          },
          likes: {
            where: { userId },
            select: { id: true },
          },
          bookmarks: {
            where: { userId },
            select: { id: true },
          },
        },
      }),
      prisma.blogPost.count({ where }),
    ]);

    return {
      total,
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        content: p.content.slice(0, 300) + (p.content.length > 300 ? "..." : ""),
        coverImage: p.coverImage,
        category: p.category,
        tags: p.tags ? p.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        author: p.author,
        status: p.status,
        views: p.views,
        likesCount: p._count.likes,
        commentsCount: p._count.comments,
        isLiked: p.likes.length > 0,
        isBookmarked: p.bookmarks.length > 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    };
  }

  /**
   * Get single blog post by slug or ID with view increment.
   */
  static async getPostBySlugOrId(slugOrId: string, userId: string) {
    const post = await prisma.blogPost.findFirst({
      where: {
        OR: [{ slug: slugOrId }, { id: slugOrId }],
        isDeleted: false,
      },
      include: {
        author: { select: { id: true, fullName: true, campusId: true } },
        comments: {
          where: { isDeleted: false },
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, fullName: true, campusId: true } },
          },
        },
        _count: {
          select: {
            likes: true,
            comments: { where: { isDeleted: false } },
          },
        },
        likes: {
          where: { userId },
          select: { id: true },
        },
        bookmarks: {
          where: { userId },
          select: { id: true },
        },
      },
    });

    if (!post) throw new Error("POST_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isAuthor = post.authorId === userId;

    if (post.status !== ModerationStatus.APPROVED && !isAdmin && !isAuthor) {
      throw new Error("FORBIDDEN: This post is pending moderation or unapproved.");
    }

    // Atomic increment of views
    await prisma.blogPost.update({
      where: { id: post.id },
      data: { views: { increment: 1 } },
    });

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      content: post.content,
      coverImage: post.coverImage,
      category: post.category,
      tags: post.tags ? post.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      author: post.author,
      status: post.status,
      moderationNote: post.moderationNote,
      views: post.views + 1,
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      isLiked: post.likes.length > 0,
      isBookmarked: post.bookmarks.length > 0,
      comments: post.comments.map((c) => ({
        id: c.id,
        content: c.content,
        user: c.user,
        createdAt: c.createdAt,
      })),
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }

  /**
   * Update blog post (author or admin only).
   */
  static async updatePost(userId: string, postId: string, data: UpdatePostInput) {
    const post = await prisma.blogPost.findUnique({
      where: { id: postId },
    });

    if (!post || post.isDeleted) throw new Error("POST_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isAuthor = post.authorId === userId;

    if (!isAdmin && !isAuthor) {
      throw new Error("FORBIDDEN: Only the author or an administrator can update this post.");
    }

    return prisma.blogPost.update({
      where: { id: postId },
      data: {
        title: data.title !== undefined ? data.title.trim() : post.title,
        content: data.content !== undefined ? data.content.trim() : post.content,
        category: data.category !== undefined ? data.category.trim() : post.category,
        tags: data.tags !== undefined ? data.tags.trim() : post.tags,
        coverImage: data.coverImage !== undefined ? data.coverImage.trim() : post.coverImage,
      },
      include: {
        author: { select: { id: true, fullName: true, campusId: true } },
      },
    });
  }

  /**
   * Soft delete blog post (author or admin only).
   */
  static async deletePost(userId: string, postId: string) {
    const post = await prisma.blogPost.findUnique({
      where: { id: postId },
    });

    if (!post || post.isDeleted) throw new Error("POST_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isAuthor = post.authorId === userId;

    if (!isAdmin && !isAuthor) {
      throw new Error("FORBIDDEN: Only the author or an administrator can delete this post.");
    }

    await prisma.blogPost.update({
      where: { id: postId },
      data: { isDeleted: true },
    });

    return { success: true };
  }

  // ==========================================
  // 2. INTERACTIONS: LIKES, BOOKMARKS, COMMENTS
  // ==========================================

  /**
   * Toggle like on a blog post.
   */
  static async toggleLike(userId: string, postId: string) {
    const post = await prisma.blogPost.findUnique({
      where: { id: postId },
    });
    if (!post || post.isDeleted) throw new Error("POST_NOT_FOUND");

    const existing = await prisma.blogLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await prisma.blogLike.delete({
        where: { id: existing.id },
      });
      const likesCount = await prisma.blogLike.count({ where: { postId } });
      return { liked: false, likesCount };
    } else {
      await prisma.blogLike.create({
        data: { postId, userId },
      });
      const likesCount = await prisma.blogLike.count({ where: { postId } });
      return { liked: true, likesCount };
    }
  }

  /**
   * Toggle bookmark on a blog post.
   */
  static async toggleBookmark(userId: string, postId: string) {
    const post = await prisma.blogPost.findUnique({
      where: { id: postId },
    });
    if (!post || post.isDeleted) throw new Error("POST_NOT_FOUND");

    const existing = await prisma.bookmark.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await prisma.bookmark.delete({
        where: { id: existing.id },
      });
      return { bookmarked: false };
    } else {
      await prisma.bookmark.create({
        data: { postId, userId },
      });
      return { bookmarked: true };
    }
  }

  /**
   * List user's bookmarked posts.
   */
  static async listBookmarks(userId: string) {
    const bookmarks = await prisma.bookmark.findMany({
      where: {
        userId,
        post: { isDeleted: false, status: ModerationStatus.APPROVED },
      },
      orderBy: { createdAt: "desc" },
      include: {
        post: {
          include: {
            author: { select: { id: true, fullName: true, campusId: true } },
            _count: { select: { likes: true, comments: { where: { isDeleted: false } } } },
          },
        },
      },
    });

    return bookmarks.map((b) => ({
      bookmarkId: b.id,
      bookmarkedAt: b.createdAt,
      post: {
        id: b.post.id,
        title: b.post.title,
        slug: b.post.slug,
        category: b.post.category,
        coverImage: b.post.coverImage,
        author: b.post.author,
        views: b.post.views,
        likesCount: b.post._count.likes,
        commentsCount: b.post._count.comments,
        createdAt: b.post.createdAt,
      },
    }));
  }

  /**
   * Add a comment to a blog post and notify author.
   */
  static async addComment(userId: string, postId: string, content: string) {
    if (!content || !content.trim()) {
      throw new Error("INVALID_INPUT: Comment content cannot be empty.");
    }

    const post = await prisma.blogPost.findUnique({
      where: { id: postId },
      include: { author: true },
    });
    if (!post || post.isDeleted) throw new Error("POST_NOT_FOUND");

    const commenter = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, campusId: true },
    });

    const comment = await prisma.blogComment.create({
      data: {
        postId,
        userId,
        content: content.trim(),
      },
      include: {
        user: { select: { id: true, fullName: true, campusId: true } },
      },
    });

    // Notify author if comment was made by someone else
    if (post.authorId !== userId) {
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          type: NotificationType.ANNOUNCEMENT,
          title: `New Comment on "${post.title}"`,
          message: `${commenter?.fullName || "A student"} commented: "${content.trim().slice(0, 60)}..."`,
          link: `/blog/${post.slug}`,
        },
      });

      if (post.author.telegramChatId) {
        await sendTelegramNotification(
          post.author.telegramChatId,
          `💬 *New Comment on your article!*\n*Article:* ${post.title}\n*From:* ${commenter?.fullName} (${commenter?.campusId})\n\n"${content.trim().slice(0, 100)}..."`
        );
      }
    }

    return comment;
  }

  /**
   * Delete comment (comment author, post author, or admin only).
   */
  static async deleteComment(userId: string, commentId: string) {
    const comment = await prisma.blogComment.findUnique({
      where: { id: commentId },
      include: { post: true },
    });

    if (!comment || comment.isDeleted) throw new Error("COMMENT_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isCommentAuthor = comment.userId === userId;
    const isPostAuthor = comment.post.authorId === userId;

    if (!isAdmin && !isCommentAuthor && !isPostAuthor) {
      throw new Error("FORBIDDEN: You do not have permission to delete this comment.");
    }

    await prisma.blogComment.update({
      where: { id: commentId },
      data: { isDeleted: true },
    });

    return { success: true };
  }

  // ==========================================
  // 3. AUTHOR PROFILE & STATS
  // ==========================================

  /**
   * Get author profile with cumulative blog metrics.
   */
  static async getAuthorProfile(authorId: string) {
    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: {
        id: true,
        fullName: true,
        campusId: true,
        email: true,
        createdAt: true,
      },
    });

    if (!author) throw new Error("AUTHOR_NOT_FOUND");

    const posts = await prisma.blogPost.findMany({
      where: {
        authorId,
        isDeleted: false,
        status: ModerationStatus.APPROVED,
      },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            likes: true,
            comments: { where: { isDeleted: false } },
          },
        },
      },
    });

    const totalPosts = posts.length;
    const totalViews = posts.reduce((sum, p) => sum + p.views, 0);
    const totalLikes = posts.reduce((sum, p) => sum + p._count.likes, 0);

    return {
      author,
      stats: {
        totalPosts,
        totalViews,
        totalLikes,
      },
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        category: p.category,
        coverImage: p.coverImage,
        views: p.views,
        likesCount: p._count.likes,
        commentsCount: p._count.comments,
        createdAt: p.createdAt,
      })),
    };
  }

  // ==========================================
  // 4. REPORTING & CONTENT MODERATION
  // ==========================================

  /**
   * Report an inappropriate post.
   */
  static async reportPost(reporterId: string, postId: string, reason: string, details?: string) {
    if (!reason || !reason.trim()) throw new Error("INVALID_INPUT: Reason for report is required.");

    const post = await prisma.blogPost.findUnique({ where: { id: postId } });
    if (!post || post.isDeleted) throw new Error("POST_NOT_FOUND");

    const existing = await prisma.blogReport.findFirst({
      where: { postId, reporterId, status: "PENDING" },
    });
    if (existing) {
      throw new Error("ALREADY_REPORTED: You have already submitted a pending report for this post.");
    }

    return prisma.blogReport.create({
      data: {
        postId,
        reporterId,
        reason: reason.trim(),
        details: details?.trim() || null,
        status: "PENDING",
      },
      include: {
        reporter: { select: { id: true, fullName: true, campusId: true } },
      },
    });
  }

  /**
   * Report an inappropriate comment.
   */
  static async reportComment(reporterId: string, commentId: string, reason: string, details?: string) {
    if (!reason || !reason.trim()) throw new Error("INVALID_INPUT: Reason for report is required.");

    const comment = await prisma.blogComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.isDeleted) throw new Error("COMMENT_NOT_FOUND");

    const existing = await prisma.blogReport.findFirst({
      where: { commentId, reporterId, status: "PENDING" },
    });
    if (existing) {
      throw new Error("ALREADY_REPORTED: You have already submitted a pending report for this comment.");
    }

    return prisma.blogReport.create({
      data: {
        commentId,
        reporterId,
        reason: reason.trim(),
        details: details?.trim() || null,
        status: "PENDING",
      },
      include: {
        reporter: { select: { id: true, fullName: true, campusId: true } },
      },
    });
  }

  /**
   * List reports for administrator review.
   */
  static async listReports(adminId: string, status?: string) {
    const isAdmin = await this.isGlobalAdmin(adminId);
    if (!isAdmin) throw new Error("FORBIDDEN: Only administrators can view content reports.");

    const where: any = {};
    if (status) where.status = status;

    return prisma.blogReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        reporter: { select: { id: true, fullName: true, campusId: true } },
        post: {
          select: {
            id: true,
            title: true,
            slug: true,
            author: { select: { id: true, fullName: true, campusId: true } },
          },
        },
        comment: {
          select: {
            id: true,
            content: true,
            user: { select: { id: true, fullName: true, campusId: true } },
          },
        },
      },
    });
  }

  /**
   * Resolve or dismiss a content report.
   */
  static async resolveReport(adminId: string, reportId: string, action: "RESOLVED" | "DISMISSED") {
    const isAdmin = await this.isGlobalAdmin(adminId);
    if (!isAdmin) throw new Error("FORBIDDEN: Only administrators can resolve reports.");

    const report = await prisma.blogReport.findUnique({ where: { id: reportId } });
    if (!report) throw new Error("REPORT_NOT_FOUND");

    return prisma.blogReport.update({
      where: { id: reportId },
      data: {
        status: action,
        resolvedAt: new Date(),
        resolvedById: adminId,
      },
    });
  }

  /**
   * Moderate blog post: Approve, Reject, or Archive.
   */
  static async moderatePost(
    moderatorId: string,
    postId: string,
    action: "APPROVE" | "REJECT" | "ARCHIVE",
    note?: string
  ) {
    const isAdmin = await this.isGlobalAdmin(moderatorId);
    if (!isAdmin) {
      throw new Error("FORBIDDEN: Only administrators can moderate blog posts.");
    }

    const post = await prisma.blogPost.findUnique({
      where: { id: postId },
      include: { author: true },
    });
    if (!post || post.isDeleted) throw new Error("POST_NOT_FOUND");

    // Self-approval check: Moderator cannot approve their own submission
    if (post.authorId === moderatorId && action === "APPROVE") {
      throw new Error("FORBIDDEN: Authors cannot self-approve their own blog submissions.");
    }

    let targetStatus: ModerationStatus = ModerationStatus.APPROVED;
    if (action === "REJECT") targetStatus = ModerationStatus.REJECTED;
    if (action === "ARCHIVE") targetStatus = ModerationStatus.ARCHIVED;

    const updated = await prisma.blogPost.update({
      where: { id: postId },
      data: {
        status: targetStatus,
        moderatedById: moderatorId,
        moderatedAt: new Date(),
        moderationNote: note?.trim() || null,
      },
      include: {
        author: { select: { id: true, fullName: true, campusId: true } },
      },
    });

    // Notify author of moderation decision
    await prisma.notification.create({
      data: {
        userId: post.authorId,
        type: NotificationType.ANNOUNCEMENT,
        title: `Blog Post ${action === "APPROVE" ? "Approved" : action === "REJECT" ? "Rejected" : "Archived"}: "${post.title}"`,
        message: note
          ? `Moderation Note: ${note.trim()}`
          : `Your post "${post.title}" has been ${targetStatus.toLowerCase()}.`,
        link: `/blog/${post.slug}`,
      },
    });

    if (post.author.telegramChatId) {
      const emoji = action === "APPROVE" ? "✅" : action === "REJECT" ? "❌" : "📦";
      await sendTelegramNotification(
        post.author.telegramChatId,
        `${emoji} *Blog Post Moderated*\n*Article:* ${post.title}\n*Status:* ${targetStatus}\n${note ? `*Note:* ${note}\n` : ""}`
      );
    }

    return updated;
  }
}
