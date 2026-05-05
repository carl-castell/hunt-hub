# Use Cases

**Status legend:** ✅ Implemented &nbsp;&nbsp; 🚧 Not implemented

---

## Public / Unauthenticated

- ✅ Login — [Authentication](#authentication)
- ✅ Set up & verify two-factor authentication — [TOTP / Two-Factor Auth](#totp--two-factor-auth)
- ✅ Activate a new account — [Account Activation](#account-activation)
- ✅ Respond to an event invitation — [RSVP – Guest Response](#rsvp--guest-response)

---

## Admin

- ✅ Manage platform estates — [Admin – Estate Management](#admin--estate-management)
- ✅ Manage admin account & password — [Admin – Account Settings](#admin--account-settings)

---

## Manager

- ✅ Manage estate & hunting areas — [Manager – Estate & Areas](#manager--estate--areas)
- ✅ Manage guests — [Manager – Guests](#manager--guests)
- ✅ Verify guest documents (licenses & certificates) — [Manager – Document Verification](#manager--document-verification)
- ✅ Manage guest groups — [Manager – Guest Groups](#manager--guest-groups)
- ✅ Manage hunting events — [Manager – Events](#manager--events)
- ✅ Manage event invitations — [Manager – Invitations](#manager--invitations)
- ✅ Manage drives per event — [Manager – Drives](#manager--drives)
- ✅ Manage staff / people — [Manager – Staff & People](#manager--staff--people)
- ✅ Preview RSVP form — [RSVP – Manager Preview](#rsvp--manager-preview)
- ✅ View interactive map — [Interactive Map](#interactive-map)
- ✅ Edit areas and stands in QGIS / QField — [WFS – GIS Integration](#wfs--gis-integration)
- ✅ Manage manager account & password — [Manager – Account Settings](#manager--account-settings)

---

---

## Authentication

> Public. Handles user login and logout.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/login` | Display login form |
| POST | `/login` | Process login with email & password |
| POST | `/logout` | Destroy session and log out |

---

## TOTP / Two-Factor Auth

> Public (session-gated). Handles TOTP setup and verification for admin accounts.

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

## Admin – Estate Management

> Requires `requireAdmin`. Manage the top-level estates on the platform.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/` | Admin dashboard |
| POST | `/admin/estates` | Create a new estate |
| GET | `/admin/estates/:id` | View estate details |
| POST | `/admin/estates/:id/rename` | Rename an estate |
| POST | `/admin/estates/:id/delete` | Delete an estate |

---

## Admin – Account Settings

> Requires `requireAdmin`. Manage the admin user's own account.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/account` | Display admin account settings |
| POST | `/admin/account/password` | Update admin password |

---

## Manager – Estate & Areas

> Requires `requireManager`. Manage the estate and its hunting areas, including geospatial file uploads.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manager/` | Manager dashboard |
| GET | `/manager/estate` | View estate overview |
| POST | `/manager/estate/rename` | Rename the estate |
| POST | `/manager/areas` | Create a new hunting area |
| GET | `/manager/areas/:id` | View area details |
| POST | `/manager/areas/:id/rename` | Rename an area |
| POST | `/manager/areas/:id/delete` | Delete an area |
| POST | `/manager/areas/:id/geofile` | Upload a geospatial file for an area |
| POST | `/manager/areas/:id/geofile/delete` | Delete the geospatial file for an area |

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

## WFS – GIS Integration

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
