import { z } from "zod";

import { coerceAgeBand, parseAgeBand } from "@/lib/study-config/gates";
import { isRegistrationTerminated } from "@/lib/registration-terminations";
import {
  isFutureDob,
  isValidDobFormat,
  validateDob,
} from "@/lib/dob-validation";

const dobSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date of birth (YYYY-MM-DD)")
  .superRefine((value, ctx) => {
    const error = validateDob(value);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
  });

const phoneSchema = z
  .string()
  .trim()
  .min(10, "Enter a valid mobile number")
  .max(15, "Mobile number is too long")
  .regex(/^[\d\s+()-]+$/, "Enter a valid mobile number");

const optionalPhoneSchema = z
  .string()
  .trim()
  .max(15)
  .refine(
    (value) => value === "" || phoneSchema.safeParse(value).success,
    "Enter a valid mobile number",
  );

const optionalDobSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (value === "") return true;
    if (!isValidDobFormat(value)) return false;
    return !isFutureDob(value);
  }, "Enter a valid date of birth (YYYY-MM-DD)");

const terminationEventSchema = z.object({
  ruleKey: z.string().trim().min(1),
  ruleLabel: z.string().trim().optional(),
  questionKey: z.string().trim().optional().nullable(),
  questionLabel: z.string().trim().optional().nullable(),
  answerValue: z.string().trim().optional().nullable(),
  reasonText: z.string().trim().optional().nullable(),
});

function profileFromAnswerJson(answerJson: Record<string, unknown> | undefined) {
  const profile = answerJson?.profile;
  if (!profile || typeof profile !== "object") return null;
  return profile as {
    dob?: string;
    age_today?: number | string;
    age_band?: string;
  };
}

export const launchRegistrationSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") return value;
    const input = { ...(value as Record<string, unknown>) };
    const profile = profileFromAnswerJson(
      input.answerJson as Record<string, unknown> | undefined,
    );
    const dob =
      (typeof input.dob === "string" && input.dob.trim()) ||
      (typeof profile?.dob === "string" ? profile.dob : "") ||
      "";
    const band =
      coerceAgeBand(input.age_band, dob) ||
      coerceAgeBand(profile?.age_band, dob) ||
      coerceAgeBand(profile?.age_today, dob);
    if (dob && !input.dob) input.dob = dob;
    if (band) input.age_band = band;
    return input;
  },
  z
    .object({
    fullName: z.string().trim().max(120, "Name is too long").optional().default(""),
    mobile: optionalPhoneSchema.optional().default(""),
    dob: optionalDobSchema.optional().default(""),
    age_band: z.string().trim().optional().default(""),
  city: z.string().trim().max(80, "City name is too long.").optional().default(""),
  city_id: z.string().uuid().optional().or(z.literal("")),
  email: z
    .union([
      z.literal(""),
      z.string().trim().email("Enter a valid email.").max(200),
    ])
    .optional(),
  area: z.string().trim().max(120).optional().or(z.literal("")),
  pincode: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter a valid 6-digit pincode."),
    ])
    .optional(),
  referrerCode: z.string().trim().optional(),
  acquisitionSource: z.string().trim().max(120).optional(),
  otherSource: z.string().trim().max(200).optional(),
  referralPlatform: z.string().trim().max(40).optional(),
  deviceFingerprint: z.string().trim().max(128).optional().nullable(),
  answers: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .default({}),
  responseTimes: z
    .record(z.string(), z.number().int().nonnegative())
    .optional(),
  analytics: z
    .object({
      survey: z.record(z.string(), z.unknown()),
      questions: z.record(z.string(), z.unknown()),
    })
    .optional(),
  startedAt: z.string().datetime().optional(),
  submittedAt: z.string().datetime().optional(),
  currentScreen: z.string().trim().max(120).optional(),
  lastScreen: z.string().trim().max(120).optional(),
  terminated: z.boolean().optional(),
  terminations: z.array(terminationEventSchema).optional(),
  answerJson: z.record(z.string(), z.any()).optional(),
  csvRow: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  })
    .superRefine((data, ctx) => {
      const terminated = isRegistrationTerminated(data);
      if (!terminated) {
        if (!data.city?.trim() || data.city.trim().length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please enter your city.",
            path: ["city"],
          });
        }
        const band = data.age_band?.trim() || "";
        if (!band || parseAgeBand(band) === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please select your age.",
            path: ["age_band"],
          });
        }
        return;
      }

      const band = data.age_band?.trim() || "";
      if (band && parseAgeBand(band) === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please select your age.",
          path: ["age_band"],
        });
      }
    }),
);

export const launchLoginSchema = z.object({
  mobile: phoneSchema,
  dob: dobSchema,
  rememberMe: z
    .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === true || value === "on" || value === "true")
    .default(false),
});

export type LaunchRegistrationInput = z.infer<typeof launchRegistrationSchema>;
export type LaunchLoginInput = z.infer<typeof launchLoginSchema>;
