# Support Ticket Conversation Attachments Design

## Goal

Support ticket conversations should notify the relevant people for every exchange, accept one optional image attachment per text message, and render message text as safe Markdown in the web-worker console.

## Decisions

- Ticket message text remains required. An image is optional.
- Each ticket message supports at most one image URL stored on the message row.
- Attachments are uploaded through an authenticated support-ticket endpoint before the ticket or reply is submitted.
- Supported image formats are `png`, `jpg`, `jpeg`, `webp`, and `gif`; the size limit is 10 MB.
- Stored message image URLs must be either internal upload URLs or `http(s)` storage URLs returned by the backend.
- User-authored Markdown must not allow raw HTML.

## Backend

- Add `image_url` to `model.SupportTicketMessage`.
- Add image-aware creation and reply helpers while keeping existing helper wrappers for older call sites.
- Add `POST /api/support/tickets/attachments`, guarded by `UserAuth`, returning `{ "url": "..." }`.
- Reuse the existing local/R2 storage behavior with a support-ticket-specific key prefix.
- On ticket creation, create a user confirmation site notification and email when the user has an email.
- On every reply, notify the ticket owner unless the owner sent the reply.
- On ticket creation and every reply, notify enabled admin accounts except the sender by site notification and email when they have email.
- Send the fixed support mailbox a fallback admin email when no notified admin email matches it.
- Keep explicit status update notifications as their own behavior.

## Frontend

- Add ticket attachment upload API and hook.
- New ticket and reply forms accept one optional image file.
- Submit flow uploads the image first, then sends `image_url` in the JSON payload.
- The send button still requires non-empty text.
- Render message content with safe Markdown/GFM and render the uploaded image as a separate preview/link.

## Verification

- Go model tests cover `image_url` persistence and validation.
- Go notification tests cover per-message user/admin site notifications and emails.
- Web-worker API tests cover upload `FormData` and optional `image_url` payloads.
- Markdown tests cover escaping raw HTML while keeping Markdown formatting.
- Run targeted Go and web-worker tests, then broader package checks if feasible.
