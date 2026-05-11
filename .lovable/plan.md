# Implementation Plan

You picked all four priority areas. This is multi-phase work — I'll ship them in order, one phase per turn, so you can preview & give feedback between phases.

## Phase 1 — Verification badges + profile search (this turn)

**Database**
- Add to `profiles`: `interests text[]`, `hide_age bool`, `hide_location bool`, `message_policy enum('everyone','matches')`, `verification_status enum('unverified','pending','verified','premium')`, `verification_selfie_url text`
- New table `verification_requests` (user_id, selfie_url, status, reviewer_id, reviewed_at, notes) with admin-review RLS
- Storage bucket `verification` (private, user-scoped RLS) and `media` (public, user-scoped write) — bucket #2 used by later phases
- Index on `profiles(display_name)` for search

**UI**
- `/verify` page: upload selfie → creates `verification_requests` row → status banner
- Verification badge component (✔️ unverified hidden, 🔵 verified, ⭐ premium = verified + VIP)
- Show badge on profile, discover card, matches list, chat header
- Discover ranking: boosted → verified → others
- New `/search` route + search bar in nav: filter `profiles` by display_name (ILIKE), exclude self/blocked
- Onboarding: add interests multi-select, privacy toggles
- Admin dashboard: new "Verification" tab — approve/reject pending requests

## Phase 2 — Social feed + stories (next turn)
Posts table (image/caption), likes, comments. Stories table with 24h TTL via `expires_at`. Feed route with Instagram-style timeline + circular story rail. Story viewer with swipe, view tracking. Uses `media` bucket.

## Phase 3 — Rich chat (after that)
Image/video upload in chat, typing indicator (Realtime broadcast), online presence (Realtime presence), keep existing read receipts. Message reactions.

## Phase 4 — Privacy + notifications + block/report
`blocks`, `reports`, `notifications` tables. Notification bell with unread dot + sound on new event. Block/report buttons across surfaces. Admin reports queue. Apply `message_policy` and block filtering everywhere.

---

## What's out of scope (call out if you want them later)
- AI face-match (you chose manual review)
- ID-verification tier (premium badge will just = verified + VIP)
- Push notifications (in-app only; web push needs separate setup)
- Voice notes / follow requests (not in original spec, can add)
- Content moderation AI (manual report queue only)

## Tech notes
- Selfies → private `verification` bucket, only owner + admin can read
- Post/story media → public `media` bucket (URL-based access; necessary for `<img>`/`<video>` tags without signed URLs)
- Realtime channels for stories/notifications/typing
- All new tables get RLS; admin operations gated by existing `has_role(auth.uid(),'admin')`

Approve to start Phase 1.
