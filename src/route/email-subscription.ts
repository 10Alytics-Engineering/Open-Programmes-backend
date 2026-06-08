import {
  subscribeToEvent,
  unsubscribeFromEvent,
} from "../controllers/emailSubscription";
import express from "express";

export default (router: express.Router) => {
  // Endpoints for all email subscription
  router.post("/email-subscriptions", subscribeToEvent);

  router.get(
    "/email-subscriptions/unsubscribe/:action/:token",
    unsubscribeFromEvent,
  );
};
