# Letter Generate — portable feature bundle

Workdesk page where a user picks a tender, chats ("create a letter for Extension of
Validity of Rate Contract"), and an AI drafts the letter from the company's own
letter formats. Letters are saved per tender in folders; they can be downloaded as
.docx/.html, and external files can be uploaded alongside.

## Contents (paths mirror the original portal — copy each into the same place)

| Bundle path | Put it at |
|---|---|
| `frontend/pages/Workdesk/LetterGenerate.jsx` | `Frontend/src/pages/Workdesk/` |
| `backend/controllers/letterGenerate.controller.js` | `backend/src/controllers/` |
| `backend/routes/letterGenerate.routes.js` | `backend/src/routes/` |
| `backend/utils/letterTemplates.js` | `backend/src/utils/` |
| `backend/asset/letter-templates/Letter Regarding Tenders.docx` | `backend/src/asset/letter-templates/` — **the letter formats** |
| `backend/utils/ollama.js` | `backend/src/utils/` (skip if you already have an equivalent `callOllama(system, user, temp, numPredict)`) |
| `backend/middlewares/auth.middleware.js`, `authOrQueryToken.middleware.js` | `backend/src/middlewares/` (skip if your portal has its own JWT auth; the routes need `auth` and `authOrQuery`) |

## Wiring

**Backend** — `app.js`:
```js
app.use('/api/letters', require('./routes/letterGenerate.routes'));
```
Also needs `../config/db` (a mysql2 promise pool). The `uploads/letter-generate/` folder is created automatically.

**Frontend** — `App.jsx`:
```jsx
const LetterGenerate = lazy(() => import("./pages/Workdesk/LetterGenerate"));
<Route path="/Admin/workdesk/letter-generate" element={<ProtectedRoute allowedRoles={[...]}><LetterGenerate /></ProtectedRoute>} />
```
Navbar entry: `{ name: "Letter Generate", path: `${basePath}/workdesk/letter-generate` }`.
The page reads `VITE_API_BASE_URL` (default `http://localhost:5000/api`) and the JWT from `localStorage.getItem('token')`.

## Dependencies
- backend: `mammoth`, `multer`, `html-to-docx`, `ollama`, `mysql2`, `jsonwebtoken`, `express`
- frontend: `react`, `lucide-react`

## Database
Two tables, auto-created on first start (`CREATE TABLE IF NOT EXISTS` in the controller):
`letter_folders` and `letter_documents`. No manual migration needed.
The controller also reads tender details (for filling letters) from `gem_tenders` and
`open_tender_details` — if your new portal names these differently, edit `getTenderContext()`
in the controller and the `/tenders?search=` call in the page.

## How the formats work
`letterTemplates.js` reads `Letter Regarding Tenders.docx`, splits it into letters at each
`Ref No.: MEPL...` line, and matches the user's chat request to the closest one by keyword overlap
with each letter's Subject. That template plus the tender's data goes to the LLM, which returns the
filled letter. **To add or change formats, edit the .docx** — keep each letter starting with
`Ref No.: MEPL/...` and a `Subject:` line. The `MEPL` prefix is hard-coded in the split regex;
change it there if your company's reference prefix differs.

## Env
`OLLAMA_MODEL` (default `gpt-oss:120b-cloud`), `OLLAMA_FALLBACK_MODEL` (default `qwen2.5:7b`),
`OLLAMA_HOST`, `JWT_SECRET`.
