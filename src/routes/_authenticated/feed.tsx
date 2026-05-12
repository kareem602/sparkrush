import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Plus, X, Send, Eye, Trash2, ImagePlus, Film } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { VerificationBadge, type VerificationLevel } from "@/components/verification-badge";

export const Route = createFileRoute("/_authenticated/feed")({
  component: FeedPage,
});

type Profile = {
  id: string;
  display_name: string;
  photo_url: string | null;
  verification_status: VerificationLevel;
};

type Post = {
  id: string;
  author_id: string;
  image_url: string;
  caption: string;
  created_at: string;
  author?: Profile;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
};

type Story = {
  id: string;
  author_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string;
  created_at: string;
  expires_at: string;
};

type StoryGroup = {
  author: Profile;
  stories: Story[];
  hasUnseen: boolean;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function FeedPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [storyComposeOpen, setStoryComposeOpen] = useState(false);
  const [viewerGroupIdx, setViewerGroupIdx] = useState<number | null>(null);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);

  const loadPosts = async () => {
    if (!user) return;
    const { data: rawPosts } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!rawPosts) { setPosts([]); return; }

    const authorIds = Array.from(new Set(rawPosts.map((p) => p.author_id)));
    const postIds = rawPosts.map((p) => p.id);

    const [{ data: authors }, { data: likes }, { data: myLikes }, { data: comments }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, photo_url, verification_status").in("id", authorIds),
      supabase.from("post_likes").select("post_id").in("post_id", postIds),
      supabase.from("post_likes").select("post_id").in("post_id", postIds).eq("user_id", user.id),
      supabase.from("post_comments").select("post_id").in("post_id", postIds),
    ]);

    const authorMap = new Map<string, Profile>(
      (authors ?? []).map((a) => [a.id, a as Profile])
    );
    const likeCounts = new Map<string, number>();
    (likes ?? []).forEach((l) => likeCounts.set(l.post_id, (likeCounts.get(l.post_id) ?? 0) + 1));
    const commentCounts = new Map<string, number>();
    (comments ?? []).forEach((c) => commentCounts.set(c.post_id, (commentCounts.get(c.post_id) ?? 0) + 1));
    const mineSet = new Set((myLikes ?? []).map((l) => l.post_id));

    setPosts(
      rawPosts.map((p) => ({
        ...p,
        author: authorMap.get(p.author_id),
        like_count: likeCounts.get(p.id) ?? 0,
        comment_count: commentCounts.get(p.id) ?? 0,
        liked_by_me: mineSet.has(p.id),
      })) as Post[]
    );
  };

  const loadStories = async () => {
    if (!user) return;
    const { data: rawStories } = await supabase
      .from("stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    if (!rawStories || rawStories.length === 0) { setStoryGroups([]); return; }

    const authorIds = Array.from(new Set(rawStories.map((s) => s.author_id)));
    const storyIds = rawStories.map((s) => s.id);
    const [{ data: authors }, { data: views }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, photo_url, verification_status").in("id", authorIds),
      supabase.from("story_views").select("story_id").in("story_id", storyIds).eq("viewer_id", user.id),
    ]);
    const authorMap = new Map<string, Profile>((authors ?? []).map((a) => [a.id, a as Profile]));
    const seenSet = new Set((views ?? []).map((v) => v.story_id));

    const groupsMap = new Map<string, StoryGroup>();
    for (const s of rawStories) {
      const a = authorMap.get(s.author_id);
      if (!a) continue;
      let g = groupsMap.get(s.author_id);
      if (!g) {
        g = { author: a, stories: [], hasUnseen: false };
        groupsMap.set(s.author_id, g);
      }
      g.stories.push(s as Story);
      if (!seenSet.has(s.id)) g.hasUnseen = true;
    }
    // Sort: own first, then unseen, then seen
    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.author.id === user.id) return -1;
      if (b.author.id === user.id) return 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return 0;
    });
    setStoryGroups(groups);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      await Promise.all([loadPosts(), loadStories()]);
      setLoading(false);
    })();
    // realtime
    const channel = supabase
      .channel("feed-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => loadPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, () => loadPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_comments" }, () => loadPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => loadStories())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const toggleLike = async (post: Post) => {
    if (!user) return;
    // optimistic
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, liked_by_me: !p.liked_by_me, like_count: p.like_count + (p.liked_by_me ? -1 : 1) }
          : p
      )
    );
    if (post.liked_by_me) {
      await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    } else {
      await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id });
    }
  };

  const deletePost = async (post: Post) => {
    if (!user || post.author_id !== user.id) return;
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) toast.error(error.message);
    else setPosts((prev) => prev.filter((p) => p.id !== post.id));
  };

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto max-w-2xl">
        {/* Story rail */}
        <StoryRail
          groups={storyGroups}
          currentUserId={user?.id ?? ""}
          onOpen={(idx) => setViewerGroupIdx(idx)}
          onAdd={() => setStoryComposeOpen(true)}
        />

        {/* Compose post button */}
        <div className="px-4 pb-3 flex justify-end">
          <button
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow"
          >
            <Plus className="h-4 w-4" /> New post
          </button>
        </div>

        {/* Feed */}
        {loading ? (
          <div className="text-center text-muted-foreground py-10 text-sm">Loading…</div>
        ) : posts.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm px-6">
            No posts yet. Tap <span className="font-semibold">New post</span> to share something.
          </div>
        ) : (
          <ul className="space-y-6 pb-10">
            {posts.map((post) => (
              <li key={post.id} className="bg-card border-y sm:border border-border sm:rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {post.author?.photo_url ? (
                    <img src={post.author.photo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                      {(post.author?.display_name ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold truncate">
                      {post.author?.display_name ?? "Someone"}
                      {post.author && (
                        <VerificationBadge status={post.author.verification_status} size="sm" />
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{timeAgo(post.created_at)} ago</div>
                  </div>
                  {post.author_id === user?.id && (
                    <button onClick={() => deletePost(post)} className="text-muted-foreground hover:text-destructive p-1.5" aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <img src={post.image_url} alt="" className="w-full max-h-[600px] object-cover bg-muted" />
                <div className="px-3 py-2 flex items-center gap-4">
                  <button onClick={() => toggleLike(post)} className="flex items-center gap-1.5 text-sm">
                    <Heart className={`h-6 w-6 ${post.liked_by_me ? "fill-primary text-primary" : "text-foreground"}`} />
                    <span className="font-semibold">{post.like_count}</span>
                  </button>
                  <button onClick={() => setCommentsFor(post)} className="flex items-center gap-1.5 text-sm">
                    <MessageCircle className="h-6 w-6" />
                    <span className="font-semibold">{post.comment_count}</span>
                  </button>
                </div>
                {post.caption && (
                  <p className="px-3 pb-3 text-sm">
                    <span className="font-semibold mr-1.5">{post.author?.display_name}</span>
                    {post.caption}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {composeOpen && <ComposePostModal onClose={() => setComposeOpen(false)} onCreated={loadPosts} />}
      {storyComposeOpen && <ComposeStoryModal onClose={() => setStoryComposeOpen(false)} onCreated={loadStories} />}
      {viewerGroupIdx !== null && storyGroups[viewerGroupIdx] && (
        <StoryViewer
          groups={storyGroups}
          startIdx={viewerGroupIdx}
          currentUserId={user?.id ?? ""}
          onClose={() => { setViewerGroupIdx(null); loadStories(); }}
        />
      )}
      {commentsFor && (
        <CommentsModal post={commentsFor} onClose={() => { setCommentsFor(null); loadPosts(); }} />
      )}
    </div>
  );
}

function StoryRail({
  groups, currentUserId, onOpen, onAdd,
}: {
  groups: StoryGroup[];
  currentUserId: string;
  onOpen: (idx: number) => void;
  onAdd: () => void;
}) {
  const myGroupIdx = groups.findIndex((g) => g.author.id === currentUserId);
  const myGroup = myGroupIdx >= 0 ? groups[myGroupIdx] : null;

  return (
    <div className="px-3 py-3 overflow-x-auto">
      <div className="flex gap-3 min-w-min">
        {/* Add story */}
        <button onClick={onAdd} className="flex flex-col items-center gap-1 w-16 shrink-0">
          <div className="relative h-16 w-16 rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center">
            {myGroup?.author.photo_url ? (
              <img src={myGroup.author.photo_url} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              <Plus className="h-6 w-6 text-muted-foreground" />
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background">
              <Plus className="h-3 w-3" strokeWidth={3} />
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">Your story</span>
        </button>
        {groups.map((g, i) => {
          if (g.author.id === currentUserId) return null;
          return (
            <button key={g.author.id} onClick={() => onOpen(i)} className="flex flex-col items-center gap-1 w-16 shrink-0">
              <div className={`p-[2px] rounded-full ${g.hasUnseen ? "bg-gradient-to-br from-amber-400 via-pink-500 to-primary" : "bg-muted"}`}>
                <div className="bg-background rounded-full p-[2px]">
                  {g.author.photo_url ? (
                    <img src={g.author.photo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-semibold">
                      {g.author.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[11px] truncate max-w-[64px]">{g.author.display_name}</span>
            </button>
          );
        })}
        {myGroup && (
          <button onClick={() => onOpen(myGroupIdx)} className="flex flex-col items-center gap-1 w-16 shrink-0">
            <div className="p-[2px] rounded-full bg-muted">
              <div className="bg-background rounded-full p-[2px]">
                {myGroup.author.photo_url ? (
                  <img src={myGroup.author.photo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-semibold">
                    {myGroup.author.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <span className="text-[11px] truncate max-w-[64px]">View yours</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ComposePostModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const onPick = (f: File | null) => {
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
    else setPreview(null);
  };

  const submit = async () => {
    if (!user || !file) return;
    if (file.size > 25 * 1024 * 1024) { toast.error("Max 25MB"); return; }
    setBusy(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/posts/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type,
    });
    if (upErr) { toast.error(upErr.message); setBusy(false); return; }
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    const { error: insErr } = await supabase.from("posts").insert({
      author_id: user.id, image_url: pub.publicUrl, caption: caption.trim().slice(0, 500),
    });
    setBusy(false);
    if (insErr) { toast.error(insErr.message); return; }
    toast.success("Posted!");
    onCreated();
    onClose();
  };

  return (
    <ModalShell title="New post" onClose={onClose}>
      <label className="block">
        {preview ? (
          <img src={preview} alt="" className="w-full max-h-80 object-cover rounded-xl border border-border" />
        ) : (
          <div className="w-full aspect-square max-h-80 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground gap-2 cursor-pointer hover:bg-muted/30">
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm">Tap to choose an image (≤25MB)</span>
          </div>
        )}
        <input
          type="file" accept="image/*" className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
      <textarea
        value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500}
        placeholder="Write a caption…"
        className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-sm min-h-20 resize-none"
      />
      <button
        disabled={!file || busy}
        onClick={submit}
        className="mt-3 w-full rounded-full bg-gradient-primary text-primary-foreground py-3 font-semibold disabled:opacity-50"
      >
        {busy ? "Posting…" : "Share"}
      </button>
    </ModalShell>
  );
}

function ComposeStoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const onPick = (f: File | null) => {
    setFile(f);
    if (f) {
      setPreview(URL.createObjectURL(f));
      setMediaType(f.type.startsWith("video") ? "video" : "image");
    } else setPreview(null);
  };

  const submit = async () => {
    if (!user || !file) return;
    if (file.size > 25 * 1024 * 1024) { toast.error("Max 25MB"); return; }
    if (mediaType === "video") {
      // optional 30s check (best-effort, browser-only)
      const dur = await new Promise<number>((res) => {
        const v = document.createElement("video");
        v.preload = "metadata"; v.src = URL.createObjectURL(file);
        v.onloadedmetadata = () => res(v.duration);
        v.onerror = () => res(0);
      });
      if (dur > 31) { toast.error("Videos must be ≤30s"); return; }
    }
    setBusy(true);
    const ext = file.name.split(".").pop() ?? (mediaType === "video" ? "mp4" : "jpg");
    const path = `${user.id}/stories/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type,
    });
    if (upErr) { toast.error(upErr.message); setBusy(false); return; }
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    const { error: insErr } = await supabase.from("stories").insert({
      author_id: user.id, media_url: pub.publicUrl, media_type: mediaType, caption: caption.trim().slice(0, 200),
    });
    setBusy(false);
    if (insErr) { toast.error(insErr.message); return; }
    toast.success("Story added!");
    onCreated();
    onClose();
  };

  return (
    <ModalShell title="New story" onClose={onClose}>
      <label className="block">
        {preview ? (
          mediaType === "video" ? (
            <video src={preview} controls className="w-full max-h-80 rounded-xl border border-border bg-black" />
          ) : (
            <img src={preview} alt="" className="w-full max-h-80 object-cover rounded-xl border border-border" />
          )
        ) : (
          <div className="w-full aspect-square max-h-80 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground gap-2 cursor-pointer hover:bg-muted/30">
            <Film className="h-8 w-8" />
            <span className="text-sm">Image or video (≤25MB, ≤30s)</span>
          </div>
        )}
        <input
          type="file" accept="image/*,video/*" className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
      <input
        value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200}
        placeholder="Caption (optional)"
        className="mt-3 w-full rounded-full border border-border bg-background px-4 py-2.5 text-sm"
      />
      <button
        disabled={!file || busy}
        onClick={submit}
        className="mt-3 w-full rounded-full bg-gradient-primary text-primary-foreground py-3 font-semibold disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Add to your story"}
      </button>
      <p className="mt-2 text-[11px] text-muted-foreground text-center">Disappears after 24 hours.</p>
    </ModalShell>
  );
}

function StoryViewer({
  groups, startIdx, currentUserId, onClose,
}: {
  groups: StoryGroup[];
  startIdx: number;
  currentUserId: string;
  onClose: () => void;
}) {
  const [groupIdx, setGroupIdx] = useState(startIdx);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const timerRef = useRef<number | null>(null);

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];
  const isOwn = story?.author_id === currentUserId;

  // Mark viewed
  useEffect(() => {
    if (!story || isOwn) return;
    supabase.from("story_views").upsert(
      { story_id: story.id, viewer_id: currentUserId },
      { onConflict: "story_id,viewer_id" }
    ).then(() => {});
  }, [story, isOwn, currentUserId]);

  // Auto-advance (5s for images; videos handled via onEnded)
  useEffect(() => {
    setProgress(0);
    if (!story) return;
    if (story.media_type === "video") return;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / 5000);
      setProgress(p);
      if (p >= 1) advance();
      else timerRef.current = window.setTimeout(tick, 50);
    };
    timerRef.current = window.setTimeout(tick, 50);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIdx, storyIdx]);

  const advance = () => {
    if (!group) return;
    if (storyIdx + 1 < group.stories.length) {
      setStoryIdx((i) => i + 1);
    } else if (groupIdx + 1 < groups.length) {
      setGroupIdx((i) => i + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
  };
  const prev = () => {
    if (storyIdx > 0) setStoryIdx((i) => i - 1);
    else if (groupIdx > 0) {
      setGroupIdx((i) => i - 1);
      setStoryIdx(0);
    }
  };

  const deleteStory = async () => {
    if (!story || !isOwn) return;
    if (!confirm("Delete this story?")) return;
    const { error } = await supabase.from("stories").delete().eq("id", story.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    if (group.stories.length === 1) onClose();
    else {
      group.stories.splice(storyIdx, 1);
      setStoryIdx(Math.max(0, storyIdx - 1));
    }
  };

  if (!story || !group) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={(e) => e.stopPropagation()}>
      {/* Progress bars */}
      <div className="flex gap-1 px-3 pt-3">
        {group.stories.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white"
              style={{ width: i < storyIdx ? "100%" : i === storyIdx ? `${progress * 100}%` : "0%" }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 text-white">
        {group.author.photo_url ? (
          <img src={group.author.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">
            {group.author.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="font-semibold text-sm">{group.author.display_name}</span>
        <span className="text-xs text-white/70">{timeAgo(story.created_at)}</span>
        <div className="ml-auto flex items-center gap-2">
          {isOwn && (
            <button onClick={deleteStory} aria-label="Delete" className="p-1.5 text-white/80 hover:text-white">
              <Trash2 className="h-5 w-5" />
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-white/80 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center">
        {/* Tap zones */}
        <button onClick={prev} className="absolute inset-y-0 left-0 w-1/3 z-10" aria-label="Previous" />
        <button onClick={advance} className="absolute inset-y-0 right-0 w-1/3 z-10" aria-label="Next" />
        {story.media_type === "video" ? (
          <video src={story.media_url} autoPlay playsInline onEnded={advance} className="max-h-full max-w-full" />
        ) : (
          <img src={story.media_url} alt="" className="max-h-full max-w-full object-contain" />
        )}
        {story.caption && (
          <div className="absolute bottom-20 inset-x-0 px-6 text-center">
            <span className="inline-block bg-black/50 text-white text-sm px-3 py-1.5 rounded-lg">{story.caption}</span>
          </div>
        )}
      </div>

      {isOwn && (
        <div className="px-4 py-3 z-20">
          <button
            onClick={() => setShowViewers(true)}
            className="flex items-center gap-2 text-white/90 text-sm"
          >
            <Eye className="h-5 w-5" /> Viewers
          </button>
        </div>
      )}

      {showViewers && story && (
        <ViewersSheet storyId={story.id} onClose={() => setShowViewers(false)} />
      )}
    </div>
  );
}

function ViewersSheet({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const [viewers, setViewers] = useState<Profile[]>([]);
  useEffect(() => {
    (async () => {
      const { data: vs } = await supabase
        .from("story_views").select("viewer_id, viewed_at")
        .eq("story_id", storyId).order("viewed_at", { ascending: false });
      const ids = (vs ?? []).map((v) => v.viewer_id);
      if (ids.length === 0) { setViewers([]); return; }
      const { data: profs } = await supabase
        .from("profiles").select("id, display_name, photo_url, verification_status").in("id", ids);
      setViewers((profs ?? []) as Profile[]);
    })();
  }, [storyId]);
  return (
    <div className="absolute inset-0 z-30 bg-black/80 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-card rounded-t-2xl max-h-[60%] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card">
          <h3 className="font-semibold">Viewers ({viewers.length})</h3>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {viewers.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No viewers yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {viewers.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-3">
                {v.photo_url ? (
                  <img src={v.photo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                    {v.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="font-medium text-sm flex items-center gap-1.5">
                  {v.display_name}
                  <VerificationBadge status={v.verification_status} size="sm" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: Profile;
};

function CommentsModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("post_comments").select("*").eq("post_id", post.id).order("created_at", { ascending: true });
    if (!data) return;
    const ids = Array.from(new Set(data.map((c) => c.author_id)));
    const { data: profs } = await supabase
      .from("profiles").select("id, display_name, photo_url, verification_status").in("id", ids);
    const map = new Map<string, Profile>((profs ?? []).map((p) => [p.id, p as Profile]));
    setComments(data.map((c) => ({ ...c, author: map.get(c.author_id) })) as Comment[]);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel(`comments:${post.id}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "post_comments", filter: `post_id=eq.${post.id}` },
      () => load()
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !user || busy) return;
    setBusy(true);
    setText("");
    const { error } = await supabase.from("post_comments").insert({
      post_id: post.id, author_id: user.id, body: body.slice(0, 500),
    });
    setBusy(false);
    if (error) { toast.error(error.message); setText(body); }
  };

  const del = async (c: Comment) => {
    if (!user || c.author_id !== user.id) return;
    await supabase.from("post_comments").delete().eq("id", c.id);
  };

  return (
    <ModalShell title="Comments" onClose={onClose}>
      <div className="max-h-[50vh] overflow-y-auto -mx-4 px-4 divide-y divide-border">
        {comments.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">Be the first to comment.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="py-2.5 flex items-start gap-2.5">
              {c.author?.photo_url ? (
                <img src={c.author.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                  {(c.author?.display_name ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="font-semibold mr-1.5 inline-flex items-center gap-1">
                    {c.author?.display_name ?? "Someone"}
                    {c.author && <VerificationBadge status={c.author.verification_status} size="sm" />}
                  </span>
                  {c.body}
                </div>
                <div className="text-[11px] text-muted-foreground">{timeAgo(c.created_at)} ago</div>
              </div>
              {c.author_id === user?.id && (
                <button onClick={() => del(c)} className="text-muted-foreground hover:text-destructive p-1" aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
      <form onSubmit={send} className="mt-3 flex items-center gap-2">
        <input
          value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
          placeholder="Add a comment…"
          className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm"
        />
        <button
          type="submit" disabled={!text.trim() || busy}
          className="h-10 w-10 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
          aria-label="Post comment"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border p-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
