export type Participant = {
  leadId: string;
  referralCode: string;
  fullName: string;
  mobile: string;
  dob: string;
  city: string | null;
  cityId: string | null;
  email: string | null;
  area: string | null;
  pincode: string | null;
  status: string;
  referredBy: string | null;
  ipAddress: string | null;
  isFlaggedDuplicate: boolean;
  refillRequired: boolean;
  refillReason: string | null;
  refillRequestedAt: Date | null;
  refillCompletedAt: Date | null;
  refillToken: string | null;
  eligibilityManualOverride: boolean;
  eligibilityOverrideReason: string | null;
  eligibilityOverriddenAt: Date | null;
  upiId: string | null;
  upiSubmittedAt: Date | null;
  verifiedAt: Date | null;
  verificationMethod: string | null;
  acquisitionSource: string | null;
  acquisitionType: string | null;
  referralPlatform: string | null;
  otherSource: string | null;
  dmStatus: string | null;
  instagramId: string | null;
  /** Admin Send routing: public = ig.me DM (default); private = profile URL. */
  instagramVisibility: "public" | "private";
  callDisposition: string | null;
  callDispositionNotes: string | null;
  callDispositionAt: Date | null;
  deviceFingerprint: string | null;
  duplicateFlag: boolean;
  duplicateReason: string | null;
  duplicateDetectedAt: Date | null;
  reviewStatus: string;
  originalParticipantLeadId: string | null;
  createdAt: Date;
};

export type ScreenerField = {
  id: string;
  label: string;
  type:
    | "select"
    | "text"
    | "single_select"
    | "multiple_select"
    | "matrix"
    | "textarea"
    | "number"
    | "date"
    | "email"
    | "tel";
  required?: boolean;
  options?: string[];
  qKey?: string;
  fieldName?: string;
  rows?: Array<{ label: string; fieldName: string; qKey?: string }>;
  matrixColumns?: string[];
  otherOption?: string;
  otherSpecifyField?: string;
  exportOtherSpecifySeparately?: boolean;
};

export type ScreenerSchema = {
  version?: number;
  fields: ScreenerField[];
};

export type Referral = {
  id: string;
  referrerLeadId: string | null;
  referredLeadId: string | null;
  referralCode: string | null;
  rewardStatus: string;
  earnedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
};
