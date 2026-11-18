# Use Cases

What Hunt Hub does, for whom, and where each use case lives. Hunt Hub is a hybrid: new and reworked screens are built in the **React web app** (served under `/app`), the others are still **server-rendered** (EJS). Both share one login session and one menu ([`backend/src/shared/managerNav.ts`](../backend/src/shared/managerNav.ts)). Field work happens in the **iPhone app**, GIS editing in **QGIS / QField**.

**Status:** ✅ implemented &nbsp; 🚧 planned &nbsp;&nbsp; **Where:** ⚛️ React app &nbsp; 🖥️ server-rendered &nbsp; 📱 iPhone app &nbsp; 🗺️ QGIS / QField &nbsp; ✉️ email link

---

## Overview by role

### Everyone

| Use case | Status | Where | Details |
|---|---|---|---|
| Log in (email + password) | ✅ | ⚛️ | [Authentication](#authentication) |
| Two-factor login (TOTP, backup codes) for admins | ✅ | ⚛️ | [TOTP / Two-Factor Auth](#totp--two-factor-auth) |
| Activate a new account and set a password | ✅ | ✉️ 🖥️ | [Account Activation](#account-activation) |

### Guests (no account)

| Use case | Status | Where | Details |
|---|---|---|---|
| Answer an invitation to a hunt and upload licence, certificate and contact details (one page) | ✅ | ✉️ ⚛️ | [RSVP – Guest answer page](#rsvp--guest-answer-page-react-app) |

### Admin

| Use case | Status | Where | Details |
|---|---|---|---|
| Manage estates and their managers | ✅ | ⚛️ | [Admin API](#admin-api-trpc) |
| View the audit log | ✅ | ⚛️ | [Admin API](#admin-api-trpc) |
| Manage admins, own account and password | ✅ | ⚛️ | [Admin API](#admin-api-trpc) |

### Manager

| Use case | Status | Where | Details |
|---|---|---|---|
| **Dashboard**: the next hunt with the guests' answers, and a to-do list (documents to check, guests coming without a valid licence, answer-by dates, invitations not sent, broken stands, areas without a boundary), each linking to where it is solved | ✅ | ⚛️ | [Manager – Dashboard](#manager--dashboard-react-app) |
| Manage the estate | ✅ | 🖥️ | [Manager – Estate](#manager--estate) |
| **Manage hunting areas** (list, create, rename, delete, upload boundary file) | ✅ | ⚛️ | [Manager – Areas](#manager--areas-react-app) |
| **See an area on a map** (satellite, OpenTopoMap or OpenStreetMap) with its boundary and stands | ✅ | ⚛️ | [Manager – Areas](#manager--areas-react-app) |
| Manage guests | ✅ | 🖥️ | [Manager – Guests](#manager--guests) |
| **Check guest documents** (licences and certificates): confirm with a corrected date, reject with a reason (the guest is emailed), delete, upload for the guest; a check queue per hunt | ✅ | ⚛️ | [Manager – Document check](#manager--document-check-react-app) |
| Manage guest groups | ✅ | 🖥️ | [Manager – Guest Groups](#manager--guest-groups) |
| **Plan hunts**: events with their drives (start, length, end) | ✅ | ⚛️ | [Manager – Events](#manager--events-react-app) |
| **Invite guests** (single or whole groups), send invitations and reminders by email with a preview, follow the answers | ✅ | ⚛️ | [Manager – Events](#manager--events-react-app) |
| Check a guest's licence and certificate from the event | ✅ | ⚛️ | [Manager – Events](#manager--events-react-app) |
| Manage staff | ✅ | 🖥️ | [Manager – Staff & People](#manager--staff--people) |
| Preview the guests' answer page | ✅ | ⚛️ | [RSVP – Guest answer page](#rsvp--guest-answer-page-react-app) |
| Edit area boundaries and stands in QGIS / QField | ✅ | 🗺️ | [WFS – GIS Integration](#wfs--gis-integration) |
| Own account and password | ✅ | 🖥️ | [Manager – Account Settings](#manager--account-settings) |
| Add, move, rename and delete stands, set nickname and status | ✅ | ⚛️ | [Manager – Areas](#manager--areas-react-app) |
| Choose stands per drive, drive templates (HUN-91) | 🚧 | ⚛️ | planned |

### Manager and staff in the field

| Use case | Status | Where | Details |
|---|---|---|---|
| Log in on the iPhone (stays logged in offline) | ✅ | 📱 | [Mobile App API](#mobile-app-api-trpc) |
| See the estate's areas and stands on a map, offline | ✅ | 📱 | [Mobile App API](#mobile-app-api-trpc) |
| Find a stand in a list (number or nickname), see its details, share its position | ✅ | 📱 | [`mobile/README.md`](../mobile/README.md) |
| Create, rename, move and delete stands and set nickname and status in the field, also offline (managers) | ✅ | 📱 | [Mobile App API](#mobile-app-api-trpc) |
| Download the aerial photo of an area as an offline map; update or delete it | ✅ | 📱 | [`mobile/README.md`](../mobile/README.md#offline-maps) |
| Use imported offline basemaps (.mbtiles) | ✅ | 📱 | [`mobile/README.md`](../mobile/README.md) |
| Edit stands in the field (synced later) | 🚧 | 📱 | planned (sync push handlers) |

Staff have no area in the web app; logging in there shows a hint to use the iPhone app.

---

## Authentication

> The login page is part of the React app (`/app/login`) and talks to the [Auth API](#auth-api-trpc). The server-rendered routes below remain for compatibility.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Redirects: logged out (or staff, guest) → `/app/login`; manager → `/manager`; admin → `/admin` |
| GET | `/login` | Same redirect as `/` (old links keep working) |
| POST | `/login` | Old server-rendered login form (still supported) |
| POST | `/logout` | Destroy session and log out |

---

## TOTP / Two-Factor Auth

> Admin accounts need a second factor. The React app handles it under `/app/totp*` via the [Auth API](#auth-api-trpc). These server-rendered routes still exist but are no longer linked (retirement: HUN-51).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/totp` | Display TOTP verification form |
| POST | `/totp` | Verify TOTP token during login |
| GET | `/totp/setup` | Display TOTP setup page with QR code |
| POST | `/totp/setup` | Save TOTP secret and generate backup codes |
| GET | `/totp/backup-codes` | Display backup codes after setup |
| GET | `/totp/backup-codes/download` | Download backup codes as a text file |
| POST | `/totp/backup-codes/confirm` | Confirm backup codes and complete admin session |
| GET | `/totp/backup` | Display backup code login form |
| POST | `/totp/backup` | Log in using a backup code (recovery) |

---

## Account Activation

> Public. Allows new staff users to activate their account and set a password via a token link.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/activate/:token` | Display account activation form |
| POST | `/activate/:token` | Set password and activate account |

---

## Admin – Server-rendered pages (legacy)

> Requires `requireAdmin`. The admin area has moved to the React app (`/app/admin`, see [Admin API](#admin-api-trpc)); these pages still exist until they are retired (HUN-51).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/` | Admin dashboard |
| POST | `/admin/estates` | Create a new estate |
| GET | `/admin/estates/:id` | View estate details |
| POST | `/admin/estates/:id/rename` | Rename an estate |
| POST | `/admin/estates/:id/delete` | Delete an estate |
| GET | `/admin/account` | Admin account settings |
| POST | `/admin/account/password` | Update admin password |

---

## Manager – Estate

> Requires `requireManager` (re-checks role and active account on every request). Server-rendered.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manager/` | Redirects to the React dashboard (`/app/manager`) |
| GET | `/manager/estate` | Estate overview (areas, staff) |
| POST | `/manager/estate/rename` | Rename the estate |

---

## Manager – Dashboard (React app)

> In the React app (HUN-97), the manager's start page after login. Calls `manager.dashboard.get`; the rules live in [`backend/src/services/dashboard.ts`](../backend/src/services/dashboard.ts). Only data of the manager's own estate.

| Page | Description |
|------|-------------|
| `/app/manager` | The next hunt (today counts as upcoming): date, days to go, start, drives, the guests' answers as a bar, and buttons for the next steps. A to-do list, most urgent first: documents to check, guests coming without a valid licence, answer-by dates coming up, rejected documents waiting for a new upload, invitations not sent, broken stands, areas without a boundary. Each item links to where it is solved; links to the event open the right dialog by themselves (`?open=invite`, `send`, `remind`, `check`). Also: upcoming hunts, areas with stand condition, quick links |

---

## Manager – Areas (React app)

> In the React app. Pages call the [Manager API](#manager-api-trpc). The business logic is shared with the server-rendered area pages in [`backend/src/services/areas.ts`](../backend/src/services/areas.ts).

| Page | Description |
|------|-------------|
| `/app/manager/areas` | List of areas: name, number of stands, boundary status; create a new area |
| `/app/manager/areas/:id` | Full-page map: base map menu (satellite by default), legend with stands and boundary on/off, whole-area and zoom buttons, stands panel with search (click flies to the stand). "Edit stands": add (button or right-click; without a number the stand becomes NOT-NAMED-n), drag to move with confirmation, change number, nickname and status, delete. Settings window: boundary inverted or line only (saved in the browser), rename, upload, replace or remove the boundary file (GeoJSON, KML, GPX, Shapefile zip, GeoPackage; max 20 MB; any coordinate system is converted to WGS 84, with an optional EPSG code for files that don't state theirs), delete in a danger zone with name confirmation |

The old server-rendered area pages still exist until they are retired (HUN-49):

| Method | Path | Description |
|--------|------|-------------|
| POST | `/manager/areas` | Create a new hunting area |
| GET | `/manager/areas/:id` | View area details |
| POST | `/manager/areas/:id/rename` | Rename an area |
| POST | `/manager/areas/:id/delete` | Delete an area (name confirmation) |
| POST | `/manager/areas/:id/geofile` | Upload a boundary file |
| POST | `/manager/areas/:id/geofile/delete` | Remove the boundary |

---

## Manager – Guests

> Requires `requireManager`. Full CRUD for guests and their group membership.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manager/guests` | List all guests |
| GET | `/manager/guests/new` | Display new guest form |
| POST | `/manager/guests` | Create a new guest |
| GET | `/manager/guests/:id` | View guest details |
| POST | `/manager/guests/:id/update` | Update guest information |
| POST | `/manager/guests/:id/delete` | Delete a guest |
| POST | `/manager/guests/:id/add-to-group` | Add guest to a group |
| POST | `/manager/guests/:id/remove-from-group/:groupId` | Remove guest from a group |

---

## Manager – Document check (React app)

> In the React app (HUN-95). Calls `manager.documents.*`; the rules live in [`backend/src/services/guestDocuments.ts`](../backend/src/services/guestDocuments.ts). Only guests of the manager's own estate.

| Page | Description |
|------|-------------|
| `/app/manager/guests/:guestId/documents` | The guest's licence and certificate. The photo (zoom, rotate) or PDF next to the guest's name and date of birth, the date on the document, whether it is valid on the hunt day and how long it is still valid. Confirm (with the date corrected if needed), reject with a reason, delete, or upload a document for the guest (counts as checked) |
| Event page, guests tab, "Check documents" | The same tool as a check queue: all unchecked documents of the hunt, one after the other (`?open=check`) |

Rejecting removes the document and its files, emails the guest the reason with the link to their answer page, and shows "rejected, waiting for a new upload" in the guest list and on the dashboard. The answer page shows the reason.

Old addresses redirect: `GET /manager/guests/:id/hunting-license` and `/training-certificate` → the check tool with `?kind=licence` or `?kind=certificate`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/manager/guests/:id/hunting-license` | Upload hunting licence files from the server-rendered guest page (up to 4) |
| POST | `/manager/guests/:id/training-certificate` | Upload training certificate files from the server-rendered guest page (up to 2) |
| GET | `/manager/files/*` | Serve uploaded document files (only the manager's own estate) |

---

## Manager – Guest Groups

> Requires `requireManager`. Organise guests into named groups.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manager/guest-groups` | List all guest groups |
| POST | `/manager/guest-groups` | Create a new group |
| GET | `/manager/guest-groups/:id` | View group details |
| POST | `/manager/guest-groups/:id/rename` | Rename a group |
| POST | `/manager/guest-groups/:id/delete` | Delete a group |
| POST | `/manager/guest-groups/:id/members` | Add a guest to the group |
| POST | `/manager/guest-groups/:id/members/:userId/remove` | Remove a guest from the group |

---

## Manager – Events (React app)

> In the React app (HUN-86). Pages call the [Manager API](#manager-api-trpc); the rules live in [`backend/src/services/events.ts`](../backend/src/services/events.ts), [`invitations.ts`](../backend/src/services/invitations.ts) and [`guestDocuments.ts`](../backend/src/services/guestDocuments.ts).

| Page | Description |
|------|-------------|
| `/app/manager/events` | Upcoming hunts (today included) and past ones, each with date, start, number of drives and the guests' answers (coming, not coming, no answer, not sent). "New event": name and date |
| `/app/manager/events/:id` | One hunt with tabs (kept in the URL, `?tab=`): **Guests**, **Drives**, **Details** |
| Guests tab | Filters by answer with counts; guest list with invitation state, answer, licence and certificate state; select several to set the answer or invitation state, or remove them (warns about links already sent). "Invite guests": side panel with search and whole groups. "Send invitations" / "Remind": dialog with message, answer-by date, recipients, live email preview and the result per guest. A guest's drawer: answer, contact details, licence and certificate with files, "Mark as checked" |
| Drives tab | Every hunt has at least one drive. A new event gets "Drive 1" (09:00 / 2 h the first time, afterwards like the first drive of the last event); new drives are "Drive 2", "Drive 3", … and their time list opens at the next full hour after the previous drive. Start (15-minute steps), length in hours (30-minute steps), end shown; the hunt's start is its first drive's start |
| Details tab | Name and date; delete the hunt with its drives and invitations (warns when invitation links were already sent) |

Old addresses redirect to these pages: `/manager/events` → `/app/manager/events`, `/manager/events/:id` → `/app/manager/events/:id`, `/manager/events/:id/drives/:driveId` → `…?tab=drives`, `/manager/events/:id/invitations…` → `…?tab=guests`. The old form handlers for creating, changing and deleting events and drives were removed; this goes through the API above.

---

## Manager – Staff & People

> Requires `requireManager`. Manage staff user accounts.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manager/people` | List all staff members |
| POST | `/manager/people` | Create a new staff user |
| GET | `/manager/people/:id` | View staff user details |
| POST | `/manager/people/:id/role` | Update user's role |
| POST | `/manager/people/:id/delete` | Delete a staff user |
| POST | `/manager/people/:id/deactivate` | Deactivate a staff user |
| POST | `/manager/people/:id/reactivate` | Reactivate a staff user |
| POST | `/manager/people/:id/resend-activation` | Resend activation email |

---

## Manager – Account Settings

> Requires `requireManager`. Manage the manager's own account.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manager/account` | Display manager account settings |
| POST | `/manager/account/password` | Update manager password |

---

## RSVP – Guest answer page (React app)

> Public: the invitation's id in the email link is the only key (no account). In the React app (HUN-90); the rules live in [`backend/src/services/rsvp.ts`](../backend/src/services/rsvp.ts).

| Page | Description |
|------|-------------|
| `/app/rsvp/:publicId` | One page: the hunt with date, start and drives; "I'm coming" / "I can't come" (can be changed until the answer-by date). After "I'm coming": hunting licence, training certificate and contact on the hunt day, each saved on its own; documents on file are shown as checked or to be checked; a rejected document shows the manager's reason. Answers are refused for invitations never sent, archived ones, past hunts and passed answer-by dates |
| `/app/rsvp/preview/:eventId` | For managers: the same page for an example guest; nothing is saved |

`/rsvp/:publicId` (the address in invitation emails, also in emails sent before the move) and `/rsvp/preview/:eventId` redirect to these pages. The link's id is redacted in the logs.

---

## Interactive Map

> Requires `requireAuth`. Provides map layer configuration and geospatial data for hunting areas.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/map/layers` | Get map layer configuration |
| GET | `/map/area/:id` | Get geospatial data for a specific area |

---

## Auth API (tRPC)

> Mounted under `/api/v1/trpc`, used by the React app. Session cookie based. Login and the two-factor checks are rate-limited like the old forms (every call in a batch counts).

| Procedure | Type | Description |
|-----------|------|-------------|
| `auth.me` | query | Current user or `null` |
| `auth.login` | mutation | Email + password; admins continue with two-factor login |
| `auth.checkPendingTotp` | query | Whether a pending admin login needs TOTP setup or verification |
| `auth.beginTotpSetup` / `auth.confirmTotpSetup` | mutation | Set up TOTP (QR code) |
| `auth.verifyTotp` | mutation | Verify a TOTP code |
| `auth.getBackupCodes` / `auth.confirmBackupCodesSaved` | query / mutation | Backup codes after setup |
| `auth.useBackupCode` | mutation | Log in with a backup code |
| `auth.logout` | mutation | Log out |

---

## Admin API (tRPC)

> `adminProcedure`: admins only. Used by the React admin area (`/app/admin`).

| Procedure | Description |
|-----------|-------------|
| `admin.estates.list` / `get` / `create` / `rename` / `delete` / `addManager` | Estates and adding their first manager |
| `admin.managers.get` / `deactivate` / `sendActivationLink` / `delete` | Manage managers |
| `admin.audit.list` | Audit log (paginated) |
| `admin.settings.listAdmins` / `createAdmin` | Admin accounts |
| `admin.account.get` / `changePassword` | Own account |

---

## Manager API (tRPC)

> `managerProcedure`: re-reads role, active flag and estate from the database on every call; every query is limited to the manager's own estate. Used by the React manager pages.

| Procedure | Type | Description |
|-----------|------|-------------|
| `manager.estate.get` | query | Own estate with number of areas |
| `manager.areas.list` | query | Areas sorted by name, with stand count and boundary status |
| `manager.areas.get` | query | One area with boundary and stands (GeoJSON, nickname, status with date), stands in natural order |
| `manager.areas.create` / `rename` | mutation | Create or rename an area |
| `manager.areas.delete` | mutation | Delete an area and its stands; requires the area's name as confirmation |
| `manager.areas.uploadBoundary` | mutation | FormData (`areaId`, `file`, optional `crs` as EPSG code), max 20 MB; parsed in a worker thread; any coordinate system PostGIS knows is converted to WGS 84 |
| `manager.areas.clearBoundary` | mutation | Remove the boundary |
| `manager.stands.create` | mutation | New stand at a position; without a number it gets the next `NOT-NAMED-n`; reports `outsideArea` |
| `manager.stands.rename` / `move` / `delete` | mutation | Change the number (once per area), the position, or delete the stand |
| `manager.stands.update` | mutation | Nickname and status (`ok`, `needs_repair`, `broken`, `removed`) with date; a changed status gets today's date |

Errors: unknown or foreign areas → `NOT_FOUND`, invalid input or wrong confirmation → `BAD_REQUEST`.

**Events, drives and invitations**

| Procedure | Type | Description |
|-----------|------|-------------|
| `manager.events.list` | query | Upcoming (today included) and past events with guest counts |
| `manager.events.get` | query | One event with its drives, guest counts, the next drive's suggested start and how many invitation links were sent |
| `manager.events.defaultStart` | query | The start a new event will get |
| `manager.events.create` / `update` / `delete` | mutation | Create (with Drive 1), rename or move to another date, delete |
| `manager.drives.create` / `update` / `delete` | mutation | Drives with start and length in minutes; must end before midnight; the last drive can't be deleted |
| `manager.invitations.list` | query | Guest list with groups, invitation state, answer, licence and certificate state |
| `manager.invitations.get` | query | One invitation with contact details and the guest's documents and files |
| `manager.invitations.searchGuests` | query | Guests not invited yet (name or group) and the estate's groups with how many can still be invited |
| `manager.invitations.add` | mutation | Add guests and whole groups (not sent yet) |
| `manager.invitations.update` / `remove` | mutation | Set answer or invitation state of several invitations; remove them (reports links already sent) |
| `manager.invitations.preview` | query | The email for an example guest (subject and HTML) |
| `manager.invitations.send` | mutation | `kind: invitation` (not sent yet) or `reminder` (sent, no answer yet); a few at a time; sent and failed per guest. Names and message are escaped |
| `manager.invitations.checkDocument` | mutation | Mark the guest's licence or certificate as checked; older ones are deleted with their files |

**Dashboard and document check**

| Procedure | Type | Description |
|-----------|------|-------------|
| `manager.dashboard.get` | query | The next hunt, upcoming hunts, the to-do list (each with a code, numbers and a link target; the text is built in the browser), areas with stand condition |
| `manager.documents.get` | query | The guest (name, date of birth) and their documents with files, judged for the hunt's date if an event is given |
| `manager.documents.confirm` | mutation | Confirm a document, optionally with the date corrected |
| `manager.documents.reject` | mutation | Reject with a reason: the document and its files go, the guest is emailed if they have an open invitation |
| `manager.documents.delete` | mutation | Delete a document and its files |
| `manager.documents.upload` | mutation | FormData (`guestId`, `kind`, `date`, files): the manager uploads for the guest; counts as checked |

## RSVP API (tRPC)

> Public, used by the guests' answer page. Every procedure takes the invitation's `publicId`. Rate-limited per call (`middlewares/trpcAuthLimits.ts`).

| Procedure | Type | Description |
|-----------|------|-------------|
| `rsvp.open` | mutation | The page's content; records the first visit. A mutation so the id is not in a request URL |
| `rsvp.respond` | mutation | `yes` or `no` |
| `rsvp.uploadLicence` / `uploadCertificate` | mutation | FormData (`publicId`, date, `files`): one PDF or up to 4 (licence) / 2 (certificate) photos, 10 MB each; expiry date not in the past, issue date not in the future |
| `rsvp.saveDetails` | mutation | Phone and date of birth |
| `rsvp.preview` | query | Managers only: the page for an example guest |

---

## Mobile App API (tRPC)

> Used by the iOS app in `mobile/`. Mounted under `/api/v1/trpc`. Authenticates with `Authorization: Bearer <access token>` from a mobile session (not the session cookie). Only `manager` and `staff` can use it; data is scoped to the user's estate.

| Procedure | Type | Description |
|-----------|------|-------------|
| `mobile.auth.login` | mutation | Email + password → access token (1 h) and refresh token (60 days, extended on use). Same lockout rules and rate limit as the web login |
| `mobile.auth.refresh` | mutation | Rotates the token pair. The previous refresh token stays valid until the new pair is used, so a lost response doesn't log the user out |
| `mobile.auth.me` | query | Current user |
| `mobile.auth.logout` | mutation | Revokes the mobile session |
| `mobile.sync.pull` | query | Without `cursor`: all areas (GeoJSON) and stands (number, position, nickname, status with date). With `cursor`: rows changed since then plus deletions (`sync_tombstones`). Returns the next cursor |
| `mobile.sync.push` | mutation | Applies queued offline changes in order. Each has a client UUID, so retries are applied only once. Handlers live in `backend/src/sync/handlers/`: `stand.create`, `stand.rename`, `stand.move`, `stand.update` (nickname and status), `stand.delete`; managers only |

`areas.updated_at` / `stands.updated_at` are maintained by database triggers, and deletes are recorded by triggers too (migration `0011_mobile_sync`), so changes made through the manager UI or WFS-T reach the app automatically.

---

## WFS – GIS Integration

Step-by-step guide for managers, and the code: [backend/src/qgis/](../backend/src/qgis/README.md).

> Token-authenticated (`?token=`). OGC WFS-T 1.1.0 endpoint for QGIS and QField. The token is scoped to a user and estate and is managed on the manager's account page (`/manager/account`).
>
> All requests go to `/wfs` — the `REQUEST` query parameter selects the operation.

### Feature types

Each area exposes two feature types:

| Type name | Operations | Description |
|-----------|-----------|-------------|
| `area_<id>` | Query, Update | The area boundary polygon (MultiPolygon) |
| `stands_<id>` | Query, Insert, Update, Delete | Stand points within that area |

### GET operations

| Method | Path | REQUEST param | Description |
|--------|------|---------------|-------------|
| GET | `/wfs` | `GetCapabilities` | List all feature types for the estate |
| GET | `/wfs` | `DescribeFeatureType` | Return XSD schema for a given type name |
| GET | `/wfs` | `GetFeature` | Return features for a given type name |

### Transactions (POST)

| Method | Path | Operation | Description |
|--------|------|-----------|-------------|
| POST | `/wfs` | `Insert` | Create a new stand (point geometry + number required) |
| POST | `/wfs` | `Update` | Update an area boundary or stand position / number |
| POST | `/wfs` | `Delete` | Delete a stand |

**Notes:**
- Creating or deleting areas via WFS-T is blocked — use the web interface.
- Inserting a stand outside the area boundary is rejected unless `force_outside_area` is set to `1`.
- Stand numbers must be unique within an area.
- The server returns `<wfs:InsertResults>` after Insert so QGIS/QField shows the new stand immediately without a manual layer refresh.

---

## Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | 200 `{"status":"ok","checks":{"database":"ok"},"commit":"…"}` when the database answers, otherwise 503. Used by Render, Docker and CI. Not logged, no session |
