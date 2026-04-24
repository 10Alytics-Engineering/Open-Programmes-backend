import { registerAiAutomation, registerGenerativeAiData } from "../controllers/webinar";
import express from "express";

export default (router: express.Router) => {
  router.post("/webinar/ai-automation", registerAiAutomation);
  router.post("/webinar/generative-ai-data", registerGenerativeAiData);
};
