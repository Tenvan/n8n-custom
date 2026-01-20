# N8N Frontend ohne Authentifizierung

**Ziel:** Das Frontend soll ohne Authentifizierung starten und direkt in den Editor gelangen. Keine Login-Seite, keine User-Authentifizierung erforderlich.

**Umsetzungsrichtlinien:**
- Umsetzung soll mit möglichst wenig Code erfolgen
- Authentifizierung wird deaktiviert, nicht entfernt
- **WICHTIG:** Es müssen keine Tests angepasst werden, nur der reine produktive Code
- **WICHTIG:** Alle geänderten Stellen müssen mit einer eindeutigen Markierung in Form von Kommentaren gekennzeichnet werden

**Beispiel für Kommentar-Markierung:**
```typescript
// [CUSTOM-FORK] No Auth: Skip authentication check
// Original authentication logic disabled
// [CUSTOM-FORK] End No Auth
```

**Verhalten:**
- Beim Start des Frontends wird keine Authentifizierung geprüft
- Direkter Zugriff auf den Editor ohne Login
- Alle Routen sind ohne Authentifizierung zugänglich
- Die Root-Route `/` redirected automatisch zu `/workflow/new` (Editor)

**Korrekte URLs:**
- Root/Start: `/` → redirected automatisch zu `/workflow/new`
- Neuer Workflow: `/workflow/new` → erstellt automatisch einen neuen Workflow und redirected zu `/workflow/:id`
- Bestehender Workflow: `/workflow/:name` → Editor für einen bestehenden Workflow

Source control info:
- Workspace branch: `feature/n8n-custom`
- Workspace commit: `91ba70c8a065cc42c1dd8570ea439daaf1edd772`
- `apps/n8n` submodule: `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

## Implementierung

### Backend - Auth Middleware deaktivieren
**File Path:** `apps/n8n/packages/cli/src/auth/auth.service.ts`

**Description:** Die Auth-Middleware wird so angepasst, dass sie immer durchlässt (allowUnauthenticated).

### Frontend - Router Middleware deaktivieren
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/app/utils/rbac/middleware/authenticated.ts`

**Description:** Die authenticatedMiddleware wird so angepasst, dass sie immer durchlässt ohne Redirect zur Login-Seite.

### Frontend - User Store Initialisierung
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/settings/users/users.store.ts`

**Description:** Die User-Initialisierung wird so angepasst, dass sie nicht nach einem eingeloggten User sucht.

### Frontend - Root Route Redirect
**File Path:** `apps/n8n/packages/frontend/editor-ui/src/app/router.ts`

**Description:** Die Root-Route `/` wird so angepasst, dass sie direkt zu `/workflow/new` (Editor) redirected statt zu `/home/workflows`.
