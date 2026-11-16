import { Request, Response } from 'express';
import {
  AreaNotFoundError, DeleteConfirmationError, GeofileRejectedError, findAreaInEstate, getAreaWithBoundary,
  createArea, renameArea, deleteArea, clearAreaBoundary, setAreaBoundaryFromFile,
} from '@/services/areas';
import { logError } from '@/utils/logError';
import { areaNameSchema, deleteConfirmSchema } from '@/schemas';


// ── Errors ───────────────────────────────────────────────────────────────────

/** Turns errors from the areas service into HTTP responses for these pages. */
function respondWithError(res: Response, err: unknown) {
  if (err instanceof AreaNotFoundError) return res.status(404).send(err.message);
  if (err instanceof DeleteConfirmationError) return res.status(400).send(err.message);
  if (err instanceof GeofileRejectedError) return res.status(err.status).send(err.message);
  logError('[error]', err);
  return res.status(500).send('Server error');
}

// ── Get Area ─────────────────────────────────────────────────────────────────

export async function getArea(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const area = await getAreaWithBoundary(user.estateId!, Number(id));

    const breadcrumbs = [
      { label: 'Estate', href: '/manager/estate' },
      { label: area.name },
    ];
    res.render('manager/estate/area', { title: area.name, user, area: { ...area, geofile: area.boundaryGeoJson }, breadcrumbs });
  } catch (err) {
    respondWithError(res, err);
  }
}

// ── Create Area ───────────────────────────────────────────────────────────────

export async function postCreateArea(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const result = areaNameSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    const area = await createArea(user.estateId!, result.data.name);
    res.redirect(`/manager/areas/${area.id}`);
  } catch (err) {
    respondWithError(res, err);
  }
}

// ── Rename Area ───────────────────────────────────────────────────────────────

export async function postRenameArea(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const result = areaNameSchema.safeParse(req.body);
    if (!result.success) {
      // Unknown or foreign areas stay 404, even with an invalid name.
      if (!(await findAreaInEstate(user.estateId!, Number(id)))) throw new AreaNotFoundError();
      return res.status(400).send(result.error.issues[0].message);
    }

    await renameArea(user.estateId!, Number(id), result.data.name);
    res.redirect(`/manager/areas/${id}`);
  } catch (err) {
    respondWithError(res, err);
  }
}

// ── Delete Area ───────────────────────────────────────────────────────────────

export async function postDeleteArea(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const result = deleteConfirmSchema.safeParse(req.body);
    const confirmName = result.success ? result.data.confirm : '';

    await deleteArea(user.estateId!, Number(id), confirmName, { userId: user.id, ip: req.ip });
    res.redirect('/manager/estate');
  } catch (err) {
    respondWithError(res, err);
  }
}

// ── Upload / Replace Geo File ─────────────────────────────────────────────────

export async function postUploadGeofile(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    if (!req.file) {
      // Unknown or foreign areas stay 404, even without a file.
      if (!(await findAreaInEstate(user.estateId!, Number(id)))) throw new AreaNotFoundError();
      return res.status(400).send('No file uploaded');
    }

    await setAreaBoundaryFromFile(
      user.estateId!,
      Number(id),
      { buffer: req.file.buffer, filename: req.file.originalname },
      { userId: user.id, ip: req.ip },
    );
    res.redirect(`/manager/areas/${id}`);
  } catch (err) {
    respondWithError(res, err);
  }
}

// ── Delete Geo File ───────────────────────────────────────────────────────────

export async function postDeleteGeofile(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    await clearAreaBoundary(user.estateId!, Number(id), { userId: user.id, ip: req.ip });
    res.redirect(`/manager/areas/${id}`);
  } catch (err) {
    respondWithError(res, err);
  }
}
