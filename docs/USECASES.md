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
| Respond to an event invitation and upload documents | ✅ | ✉️ 🖥️ | [RSVP – Guest Response](#rsvp--guest-response) |

### Admin

| Use case | Status | Where | Details |
|---|---|---|---|
| Manage estates and their managers | ✅ | ⚛️ | [Admin API](#admin-api-trpc) |
| View the audit log | ✅ | ⚛️ | [Admin API](#admin-api-trpc) |
| Manage admins, own account and password | ✅ | ⚛️ | [Admin API](#admin-api-trpc) |

### Manager

| Use case | Status | Where | Details |
|---|---|---|---|
| Dashboard | ✅ | 🖥️ | [Manager – Estate](#manager--estate) |
| Manage the estate | ✅ | 🖥️ | [Manager – Estate](#manager--estate) |
| **Manage hunting areas** (list, create, rename, delete, upload boundary file) | ✅ | ⚛️ | [Manager – Areas](#manager--areas-react-app) |
| **See an area on a map** (satellite, OpenTopoMap or OpenStreetMap) with its boundary and stands | ✅ | ⚛️ | [Manager – Areas](#manager--areas-react-app) |
| Manage guests | ✅ | 🖥️ | [Manager – Guests](#manager--guests) |
| Verify guest documents (licences & certificates) | ✅ | 🖥️ | [Manager – Document Verification](#manager--document-verification) |
| Manage guest groups | ✅ | 🖥️ | [Manager – Guest Groups](#manager--guest-groups) |
| Manage hunting events | ✅ | 🖥️ | [Manager – Events](#manager--events) |
| Invite guests to events (email, status tracking) | ✅ | 🖥️ | [Manager – Invitations](#manager--invitations) |
| Manage drives per event | ✅ | 🖥️ | [Manager – Drives](#manager--drives) |
| Manage staff | ✅ | 🖥️ | [Manager – Staff & People](#manager--staff--people) |
| Preview the RSVP form | ✅ | 🖥️ | [RSVP – Manager Preview](#rsvp--manager-preview) |
| Edit area boundaries and stands in QGIS / QField | ✅ | 🗺️ | [WFS – GIS Integration](#wfs--gis-integration) |
| Own account and password | ✅ | 🖥️ | [Manager – Account Settings](#manager--account-settings) |
| Move stands in the web app | 🚧 | ⚛️ | planned |

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
| GET | `/manager/` | Manager dashboard |
| GET | `/manager/estate` | Estate overview (areas, staff) |
| POST | `/manager/estate/rename` | Rename the estate |

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

## Manager – Document Verification

> Requires `requireManager`. Manage and verify hunting licenses and training certificates per guest.

### Hunting License

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manager/guests/:id/hunting-license` | View guest's hunting license |
| POST | `/manager/guests/:id/hunting-license` | Upload hunting license files (up to 4) |
| POST | `/manager/guests/:id/hunting-license/check` | Mark hunting license as verified |
| POST | `/manager/guests/:id/hunting-license/update` | Update hunting license details |
| POST | `/manager/guests/:id/hunting-license/delete` | Delete hunting license |

### Training Certificate

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manager/guests/:id/training-certificate` | View guest's training certificate |
| POST | `/manager/guests/:id/training-certificate` | Upload training certificate files (up to 2) |
| POST | `/manager/guests/:id/training-certificate/check` | Mark training certificate as verified |
| POST | `/manager/guests/:id/training-certificate/update` | Update training certificate details |
| POST | `/manager/guests/:id/training-certificate/delete` | Delete training certificate |

### File Access

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manager/files/*` | Serve uploaded document files |

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

## Manager – Events

> Requires `requireManager`. Create and manage hunting events.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manager/events` | List all events |
| POST | `/manager/events` | Create a new event |
| GET | `/manager/events/:id` | View event details |
| POST | `/manager/events/:id/update` | Update event details |
| POST | `/manager/events/:id/delete` | Delete an event |

---

## Manager – Invitations

> Requires `requireManager`. Invite guests to events and manage their invitation status.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manager/events/:eventId/invitations` | List invitations for an event |
| GET | `/manager/events/:eventId/invitations/new` | Select guests to invite |
| POST | `/manager/events/:eventId/invitations` | Stage invitations for sending |
| GET | `/manager/events/:eventId/invitations/send` | Review staged invitations before sending |
| POST | `/manager/events/:eventId/invitations/send` | Send staged invitations |
| GET | `/manager/events/:eventId/invitations/preview` | Preview the invitation email/page |
| GET | `/manager/events/:eventId/invitations/:invitationId` | View a specific invitation |
| POST | `/manager/events/:eventId/invitations/:invitationId/update` | Update invitation status or response |
| POST | `/manager/events/:eventId/invitations/:invitationId/remove` | Cancel / remove an invitation |

---

## Manager – Drives

> Requires `requireManager`. Manage drives (sub-hunts) within an event.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/manager/events/:eventId/drives` | Create a drive for an event |
| GET | `/manager/events/:eventId/drives/:id` | View drive details |

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

## RSVP – Guest Response

> Public. Guests use a unique link to view and respond to their event invitation, and upload required documents.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rsvp/:publicId` | Display the RSVP form |
| POST | `/rsvp/:publicId/respond` | Submit RSVP response (accept / decline) |
| POST | `/rsvp/:publicId/upload/license` | Upload hunting license files (up to 4) |
| POST | `/rsvp/:publicId/upload/certificate` | Upload training certificate files (up to 2) |
| POST | `/rsvp/:publicId/upload/details` | Upload additional guest details |

---

## RSVP – Manager Preview

> Requires `requireManager`. Allows managers to preview and test the RSVP flow for an event.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rsvp/preview/:eventId` | Preview the RSVP form as a manager |
| POST | `/rsvp/preview/:eventId/respond` | Test RSVP response submission |
| POST | `/rsvp/preview/:eventId/upload/license` | Test hunting license upload |
| POST | `/rsvp/preview/:eventId/upload/certificate` | Test training certificate upload |
| POST | `/rsvp/preview/:eventId/upload/details` | Test details upload |

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

> Token-authenticated (`?token=`). OGC WFS-T 1.1.0 endpoint for QGIS and QField. The token is scoped to a user and estate and is managed via the manager dashboard.
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
