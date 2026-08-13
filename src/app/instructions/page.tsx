import { redirect } from "next/navigation";

import { getAuthenticatedParticipant } from "@/lib/auth/participant-session";

export const dynamic = "force-dynamic";

/** Legacy route — registration flow no longer uses a separate instructions step. */
export default async function InstructionsPage() {
  const participant = await getAuthenticatedParticipant();
  if (!participant) redirect("/login");

  redirect("/dashboard");
}
