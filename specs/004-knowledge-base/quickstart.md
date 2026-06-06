# Quickstart: Knowledge Base

## Run
```bash
cd backend && npm install && npm run build && node dist/main.js   # or start:dev
# frontend: cd frontend && npm run dev
```

## Promote an admin
```bash
cd backend && node dist/scripts/make-admin.js seller@test.com   # role → admin
```

## Verify by curl
```bash
B=http://localhost:3001
JWT=$(curl -s -XPOST $B/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"seller@test.com","password":"Password123"}' | jq -r .accessToken)

# 1) Upload a guide by pasting Markdown (US1)
curl -s -XPOST $B/knowledge -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"title":"Margin on Etsy","content":"# Margin\nProfit = sell - base - shipping. Always ask the destination country and the sell price first."}' | jq

# 2) Upload a guide from a .md file
echo "# Cheapest EU factory\nCompare factory base costs, then shipping per country; pick lowest total." > /tmp/eu.md
curl -s -XPOST $B/knowledge -H "Authorization: Bearer $JWT" -F file=@/tmp/eu.md | jq '.title, .metadataStatus, .intents'

# 3) List guides
curl -s $B/knowledge -H "Authorization: Bearer $JWT" | jq '.guides[] | {title, metadataStatus}'

# 4) Ask a matching question in chat (US2) — answer should follow the guide
SID=$(curl -s -XPOST $B/conversations -H "Authorization: Bearer $JWT" | jq -r .sessionId)
curl -s -XPOST $B/conversations/$SID/messages -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"message":"bán áo $25 trên Etsy thì lời bao nhiêu?"}' | jq -r .reply   # should ask country + apply margin steps

# 5) Non-admin denied (SC-004)
# (login as a non-admin user → POST /knowledge should return 403)

# 6) Delete (US3)
GID=$(curl -s $B/knowledge -H "Authorization: Bearer $JWT" | jq -r '.guides[0].id')
curl -s -XDELETE $B/knowledge/$GID -H "Authorization: Bearer $JWT" | jq
```

## Acceptance mapping
- US1 (upload+index): steps 1–3 → SC-001, SC-005.
- US2 (auto-use): step 4 (matching question applies the guide; unrelated question unaffected) → SC-002, SC-003, SC-006.
- US3 (manage) + access: steps 5–6 → SC-004.

## Done when
- Admin uploads (paste + `.md`) produce indexed guides with metadata.
- A matching question makes the agent retrieve + follow the guide; an unrelated question is unaffected; the agent never mentions "guides/tools".
- Non-admin gets 403 on all guide management; deleted guides stop influencing answers; build + tests pass; no Vietnamese in new code.
