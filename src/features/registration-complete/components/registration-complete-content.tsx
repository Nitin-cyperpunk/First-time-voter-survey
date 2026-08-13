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
    <div className="center space-y-3 text-center text-[15px] leading-relaxed text-[#2B2230]">
      <div className="text-[22px] font-bold">Thank you! 🌸</div>
      <p>
        Thank you for your responses. This screening exercise is only a
        registration step to identify suitable participants for the study.
      </p>
      <p>If selected, we will share a detailed survey link with you.</p>
      <p>
        The survey will include some personal but non-sensitive questions
        related to innerwear preferences, such as your bust size, the types of
        bras you purchase, why you prefer certain products, and when you
        typically buy them.
      </p>
      <p>
        Participation in the main survey will also be completely voluntary, and
        all information shared will remain confidential and will be used only
        for research purposes.
      </p>
    </div>
  );
}

function TerminatedThankYouCopy() {
  return (
    <div className="center space-y-3 text-center text-[15px] leading-relaxed text-[#2B2230]">
      <div className="text-[22px] font-bold">Thank you for your interest!</div>
      <p>
        This particular study is open only to women, so it isn&apos;t a fit for
        you right now — but we truly appreciate you stopping by.
      </p>
      <p>
        You can still refer a woman who fits the study and share with your
        friends and family.
      </p>
      <p>We&apos;d also love to have you in our future research. 🌸</p>
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
        <p className="mt-6 text-center text-[13px] font-semibold leading-relaxed text-[#7A6E78] sm:text-[13.5px]">
          <strong className="font-bold text-[#7A6E78]">
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
