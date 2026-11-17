# Hunt Hub in QGIS

Estate managers can work with their areas and stands in **QGIS**, next to their other forestry data. Changes are saved straight to Hunt Hub: they show up on the website map and, after the next sync, in the iPhone app.

**What you can do in QGIS**

| | Area boundary | Stands |
|---|---|---|
| See on the map | ✅ | ✅ |
| Add | ✅ (only if the area has no boundary yet) | ✅ |
| Move / change | ✅ | ✅ (position and number) |
| Delete | – | ✅ |

New areas are created in the web app, not in QGIS.

**You need:** QGIS 3.28 or newer, internet, and a **manager** account in Hunt Hub.

---

## 1. Get your QGIS key

1. Log in to Hunt Hub (live: https://hunt-hub-docker.onrender.com).
2. In the menu, open **Account**.
3. In the QGIS section, click **Generate token**.
4. **Copy the link** shown below the key. It looks like this:
   ```
   https://hunt-hub-docker.onrender.com/wfs?token=…
   ```
   The full key is shown only once. Treat the link like a password: anyone who has it can change your stands.

## 2. Connect QGIS

1. In QGIS: **Layer → Add Layer → Add WFS / OGC API – Features Layer…**
2. Click **New** and fill in:
   - **Name:** Hunt Hub
   - **URL:** the link from step 1
   - **Version:** 1.1
   - User name and password: leave empty (the key is in the link)
3. Click **OK**, then **Connect**.
4. You see two layers per area:
   - **the area's name**: the boundary
   - **"Stands – area name"**: the stands

   Select the layers you need and click **Add**.
5. Optional, for orientation: add a background map (Browser panel → **XYZ Tiles → OpenStreetMap**) and drag it below the Hunt Hub layers.

**Check:** the boundary sits in the right place. If the layers appear far away (for example in the ocean near Africa), the coordinate order is swapped: remove the layers, edit the connection, tick **Invert axis orientation**, and add them again.

The free live server sleeps when nobody uses it. The first connection can take up to a minute.

## 3. Work with stands

Select the layer **"Stands – area name"** and click the **pencil** (Toggle Editing). Then:

| To… | Do this |
|---|---|
| **Add a stand** | **Add Point Feature**, click inside the boundary, enter a **number** (e.g. `1`, `2`, `12a`) |
| **Move a stand** | **Vertex Tool**, drag the point |
| **Change a number** | Open the attribute table (F6) and edit the number |
| **Delete a stand** | Select it, then **Delete Selected** |

**Then click Save Layer Edits** (the disk icon next to the pencil). Nothing is sent to Hunt Hub before you save.

Rules:
- Each stand number may exist **only once per area**.
- A stand must lie **inside the area boundary**. To place one outside on purpose, enter `1` in the field `force_outside_area`.
- A stand belongs to the area whose layer you add it to.

## 4. Check the result

- **Website:** Areas → your area. The stands are on the satellite map.
- **iPhone app:** pull down on the area list to sync, then open the area. The stands appear as numbered circles; the **#** button shows or hides them. After a sync they stay visible without signal.

## Security

- The key only gives access to **your own estate**.
- If the link was shared by mistake, open **Account** and click **Regenerate token** (the old link stops working at once) or **Delete token**.

## Problems

| What you see | What to do |
|---|---|
| "Invalid or inactive token" | The key was regenerated or deleted, or your account is inactive. Generate a new key and update the connection's URL. |
| Layers appear in the wrong place | Tick **Invert axis orientation** in the connection (see step 2). |
| Error when saving a new stand | The number already exists in this area, or the stand is outside the boundary. |
| QGIS waits a long time on Connect | The live server is starting up. Wait a minute and try again. |

---

## For developers

QGIS talks to Hunt Hub through the standard **OGC WFS-T 1.1.0** interface at `/wfs`. Nothing has to be installed in QGIS.

| File | What it does |
|---|---|
| `router.ts` | `GET /wfs` (read) and `POST /wfs` (transactions), mounted in `src/app.ts` |
| `requireWfsAuth.ts` | Checks the key (`?token=` or `Authorization: Bearer`): active **manager** with an estate. Sets `req.wfsUser` |
| `controller.ts` | `GetCapabilities`, `DescribeFeatureType`, `GetFeature` and `Transaction` (Insert / Update / Delete), GML ↔ PostGIS |

- **Feature types:** `area_<id>` (MultiPolygon boundary) and `stands_<id>` (points with `number` and `force_outside_area`), only for the key owner's estate. Coordinates in EPSG:4326.
- **Keys** are created on the manager Account page (`src/controllers/manager/account.ts`) and stored in `accounts.wfs_token`.
- **iPhone sync:** database triggers update `updated_at` and record deletions (migration `0011_mobile_sync`), so QGIS changes reach the app with the next sync without any extra code.
- **Tests:** `src/tests/integration/wfs.test.ts` (whole flow against PostGIS), `src/tests/unit/controllers/wfs.test.ts`, `src/tests/unit/middleware/wfs-auth.test.ts`.
- **Try it without QGIS:**
  ```
  curl "http://localhost:3000/wfs?SERVICE=WFS&REQUEST=GetCapabilities&token=<key>"
  ```
