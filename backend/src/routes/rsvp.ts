import { Router } from 'express';

/**
 * The guest's answer page lives in the React app (HUN-90). Links in emails
 * point here (/rsvp/<id>), so emails already sent keep working; they are sent
 * on to the React page. The manager's preview moves the same way.
 */
const rsvpRouter = Router();

rsvpRouter.get('/preview/:eventId(\\d+)', (req, res) => res.redirect(`/app/rsvp/preview/${req.params.eventId}`));
rsvpRouter.get('/:publicId', (req, res) => res.redirect(`/app/rsvp/${encodeURIComponent(req.params.publicId)}`));

export default rsvpRouter;
