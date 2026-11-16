import express, { Express } from 'express';
import fs from 'fs';
import path from 'path';

export const WEB_APP_BASE_PATH = '/app';

/** Where the built React app (`npm run build` in web/) is found. */
export function resolveWebDistDir(): string {
  return process.env.WEB_DIST_DIR ?? path.join(process.cwd(), '..', 'web', 'dist');
}

/**
 * Serves the React single-page app under /app, next to the server-rendered
 * pages. Hashed asset files are cached for a long time; index.html is never
 * cached, so a new deploy is picked up on the next page load. Any unknown
 * path under /app returns index.html, so deep links like /app/manager/areas/3
 * survive a page reload (the React router takes over in the browser).
 *
 * Does nothing when the build is missing, e.g. in development where Vite
 * serves the app itself.
 */
export function serveWebApp(app: Express, distDir: string = resolveWebDistDir()): void {
  const indexHtml = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtml)) return;

  app.use(
    WEB_APP_BASE_PATH,
    express.static(distDir, {
      index: false,
      redirect: false,
      setHeaders: (res, filePath) => {
        const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader('Cache-Control', isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );

  app.get([WEB_APP_BASE_PATH, `${WEB_APP_BASE_PATH}/*`], (req, res, next) => {
    // Requests for files (anything with an extension) that static didn't find
    // are real 404s, not app routes: never answer them with HTML.
    if (path.extname(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}
