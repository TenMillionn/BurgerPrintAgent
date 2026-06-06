# Quickstart: Auth & Conversation Persistence

How to run and verify the finished feature.

## Run
```bash
cd backend
# .env must set: MONGODB_URI, REDIS_URL, JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN,
#                LLM_PROVIDER/LLM_MODEL/OPENAI_API_KEY, and (optional) GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL
docker compose up -d redis mongo
npm install && npm run build && node dist/main.js   # or: npm run start:dev
```
Frontend: `cd frontend && npm install && npm run dev` (proxies `/api` → backend).

## Verify by curl

```bash
B=http://localhost:3001

# 1) Register + login (P1)
curl -s -XPOST $B/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"a@test.com","password":"Password123","displayName":"A"}'
JWT=$(curl -s -XPOST $B/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"a@test.com","password":"Password123"}' | jq -r .accessToken)

# 2) Create conversation + chat (persists messages)
SID=$(curl -s -XPOST $B/conversations -H "Authorization: Bearer $JWT" | jq -r .sessionId)
curl -s -XPOST $B/conversations/$SID/messages -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' -d '{"message":"T-shirt US under $8"}' >/dev/null

# 3) List conversations (P2) — should show it with an auto-derived title
curl -s $B/conversations -H "Authorization: Bearer $JWT" | jq

# 4) Reopen → full history incl. tool steps (P3)
CID=$(curl -s $B/conversations -H "Authorization: Bearer $JWT" | jq -r '.conversations[0].id')
curl -s $B/conversations/$CID -H "Authorization: Bearer $JWT" | jq '.messages[] | {role, content, toolSteps}'

# 5) Rename + delete (P2)
curl -s -XPUT  $B/conversations/$CID -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' -d '{"title":"US tees"}' | jq
curl -s -XDELETE $B/conversations/$CID -H "Authorization: Bearer $JWT" | jq

# 6) Isolation (SC-003): second user must NOT see user A's conversation
curl -s -XPOST $B/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"b@test.com","password":"Password123"}' >/dev/null
JWT2=$(curl -s -XPOST $B/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"b@test.com","password":"Password123"}' | jq -r .accessToken)
curl -s -o /dev/null -w "%{http_code}\n" $B/conversations/$CID -H "Authorization: Bearer $JWT2"  # expect 404

# 7) Refresh rotation (SC-006): old refresh token must be rejected after use
```

## Acceptance mapping
- US1 (auth/isolation): steps 1, 6, 7 → SC-001, SC-003, SC-004, SC-006.
- US2 (conversations): steps 2, 3, 5 → SC-002.
- US3 (messages): step 4 (history + tool steps in order) → SC-005.

## Done when
- All curl steps behave as commented; FE Sidebar lists/opens/renames/deletes conversations; reopened chat shows full history with tool-step timeline; a second user gets 404 on another's conversation; build + existing tests pass.
