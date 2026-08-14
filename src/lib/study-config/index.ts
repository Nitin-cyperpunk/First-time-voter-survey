export { closesAt, DEFAULT_STUDY_CONFIG, registrationCap } from "@/lib/study-config/defaults";
export {
  AGE_BAND_VALUES,
  ageOutOfRangeMessage,
  getAgeYears,
  isAgeBandWithinStudyRule,
  isAgeWithinStudyRule,
  isCapacityEnforced,
  isFormClosedForNewRespondents,
  isRegistrationAccepting,
  maySubmitWhileFormClosed,
  parseAgeBand,
} from "@/lib/study-config/gates";
export type { AgeBandValue } from "@/lib/study-config/gates";
export { mergeStudyConfig, parseStudyConfig } from "@/lib/study-config/parse";
export { getRewardAmounts } from "@/lib/study-config/rewards";
export type { FormStatus, StudyConfig, StudyConfigPatch } from "@/lib/study-config/types";
