import { NebiantUser } from "../middleware";

declare global {
  namespace Express {
    interface Request {
      user?: NebiantUser;
    }
  }
}