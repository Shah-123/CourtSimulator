import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import casesRouter from "./cases";
import dashboardRouter from "./dashboard";
import sessionsRouter from "./sessions";

const router: IRouter = Router();

// Health and auth are reachable signed-out by necessity, and the case library is
// shared teaching material rather than anyone's record. Sessions and the
// dashboard carry a student's own marks and declare `requireUser` inside their
// own routers, so reordering this list cannot expose them.
router.use(healthRouter);
router.use(authRouter);
router.use(casesRouter);
router.use(sessionsRouter);
router.use(dashboardRouter);

export default router;
