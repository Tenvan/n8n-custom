# N8N Entfernung Aktivierungspflicht bei gleichzeitiger Aktivierung aller Features

**Ziel:** Entfernung der Aktivierungspflicht bei gleichzeitiger Aktivierung aller Features, bzw. Entfernung aller Einschränkungen nach Lizenz.

## Strategien

Es gibt zwei mögliche Ansätze:

### Strategie 1: Entfernung aller Lizenzabfragen

Vollständige Entfernung aller Lizenzprüfungen und Aktivierung aller Features ohne Lizenzprüfung.

### Strategie 2: Automatische Aktivierung mit Volllizenz (Empfohlen)

Statt der Entfernung aller Lizenzabfragen kann der Service automatisch mit einer Volllizenz starten. Der feste User aus [N8N_FIXED_USER_LOGIN.MD](N8N_FIXED_USER_LOGIN.MD) (`deltra@orgamax.de`) wird automatisch mit einer vollen Lizenz aktiviert, bzw. der Service startet automatisch mit einer Volllizenz als Default.

**WICHTIG: Vollständig lokal, keine externen Server-Abhängigkeiten**

Strategie 2 bedeutet **NICHT**, dass externe Lizenz-Server verwendet werden. Stattdessen:

- ✅ **Lokal bleiben:** Die Code-Struktur (License-Klassen, Interfaces, Feature-Checks)
- ❌ **Entfernt werden:** Alle externen Server-Kommunikationen (`license.n8n.io`, `enterprise.n8n.io`)
- ✅ **Ersetzt werden:** LicenseManager SDK durch lokale Simulation einer Volllizenz

**Was lokal bleibt (Code-Struktur):**

- License-Klassen und Interfaces (`License`, `LicenseService`, `LicenseController`)
- Feature-Check-Logik (`@Licensed()` Decorators, Feature-Flags)
- Plan-Name-Logik (Enterprise/Pro/Community)
- Quota-Management-Struktur

**Was entfernt/ersetzt werden muss (externe Abhängigkeiten):**

- ❌ Kommunikation mit `https://license.n8n.io/v1` → Lokale Simulation
- ❌ Kommunikation mit `https://enterprise.n8n.io` → Lokale Mock-Response
- ❌ LicenseManager SDK Initialisierung mit Server-URL → Lokale Volllizenz-Konfiguration
- ❌ Auto-Renewal-Versuche → Deaktiviert oder lokale "immer gültig" Logik
- ❌ Externe HTTP-Calls für Aktivierung/Registrierung → Lokale No-Op oder Mock

**Vorteile von Strategie 2:**

- Beibehaltung der bestehenden Code-Struktur (weniger Refactoring)
- Weniger Code-Änderungen erforderlich als bei Strategie 1
- Einfacheres Rollback möglich
- Kompatibilität mit bestehenden Lizenzprüfungen
- **Vollständig offline-fähig, keine Internet-Abhängigkeit**

**Umsetzungsrichtlinien:**

- Umsetzung soll mit möglichst wenig Code erfolgen, nur Deaktivierung ohne Entfernung alten Codes
- Wenn nötig - dann aber gezielt nachfragen - neues eigene Dateien erstellen, wenn massive Änderungen nötig sind
- Bei Strategie 1: Entfernung aller Einschränkungen nach Lizenz, gleichzeitige Aktivierung aller Features
- Bei Strategie 2: Automatische Aktivierung mit Volllizenz beim Service-Start oder beim Login des festen Users
- **WICHTIG:** Es müssen keine Tests angepasst werden, nur der reine produktive Code
- **WICHTIG:** Alle geänderten Stellen müssen mit einer eindeutigen Markierung in Form von Kommentaren gekennzeichnet werden

**Beispiel für Kommentar-Markierung:**

```typescript
// [CUSTOM-FORK] License Activation: Auto-activate with full license locally
async activateLicense(activationKey: string, eulaUri?: string, userEmail?: string) {
  // [CUSTOM-FORK] Skip external server call, set local full license
  this.setLocalFullLicense();
  return { planName: 'Enterprise', features: 'all', quotas: 'unlimited' };
}
// [CUSTOM-FORK] End License Activation
```

Source control info:

- Workspace branch: `feature/n8n-custom`
- Workspace commit: `91ba70c8a065cc42c1dd8570ea439daaf1edd772`
- `apps/n8n` submodule: `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

## Strategie 2: Automatische Aktivierung mit Volllizenz - Implementierungsdetails

### Ansatz A: Automatische Aktivierung beim Service-Start

Der Service startet automatisch mit einer Volllizenz, ohne dass eine manuelle Aktivierung erforderlich ist.

**Wichtige Dateien für Ansatz A:**

#### license.ts (License provider)

**File Path:** `apps/n8n/packages/cli/src/license.ts`

**Proposed Patch/Change:**

- **WICHTIG:** Keine Initialisierung des LicenseManager SDK mit externer Server-URL (`https://license.n8n.io/v1`)
- Stattdessen: Erstelle eine lokale Mock-Implementierung oder umgehe das SDK komplett
- Setze `planName` direkt auf Enterprise/Pro mit allen Features aktiviert
- Setze unlimited quotas für alle Ressourcen
- Simuliere eine gültige, aktivierte Lizenz **vollständig lokal ohne jegliche externe Server-Kommunikation**
- Deaktiviere Auto-Renewal komplett (keine periodischen Server-Calls)

#### base-command.ts (auto-activation via env)

**File Path:** `apps/n8n/packages/cli/src/commands/base-command.ts`

**Proposed Patch/Change:**

- Statt Auto-Aktivierung zu entfernen, setze automatisch eine lokale Volllizenz beim Start
- **WICHTIG:** Keine Kommunikation mit externen Servern - alles lokal hardcodiert
- Initialisiere eine lokale Mock-Lizenz-Konfiguration ohne LicenseManager SDK
- Oder: Umgehe das LicenseManager SDK komplett und setze die Lizenz-Daten direkt

#### Frontend settings propagation (license gating)

**File Path:** `apps/n8n/packages/cli/src/services/frontend.service.ts`

**Proposed Patch/Change:**

- Setze `planName` auf Enterprise/Pro statt Community
- Setze alle Feature-Flags auf aktiviert
- Setze unlimited quotas für alle Ressourcen

### Ansatz B: Automatische Aktivierung beim Login des festen Users

Der feste User (`deltra@orgamax.de` aus `N8N_FIXED_USER_LOGIN.MD`) wird automatisch mit einer Volllizenz aktiviert, sobald er sich einloggt.

**Wichtige Dateien für Ansatz B:**

#### auth.service.ts (Integration mit License Service)

**File Path:** `apps/n8n/packages/cli/src/auth/auth.service.ts`

**Proposed Patch/Change:**

- Nach erfolgreicher Authentifizierung des festen Users, prüfe ob Lizenz aktiviert ist
- Falls nicht aktiviert, aktiviere automatisch eine Volllizenz für diesen User
- Verknüpfe die Authentifizierung mit der automatischen Lizenzaktivierung

#### license.service.ts

**File Path:** `apps/n8n/packages/cli/src/license/license.service.ts`

**Proposed Patch/Change:**

- Erweitere `activateLicense` um eine Methode zur automatischen Aktivierung mit Volllizenz
- Diese Methode wird vom Auth-Service aufgerufen, wenn der feste User sich einloggt
- **WICHTIG:** Keine externen HTTP-Calls - alles lokal ohne Server-Kommunikation
- Setze alle Features und Quotas auf unlimited
- Umgehe `this.license.activate()` (welches externe Server kontaktiert) und setze direkt lokale Werte

### Empfohlene Implementierung

**Empfehlung:** Ansatz A (Automatische Aktivierung beim Service-Start)

**Begründung:**

- Einfacher zu implementieren
- Keine Abhängigkeit vom Login-Flow
- Service ist sofort nach Start vollständig funktionsfähig
- Weniger Code-Änderungen erforderlich

**Implementierungsschritte:**

1. Modifiziere `license.ts` um beim Initialisieren automatisch eine lokale Volllizenz zu setzen
   - **WICHTIG:** Umgehe `LicenseManager` SDK Initialisierung mit Server-URL
   - Erstelle lokale Mock-Implementierung oder setze Werte direkt
   - Deaktiviere Auto-Renewal komplett (keine periodischen Server-Calls)
2. Setze in `frontend.service.ts` den `planName` auf Enterprise/Pro mit allen Features
3. Stelle sicher, dass alle Feature-Checks die Volllizenz erkennen
4. Optional: Verstecke die Aktivierungs-UI, da bereits aktiviert
5. **Entferne/Deaktiviere alle externen HTTP-Calls:**
   - `registerCommunityEdition` → Lokale No-Op (kein `axios.post` zu `enterprise.n8n.io`)
   - LicenseManager SDK Server-Calls → Lokale Mock-Responses
   - Auto-Renewal-Versuche → Deaktiviert

---

## UI Elements

### SettingsUsageAndPlan.vue

**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/settings/usage/views/SettingsUsageAndPlan.vue`

**Code Snippet:**

```
const onLicenseActivation = async (eulaUri?: string) => {
  await usageStore.activateLicense(activationKey.value.trim(), eulaUri?.trim());
};

onMounted(async () => {
  if (route.query.key) {
    await usageStore.activateLicense(route.query.key as string);
  }
});

const onAddActivationKey = () => {
  activationKeyModal.value = true;
  sendUsageTelemetry('add_activation_key');
};
```

**Description:** Main activation UI. Opens the activation key modal, sends usage telemetry on button click, and auto-activates when `?key=` query param is present. Also drives EULA flow (modal) and calls `usageStore.activateLicense`.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Hide activation button or hard-disable `canUserActivateLicense`, remove query-param activation, and ensure `sendUsageTelemetry` does not run.

---

### EulaAcceptanceModal.vue

**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/settings/usage/components/EulaAcceptanceModal.vue`

**Code Snippet:**

```
<N8nCheckbox v-model="accepted" data-test-id="eula-checkbox">
  <template #label>
    <a :href="eulaUrl" target="_blank" rel="noopener noreferrer">
      {{ locale.baseText('settings.usageAndPlan.dialog.eula.link.text') }}
    </a>
  </template>
</N8nCheckbox>
```

**Description:** EULA acceptance modal shown when activation requires EULA acceptance, driven by `LicenseEulaRequiredError` from the backend.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Remove/skip EULA flow by preventing activation calls from the UI (or ignore EULA errors).

---

### CommunityPlusEnrollmentModal.vue

**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/settings/usage/components/CommunityPlusEnrollmentModal.vue`

**Code Snippet:**

```
const closeModal = () => {
  telemetry.track('User skipped community plus');
};

const confirm = async () => {
  const { title, text } = await usageStore.registerCommunityEdition(email.value);
};
```

**Description:** Collects user email to register the Community edition, sends telemetry on skip, and calls `usageStore.registerCommunityEdition`.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Never open the modal (force `canUserRegisterCommunityPlus` false), and make registration API a no-op.

---

### usage.constants.ts

**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/settings/usage/usage.constants.ts`

**Code Snippet:**

```
export const COMMUNITY_PLUS_DOCS_URL =
  'https://docs.n8n.io/hosting/community-edition-features/#registered-community-edition';
```

**Description:** Provides the registration documentation link used in the modal; useful to remove when disabling registration.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Remove links/UI that reference registration docs.

---

### RBAC scopes for activation and registration

**File Path:** `apps/n8n/packages/@n8n/permissions/src/roles/scopes/global-scopes.ee.ts`

**Code Snippet:**

```
'community:register',
'license:manage',
```

**Description:** Scopes used to gate activation (`license:manage`) and community registration (`community:register`). These scopes are used by UI and API checks.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** For an internal fork, optionally prevent these scopes from being granted or always return false from permission checks in UI.

## API Endpoints (Frontend Client)

### usage API client

**File Path:** `apps/n8n/packages/frontend/@n8n/rest-api-client/src/api/usage.ts`

**Code Snippet:**

```
export const activateLicenseKey = async (context, data) =>
  await makeRestApiRequest(context, 'POST', '/license/activate', data);

export const renewLicense = async (context) =>
  await makeRestApiRequest(context, 'POST', '/license/renew');
```

**Description:** Frontend REST calls for activation, renewal, trial request, and community registration.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Stub these calls or return early when activation/registration should be disabled.

---

### usage.store.ts

**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/settings/usage/usage.store.ts`

**Code Snippet:**

```
const activateLicense = async (activationKey: string, eulaUri?: string) => {
  const data = await usageApi.activateLicenseKey(rootStore.restApiContext, {
    activationKey,
    eulaUri,
  });
  setData(data);
  await settingsStore.getSettings();
  await settingsStore.getModuleSettings();
};
```

**Description:** Frontend activation/renewal/registration logic, updates license state and reloads settings after activation.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Make `activateLicense` and `registerCommunityEdition` no-ops and ensure plan data stays `Community` to avoid UI blocks.

---

### settings.store.ts (telemetry session start)

**File Path:** `apps/n8n/packages/frontend/editor-ui/src/app/stores/settings.store.ts`

**Code Snippet:**

```
if (fetchedSettings.telemetry.enabled) {
  void eventsApi.sessionStarted(rootStore.restApiContext);
}
```

**Description:** Frontend triggers a session-started telemetry event after settings load when telemetry is enabled.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Remove the call or force `telemetry.enabled` to `false` server-side.

## API Endpoints (Backend)

### license.controller.ts

**File Path:** `apps/n8n/packages/cli/src/license/license.controller.ts`

**Code Snippet:**

```
@Post('/activate')
@GlobalScope('license:manage')
async activateLicense(req: LicenseRequest.Activate) {
  await this.licenseService.activateLicense(activationKey, eulaUri, req.user.email);
  return await this.getTokenAndData();
}
```

**Description:** Backend endpoints for license activation, renewal, trial, and community registration.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Make `/license/activate` and `/license/renew` no-ops returning a local Community response; optionally block `/license/enterprise/*` endpoints.

---

### requests.ts (License DTO)

**File Path:** `apps/n8n/packages/cli/src/requests.ts`

**Code Snippet:**

```
export declare namespace LicenseRequest {
  type Activate = AuthenticatedRequest<{}, {}, { activationKey: string; eulaUri?: string }, {}>;
}
```

**Description:** Type definitions for activation request payload.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** No patch required; referenced for documentation.

## Activation Logic (Backend)

### license.service.ts

**File Path:** `apps/n8n/packages/cli/src/license/license.service.ts`

**Code Snippet:**

```
async activateLicense(activationKey: string, eulaUri?: string, userEmail?: string) {
  await this.license.activate(activationKey, eulaUri, userEmail);
}

async registerCommunityEdition({ email, instanceId, instanceUrl, licenseType }) {
  await axios.post('https://enterprise.n8n.io/community-registered', {
    email, instanceId, instanceUrl, licenseType,
  });
}
```

**Description:** Activation forwards to `License.activate()` (SDK) and community registration calls an external n8n endpoint. Also raises `LicenseEulaRequiredError` when required by the license server.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:**

- **Strategie 1:** Stub `activateLicense` and `registerCommunityEdition` to avoid external HTTP, return local success and set Community plan.
- **Strategie 2:** Implementiere automatische Aktivierung mit Volllizenz - entweder beim Service-Start oder beim Login des festen Users (`deltra@orgamax.de`). Setze Enterprise/Pro plan mit allen Features aktiviert und unlimited quotas.
  - **WICHTIG:** `registerCommunityEdition` muss lokal sein - entferne `axios.post('https://enterprise.n8n.io/community-registered')` komplett
  - `activateLicense` darf keine externen Server kontaktieren - setze Werte direkt lokal

---

### license.ts (License provider)

**File Path:** `apps/n8n/packages/cli/src/license.ts`

**Code Snippet:**

```
this.manager = new LicenseManager({
  server: this.globalConfig.license.serverUrl,
  tenantId: this.globalConfig.license.tenantId,
  autoRenewEnabled: shouldRenew,
});

await this.manager.initialize();
```

**Description:** Central license SDK initialization, activation, and renewal. All license checks and entitlements flow through this provider.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:**

- **Strategie 1:** Skip SDK init (return early), or force local Community plan with unlimited quotas.
- **Strategie 2:** **Umgehe LicenseManager SDK Initialisierung komplett** - initialisiere NICHT mit `server: 'https://license.n8n.io/v1'`. Stattdessen:
  - Erstelle lokale Mock-Implementierung oder setze Werte direkt ohne SDK
  - Setze `planName` auf Enterprise/Pro, aktiviere alle Features, setze unlimited quotas
  - Simuliere eine gültige, aktivierte Lizenz **vollständig lokal ohne jegliche externe Server-Kommunikation**
  - Deaktiviere `autoRenewEnabled` komplett (keine periodischen Renewal-Versuche)

---

### base-command.ts (auto-activation via env)

**File Path:** `apps/n8n/packages/cli/src/commands/base-command.ts`

**Code Snippet:**

```
const { activationKey } = this.globalConfig.license;
if (activationKey) {
  const hasCert = (await this.license.loadCertStr()).length > 0;
  if (!hasCert) await this.license.activate(activationKey);
}
```

**Description:** Automatically activates on startup if `N8N_LICENSE_ACTIVATION_KEY` is set.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:**

- **Strategie 1:** Remove this block or guard with explicit opt-in for internal forks.
- **Strategie 2:** Statt Auto-Aktivierung zu entfernen, setze automatisch eine lokale Volllizenz beim Start.
  - **WICHTIG:** Keine Initialisierung des License Managers mit externer Server-URL
  - Setze Werte direkt lokal ohne LicenseManager SDK oder mit lokaler Mock-Implementierung
  - Keine Kommunikation mit `license.n8n.io` Server

---

### license.config.ts

**File Path:** `apps/n8n/packages/@n8n/config/src/configs/license.config.ts`

**Code Snippet:**

```
@Env('N8N_LICENSE_SERVER_URL')
serverUrl: string = 'https://license.n8n.io/v1';
```

**Description:** License server configuration and activation key config.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Override defaults to local values or remove activation key config for internal builds.

---

### license-eula-required.error.ts

**File Path:** `apps/n8n/packages/cli/src/errors/response-errors/license-eula-required.error.ts`

**Code Snippet:**

```
export class LicenseEulaRequiredError extends ResponseError {
  constructor(message: string, readonly meta: { eulaUrl: string }) {
    super(message, 400);
  }
}
```

**Description:** Special error used to signal the EULA flow to the UI during activation.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Can be ignored if activation is fully disabled.

---

### Frontend settings propagation (license gating)

**File Path:** `apps/n8n/packages/cli/src/services/frontend.service.ts`

**Code Snippet:**

```
const telemetrySettings: ITelemetrySettings = {
  enabled: this.globalConfig.diagnostics.enabled,
};

this.settings.license.planName = this.license.getPlanName();
this.settings.license.consumerId = this.license.getConsumerId();
```

**Description:** Pushes license plan and telemetry/posthog flags to the frontend, affecting feature gates and UI visibility.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:**

- **Strategie 1:** Force `telemetry.enabled` and `posthog.enabled` to `false`, and pin `planName` to `Community` with unlimited quotas.
- **Strategie 2:** Force `telemetry.enabled` and `posthog.enabled` to `false`, and set `planName` to `Enterprise` or `Pro` with unlimited quotas and all features enabled. Die Lizenz wird automatisch beim Service-Start aktiviert.

## Tracking Mechanisms (Frontend)

### Telemetry plugin (frontend)

**File Path:** `apps/n8n/packages/frontend/editor-ui/src/app/plugins/telemetry/index.ts`

**Code Snippet:**

```
if (!telemetrySettings.enabled || !telemetrySettings.config || this.rudderStack) return;

this.identify(instanceId, userId, versionCli, projectId);
this.track('Session started', { session_id: rootStore.pushRef });
```

**Description:** Initializes RudderStack in the editor UI, identifies user/instance, and sends session events. Used by `SettingsUsageAndPlan.vue` for usage telemetry.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Make `init()` return early unconditionally, or force `telemetrySettings.enabled = false`.

---

### PostHog store (frontend)

**File Path:** `apps/n8n/packages/frontend/editor-ui/src/app/stores/posthog.store.ts`

**Code Snippet:**

```
const config = settingsStore.settings.posthog;
if (!config.enabled) {
  return;
}
window.posthog?.init(config.apiKey, options);
```

**Description:** Initializes PostHog client and captures feature flag/experiment telemetry.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Force `config.enabled` to false server-side or short-circuit `init()`.

---

### events API client (frontend)

**File Path:** `apps/n8n/packages/frontend/@n8n/rest-api-client/src/api/events.ts`

**Code Snippet:**

```
export async function sessionStarted(context) {
  return await makeRestApiRequest(context, 'GET', '/events/session-started');
}
```

**Description:** Sends session-started event to backend once settings load.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Remove the call in `settings.store.ts` or return early here.

---

### Dynamic banners (frontend)

**File Path:** `apps/n8n/packages/frontend/editor-ui/src/features/shared/banners/banners.store.ts`

**Code Snippet:**

```
await getDynamicBanners(settingsStore.settings.dynamicBanners.endpoint, {
  instanceId: settingsStore.settings.instanceId,
  planName: settingsStore.settings.license?.planName,
});
```

**Description:** Fetches remote banners using instance ID and plan name, which can be considered outbound tracking.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Disable dynamic banners in settings or short-circuit fetch.

## Tracking Mechanisms (Backend)

### telemetry/index.ts (backend)

**File Path:** `apps/n8n/packages/cli/src/telemetry/index.ts`

**Code Snippet:**

```
const { enabled, backendConfig } = this.globalConfig.diagnostics;
if (enabled) {
  const [key, dataPlaneUrl] = backendConfig.split(';');
  this.rudderStack = new RudderStack(key, { dataPlaneUrl });
  this.startPulse();
}
```

**Description:** Backend telemetry initialization and periodic pulse. Sends license plan name and usage data.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Return early from `init()` or force `diagnostics.enabled = false`.

---

### posthog/index.ts (backend)

**File Path:** `apps/n8n/packages/cli/src/posthog/index.ts`

**Code Snippet:**

```
const { enabled, posthogConfig } = this.globalConfig.diagnostics;
if (!enabled) {
  return;
}
this.postHog = new PostHog(posthogConfig.apiKey, { host: posthogConfig.apiHost });
```

**Description:** Backend PostHog client for feature flagging and event capture.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Keep `enabled` false or short-circuit client init.

---

### TelemetryEventRelay (backend)

**File Path:** `apps/n8n/packages/cli/src/events/relays/telemetry.event-relay.ts`

**Code Snippet:**

```
private licenseRenewalAttempted({ success }) {
  this.telemetry.track('Instance attempted to refresh license', { success });
}

private licenseCommunityPlusRegistered({ userId, email, licenseKey }) {
  this.telemetry.track('User registered for license community plus', {
    user_id: userId,
    email,
    licenseKey,
  });
}
```

**Description:** Emits telemetry for license renewal and community registration events (plus many others).

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Disable relay initialization when diagnostics are disabled.

---

### telemetry.controller.ts (backend proxy)

**File Path:** `apps/n8n/packages/cli/src/controllers/telemetry.controller.ts`

**Code Snippet:**

```
@Post('/proxy/:version/track', { skipAuth: true })
async track(req, res, next) {
  await this.proxy(req, res, next);
}
```

**Description:** Proxies frontend telemetry requests to RudderStack.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Disable the proxy routes or return 204/410.

---

### posthog.controller.ts (backend proxy)

**File Path:** `apps/n8n/packages/cli/src/controllers/posthog.controller.ts`

**Code Snippet:**

```
@Post('/capture/', { skipAuth: true })
async capture(req, res, next) {
  return await this.proxy(req, res, next);
}
```

**Description:** Proxies PostHog requests from the frontend.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Disable the proxy routes or return 204/410.

---

### events.controller.ts (backend)

**File Path:** `apps/n8n/packages/cli/src/events/events.controller.ts`

**Code Snippet:**

```
@Get('/session-started')
sessionStarted(req: AuthenticatedRequest) {
  const pushRef = req.headers['push-ref'];
  this.eventService.emit('session-started', { pushRef });
}
```

**Description:** Backend endpoint receiving session-started events from the frontend, relayed into telemetry.

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Remove the event emission or disable the endpoint.

---

### diagnostics.config.ts

**File Path:** `apps/n8n/packages/@n8n/config/src/configs/diagnostics.config.ts`

**Code Snippet:**

```
@Env('N8N_DIAGNOSTICS_ENABLED')
enabled: boolean = true;
```

**Description:** Global switch for diagnostics/telemetry (frontend + backend).

**Source Control Information:** `apps/n8n` submodule `a5865b4a0c65986005a761d5bc371376b2baf92e` (heads/develop)

**Proposed Patch/Change:** Default to `false` and enable only via explicit env var.

## Activation/Registration Data Flow (Summary)

### Strategie 1: Entfernung aller Lizenzabfragen

1) UI activation button in `SettingsUsageAndPlan.vue` wird ausgeblendet oder deaktiviert.
2) Alle Lizenzprüfungen werden umgangen oder entfernt.
3) Service läuft ohne Lizenzprüfungen mit allen Features aktiviert.

### Strategie 2: Automatische Aktivierung mit Volllizenz

1) Beim Service-Start wird automatisch eine lokale Volllizenz aktiviert (oder beim Login des festen Users).
2) `license.ts` initialisiert **ohne LicenseManager SDK** mit einer lokalen Volllizenz-Konfiguration.
3) **Keine externen Server-Calls:** Alle Kommunikation mit `license.n8n.io` und `enterprise.n8n.io` wird entfernt.
4) `FrontendService` propagiert Enterprise/Pro plan mit allen Features aktiviert.
5) Alle Feature-Checks erkennen die aktivierte Volllizenz.
6) UI activation button kann optional ausgeblendet werden, da bereits aktiviert.

**Zu entfernende externe Abhängigkeiten:**

- ❌ `https://license.n8n.io/v1` - LicenseManager SDK Server-URL
- ❌ `https://enterprise.n8n.io/community-registered` - Community Registration Endpoint
- ❌ Auto-Renewal-Versuche (periodische Server-Calls)
- ❌ LicenseManager SDK Initialisierung mit externer Server-URL
- ❌ Alle HTTP-Calls in `registerCommunityEdition()` und `activateLicense()` zu externen Servern

## Strategie-Vergleich und Entscheidungshilfe

### Strategie 1: Entfernung aller Lizenzabfragen

**Vorteile:**

- Keine Abhängigkeit von Lizenz-Infrastruktur
- Einfachste Lösung für vollständig unabhängigen Betrieb

**Nachteile:**

- Mehr Code-Änderungen erforderlich
- Alle Lizenzprüfungen müssen entfernt/umgangen werden
- Komplexeres Rollback bei Problemen
- Mögliche Inkompatibilitäten bei n8n-Updates

**Wann verwenden:**

- Wenn vollständige Unabhängigkeit von Lizenz-System gewünscht ist
- Wenn keine Kompatibilität mit bestehenden Lizenzprüfungen benötigt wird

### Strategie 2: Automatische Aktivierung mit Volllizenz (Empfohlen)

**Vorteile:**

- Weniger Code-Änderungen erforderlich als bei Strategie 1
- Beibehaltung der bestehenden Code-Struktur (License-Klassen, Interfaces)
- Einfacheres Rollback möglich
- Bessere Kompatibilität mit n8n-Updates
- Service startet sofort mit allen Features
- **Vollständig offline-fähig, keine Internet-Abhängigkeit**
- **Keine externen Server-Abhängigkeiten** - alles lokal

**Nachteile:**

- Code-Struktur der Lizenz-Klassen bleibt bestehen (aber ohne externe Calls)
- Lokale Mock-Implementierung erforderlich (aber einfacher als vollständige Entfernung)

**Wann verwenden:**

- Wenn minimale Code-Änderungen gewünscht sind
- Wenn Kompatibilität mit bestehenden Lizenzprüfungen wichtig ist
- Wenn einfaches Rollback wichtig ist
- **Wenn vollständig offline-fähige Installation benötigt wird (KEINE Internet-Abhängigkeit)**
- **Empfohlen für die meisten Fälle**

### Empfehlung

**Strategie 2 (Automatische Aktivierung mit Volllizenz)** wird empfohlen, da sie:

- Mit weniger Code-Änderungen umsetzbar ist
- Die bestehende Code-Struktur nutzt (aber ohne externe Server-Calls)
- Einfacher zu warten und zu aktualisieren ist
- Den festen User aus `N8N_FIXED_USER_LOGIN.MD` nahtlos integriert
- **Vollständig offline-fähig ist - keine Internet-Abhängigkeit**
- **Keine externen Server-Abhängigkeiten hat** - alles läuft lokal

### Zusammenfassung: Externe Abhängigkeiten die entfernt werden müssen

Bei **Strategie 2** müssen folgende externe Server-Abhängigkeiten entfernt/ersetzt werden:

1. **LicenseManager SDK Server-URL:**
   - ❌ `server: 'https://license.n8n.io/v1'` in `license.ts`
   - ✅ Ersetzen durch lokale Mock-Implementierung oder Umgehung des SDKs

2. **Community Registration Endpoint:**
   - ❌ `axios.post('https://enterprise.n8n.io/community-registered')` in `license.service.ts`
   - ✅ Ersetzen durch lokale No-Op Funktion

3. **Auto-Renewal:**
   - ❌ `autoRenewEnabled: true` und periodische Renewal-Versuche
   - ✅ Deaktivieren komplett (`autoRenewEnabled: false`)

4. **License Activation Calls:**
   - ❌ `this.license.activate(activationKey)` mit externer Server-Kommunikation
   - ✅ Ersetzen durch lokale Setzung der Lizenz-Werte ohne Server-Call

**Ergebnis:** Vollständig lokale, offline-fähige Installation ohne jegliche Internet-Abhängigkeit.
