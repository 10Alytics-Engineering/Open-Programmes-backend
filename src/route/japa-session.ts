import { registerForJapaSession } from "../controllers/japa-session";
import express from "express";

export default (router: express.Router) => {
  router.post("/japa-session/register", registerForJapaSession);
};
