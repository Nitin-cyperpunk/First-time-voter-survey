import { z } from "zod";

import { AGE_BAND_VALUES } from "@/lib/study-config/gates";
import { validateDob } from "@/lib/dob-validation";

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
  .refine(
    (value) => value === "" || dobSchema.safeParse(value).success,
    "Enter a valid date of birth (YYYY-MM-DD)",
  );

const terminationEventSchema = z.object({
  ruleKey: z.string().trim().min(1),
  ruleLabel: z.string().trim().optional(),
  questionKey: z.string().trim().optional().nullable(),
  questionLabel: z.string().trim().optional().nullable(),
  answerValue: z.string().trim().optional().nullable(),
  reasonText: z.string().trim().optional().nullable(),
});

export const launchRegistrationSchema = z.object({
  fullName: z.string().trim().max(120, "Name is too long").optional().default(""),
  mobile: optionalPhoneSchema.optional().default(""),
  dob: optionalDobSchema.optional().default(""),
  age_band: z.enum(AGE_BAND_VALUES, {
    message: "Please select your age.",
  }),
  city: z
    .string()
    .trim()
    .min(2, "Please enter your city.")
    .max(80, "City name is too long."),
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
});

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
