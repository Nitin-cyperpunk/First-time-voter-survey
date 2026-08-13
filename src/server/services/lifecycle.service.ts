import {
  canTransition,
  InvalidStatusTransitionError,
  type ParticipantStatus,
} from "@/lib/participant-lifecycle";
import {
  findParticipantByLeadId,
  recordParticipantStatusHistory,
  updateParticipantStatus,
} from "@/server/repositories/participants.repository";

export type TransitionContext = {
  changedBy: string;
  notes?: string | null;
};

export type TransitionResult = {
  changed: boolean;
  participant: NonNullable<Awaited<ReturnType<typeof findParticipantByLeadId>>>;
};

export async function transitionParticipantStatus(
  leadId: string,
  toStatus: ParticipantStatus,
  context: TransitionContext,
): Promise<TransitionResult> {
  const participant = await findParticipantByLeadId(leadId);
  if (!participant) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  const fromStatus = participant.status;
  if (fromStatus === toStatus) {
    return { changed: false, participant };
  }

  if (!canTransition(fromStatus, toStatus)) {
    throw new InvalidStatusTransitionError(fromStatus, toStatus);
  }

  const updatedParticipant = await updateParticipantStatus(leadId, toStatus);
  if (!updatedParticipant) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  await recordParticipantStatusHistory(leadId, toStatus, {
    oldStatus: fromStatus,
    changedBy: context.changedBy,
    notes: context.notes ?? undefined,
  });

  return { changed: true, participant: updatedParticipant };
}

export async function transitionParticipantStatusChain(
  leadId: string,
  statuses: ParticipantStatus[],
  context: TransitionContext,
): Promise<TransitionResult> {
  let lastResult: TransitionResult | null = null;

  for (const status of statuses) {
    lastResult = await transitionParticipantStatus(leadId, status, context);
  }

  if (!lastResult) {
    throw new Error("PARTICIPANT_NOT_FOUND");
  }

  return lastResult;
}

export { InvalidStatusTransitionError } from "@/lib/participant-lifecycle";
