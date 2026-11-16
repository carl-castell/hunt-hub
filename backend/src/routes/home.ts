import express, { Router, Request, Response } from "express";
import { redirectByRole } from "@/utils/redirectByRole";

const homeRouter: Router = express.Router();

// Hunt Hub is an internal tool: the start page sends everyone straight to
// their home page, or to the login.
homeRouter.get("/", (req: Request, res: Response) => {
  redirectByRole(req, res);
});

export default homeRouter;
