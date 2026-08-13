"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { InviteFriendsModal } from "@/components/participant/invite-friends-modal";
import { useInstagramDmGuide } from "@/hooks/use-instagram-dm-guide";
import { useInstagramVerification } from "@/hooks/use-instagram-verification";
import {
  RegistrationCompleteCtaButton,
  RegistrationCompleteShell,
} from "@/features/registration-complete/components/registration-complete-ui";
import { isNotEligibleStatus } from "@/features/participant-dashboard/lib/referral-share-mode";
import {
  INSTAGRAM_DM_URL,
  buildWhatsAppVerificationUrl,
} from "@/config/social";
import { buildWhatsAppShareUrl } from "@/lib/message-templates/client";
import {
  clearRegistrationCompletePending,
  loadRegistrationResult,
  type StoredRegistrationResult,
} from "@/lib/registration-onboarding";
import { toastUnexpectedError, toastWhatsAppShareInitiated } from "@/lib/toast";

function QualifiedThankYouCopy() {
  return (
    <div className="center space-y-3 text-center text-[15px] leading-relaxed text-text-primary">
      <div className="text-[22px] font-bold">Thank you</div>
      <p>
        Thank you for completing the First-Time Voters Study. Your responses
        will be used only for academic research and reported in aggregate.
      </p>
      <p>
        This is a single-form study — there is no follow-up main survey.
        You can still share your referral link with friends who were first-time
        voters in 2024.
      </p>
    </div>
  );
}

function TerminatedThankYouCopy() {
  return (
    <div className="center space-y-3 text-center text-[15px] leading-relaxed text-text-primary">
      <div className="text-[22px] font-bold">Thank you for your time</div>
      <p>
        This study is intended for people who were eligible to vote for the
        first time in the 2024 Lok Sabha election and who voted. We completely
        respect your decision.
      </p>
      <p>
        You can still refer a first-time voter who may be eligible to take
        part.
      </p>
    </div>
  );
}

export function RegistrationCompleteContent() {
  const router = useRouter();
  const [data, setData] = useState<StoredRegistrationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingVerification, setOpeningVerification] = useState(false);
  const [referralInviteOpen, setReferralInviteOpen] = useState(false);
  const [sharingInstagram, setSharingInstagram] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const { startInstagramDm, modal: referralInstagramModal } =
    useInstagramDmGuide();
  const { startInstagramVerification, modal: verificationModal } =
    useInstagramVerification();

  useEffect(() => {
    clearRegistrationCompletePending();

    const stored = loadRegistrationResult();
    if (!stored?.messages) {
      router.replace("/register");
      return;
    }

    setData(stored);
    setLoading(false);
  }, [router]);

  const notEligible = data ? isNotEligibleStatus(data.status) : false;

  function handleVerificationClick() {
    if (!data?.messages) return;

    setOpeningVerification(true);
    try {
      const rendered = data.messages.instagram_verification;

      if (notEligible) {
        window.open(
          buildWhatsAppVerificationUrl(rendered.message),
          "_blank",
          "noopener,noreferrer",
        );
        toastWhatsAppShareInitiated();
        return;
      }

      startInstagramVerification({
        message: rendered.message,
        dmUrl: INSTAGRAM_DM_URL,
      });
    } catch {
      toastUnexpectedError();
    } finally {
      setOpeningVerification(false);
    }
  }

  function handleReferralInstagram() {
    if (!data?.messages) return;

    setSharingInstagram(true);
    try {
      const rendered = data.messages.instagram_referral;
      setReferralInviteOpen(false);
      startInstagramDm({
        message: rendered.message,
        dmUrl: rendered.instagramDmUrl,
      });
    } catch {
      toastUnexpectedError();
    } finally {
      setSharingInstagram(false);
    }
  }

  function handleReferralWhatsApp() {
    if (!data?.messages) return;

    setSharingWhatsApp(true);
    try {
      const rendered = notEligible
        ? data.messages.not_eligible_referral
        : data.messages.whatsapp_referral;

      setReferralInviteOpen(false);
      window.open(
        buildWhatsAppShareUrl(rendered.message),
        "_blank",
        "noopener,noreferrer",
      );
      toastWhatsAppShareInitiated();
    } catch {
      toastUnexpectedError();
    } finally {
      setSharingWhatsApp(false);
    }
  }

  if (loading || !data) {
    return (
      <RegistrationCompleteShell>
        <p className="mt-6 text-center text-[13px] font-semibold leading-relaxed text-text-muted sm:text-[13.5px]">
          <strong className="font-bold text-text-muted">
            Preparing you for the next step…
          </strong>
        </p>
      </RegistrationCompleteShell>
    );
  }

  return (
    <>
      <RegistrationCompleteShell>
        {notEligible ? <TerminatedThankYouCopy /> : <QualifiedThankYouCopy />}

        <div className="mt-6 flex flex-row gap-3">
          <RegistrationCompleteCtaButton
            title={notEligible ? "DM us on WhatsApp" : "DM us on Instagram"}
            subtitle={
              openingVerification
                ? notEligible
                  ? "Opening..."
                  : "Preparing..."
                : notEligible
                  ? "Send verification details"
                  : "Verify your account"
            }
            variant={notEligible ? "whatsapp" : "primary"}
            disabled={openingVerification}
            onClick={handleVerificationClick}
          />
          <RegistrationCompleteCtaButton
            title="Share"
            subtitle="Invite your friends"
            variant="referral"
            disabled={!data.referralLink}
            onClick={() => setReferralInviteOpen(true)}
          />
        </div>
      </RegistrationCompleteShell>

      <InviteFriendsModal
        open={referralInviteOpen}
        onOpenChange={setReferralInviteOpen}
        onShareInstagram={handleReferralInstagram}
        onShareWhatsApp={handleReferralWhatsApp}
        sharingInstagram={sharingInstagram}
        sharingWhatsApp={sharingWhatsApp}
      />
      {referralInstagramModal}
      {verificationModal}
    </>
  );
}
