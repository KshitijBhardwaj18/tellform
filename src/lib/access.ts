import { prisma } from "@/lib/prisma";

export async function getOwnedOrganization(userId: string) {
  return prisma.organization.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getOwnedSurvey(userId: string, surveyId: string) {
  return prisma.survey.findFirst({
    where: { id: surveyId, organization: { ownerId: userId } },
    include: { organization: true },
  });
}

export async function getOwnedQuiz(userId: string, quizId: string) {
  return prisma.quiz.findFirst({
    where: { id: quizId, organization: { ownerId: userId } },
    include: { organization: true },
  });
}

export async function getOwnedSnippet(userId: string, snippetId: string) {
  return prisma.snippet.findFirst({
    where: { id: snippetId, organization: { ownerId: userId } },
    include: { organization: true },
  });
}
