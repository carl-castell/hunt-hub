import express, { Router, Request, Response } from "express";

const homeRouter: Router = express.Router();

homeRouter.get("/", (req: Request, res: Response) => {
  res.render("home", { 
    layout: false,
    title: "Hunt-Hub"
   });
});

export default homeRouter;
