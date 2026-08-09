import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { casesTable, db, sessionsTable, verdictsTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { currentUserId, requireUser } from "../middlewares/require-user";

const router: IRouter = Router();

router.use(requireUser);

// Every figure below is an aggregate over `rows`, so scoping the one query
// scopes the whole summary. This endpoint previously averaged the marks of
// every student in the database and presented the result as the reader's own
// progress — wrong as statistics before it was wrong as privacy.
router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: sessionsTable.id,
      caseId: sessionsTable.caseId,
      caseTitle: casesTable.title,
      areaOfLaw: casesTable.areaOfLaw,
      studentSide: sessionsTable.studentSide,
      phase: sessionsTable.phase,
      status: sessionsTable.status,
      createdAt: sessionsTable.createdAt,
      completedAt: sessionsTable.completedAt,
      overallScore: verdictsTable.overallScore,
      legalReasoningScore: verdictsTable.legalReasoningScore,
      persuasivenessScore: verdictsTable.persuasivenessScore,
      procedureScore: verdictsTable.procedureScore,
      factualCommandScore: verdictsTable.factualCommandScore,
    })
    .from(sessionsTable)
    .innerJoin(casesTable, eq(sessionsTable.caseId, casesTable.id))
    .leftJoin(verdictsTable, eq(verdictsTable.sessionId, sessionsTable.id))
    .where(eq(sessionsTable.userId, currentUserId(req)))
    .orderBy(desc(sessionsTable.createdAt));

  const completed = rows.filter(
    (row) => row.status === "completed" && row.overallScore !== null,
  );
  const averageOverallScore = completed.length
    ? completed.reduce((total, row) => total + (row.overallScore ?? 0), 0) /
      completed.length
    : null;

  const skills = [
    {
      name: "Legal Reasoning",
      average:
        completed.reduce(
          (total, row) => total + (row.legalReasoningScore ?? 0),
          0,
        ) / (completed.length || 1),
    },
    {
      name: "Persuasiveness",
      average:
        completed.reduce(
          (total, row) => total + (row.persuasivenessScore ?? 0),
          0,
        ) / (completed.length || 1),
    },
    {
      name: "Procedure",
      average:
        completed.reduce((total, row) => total + (row.procedureScore ?? 0), 0) /
        (completed.length || 1),
    },
    {
      name: "Factual Command",
      average:
        completed.reduce(
          (total, row) => total + (row.factualCommandScore ?? 0),
          0,
        ) / (completed.length || 1),
    },
  ];

  const rankedSkills = completed.length
    ? [...skills].sort((a, b) => b.average - a.average)
    : [];

  const areaCounts = new Map<string, number>();
  for (const row of rows) {
    areaCounts.set(row.areaOfLaw, (areaCounts.get(row.areaOfLaw) ?? 0) + 1);
  }

  res.json(
    GetDashboardSummaryResponse.parse({
      totalSessions: rows.length,
      completedSessions: completed.length,
      averageOverallScore,
      strongestSkill: rankedSkills[0]?.name ?? null,
      weakestSkill: rankedSkills.at(-1)?.name ?? null,
      sessionsByAreaOfLaw: [...areaCounts.entries()].map(
        ([areaOfLaw, count]) => ({ areaOfLaw, count }),
      ),
      recentSessions: rows.slice(0, 5).map((row) => ({
        id: row.id,
        caseId: row.caseId,
        caseTitle: row.caseTitle,
        areaOfLaw: row.areaOfLaw,
        studentSide: row.studentSide,
        phase: row.phase,
        status: row.status,
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        overallScore: row.overallScore ?? null,
      })),
    }),
  );
});

export default router;
