import { prisma } from "@/lib/prisma";

export async function getOwnedOrganization(userId: string) {
  return prisma.organization.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getOwnedProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, organization: { ownerId: userId } },
    include: { organization: true },
  });
}

export async function getOwnedSurvey(userId: string, surveyId: string) {
  return prisma.survey.findFirst({
    where: { id: surveyId, project: { organization: { ownerId: userId } } },
    include: { project: true },
  });
}
