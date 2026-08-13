import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RESPONDENT_ID_HEADER } from "@/lib/form-export";
import {
  buildSurveyExportRows,
  buildSurveyExportSchemaMap,
} from "@/lib/survey-export";
import type { FormExportSchema } from "@/lib/form-export/types";

const sampleSchema: FormExportSchema = {
  version: 1,
  fields: [
    {
      id: "q1",
      qKey: "Q1",
      label: "Do you agree to take part?",
      type: "single_select",
    },
    {
      id: "q2",
      qKey: "Q2",
      label: "Age Group",
      type: "single_select",
    },
    {
      id: "q3",
      qKey: "Q3",
      label: "Gender",
      type: "single_select",
    },
    {
      id: "q4",
      qKey: "Q4",
      label: "Relationship Status",
      type: "single_select",
    },
    {
      id: "q5",
      qKey: "Q5",
      label: "Education",
      type: "single_select",
    },
    {
      id: "q6",
      qKey: "Q6",
      label: "Occupation",
      type: "single_select",
    },
    {
      id: "q16",
      qKey: "Q16",
      label: "Household Assets",
      type: "multiple_select",
      options: ["Electricity", "Fan", "TV", "Car"],
    },
    {
      id: "q17",
      qKey: "Q17",
      label: "Digital Activities",
      type: "multiple_select",
      options: ["Online Shopping", "Online Grocery", "Food Delivery", "Gaming"],
    },
    {
      id: "q22",
      qKey: "Q22",
      label: "Service Rating",
      type: "matrix",
      rows: [
        { label: "Service Rating 1", fieldName: "sr1" },
        { label: "Service Rating 2", fieldName: "sr2" },
        { label: "Service Rating 3", fieldName: "sr3" },
      ],
    },
    {
      id: "q30",
      qKey: "Q30",
      label: "Loans",
      type: "repeat",
    },
  ],
};

describe("survey export", () => {
  it("exports Respondent ID first with per-option multi columns", () => {
    const schemaQuestions = buildSurveyExportSchemaMap(sampleSchema);
    const rows = buildSurveyExportRows({
      schemaQuestions,
      responses: [
        {
          leadId: "CI_FTV_0030",
          respondentName: "Its Singh",
          mobile: "9975412366",
          gender: "Female",
          city: "Churchgate",
          area: "South",
          zipcode: "400020",
          surveyVersion: "v3",
          currentScreen: "Q42",
          surveyCompletedAt: "2026-06-01 10:15:00",
          totalDuration: 842,
          answers: {
            q1: "Yes",
            q2: "18-24",
            q3: "Female",
            q4: "In Relationship",
            q5: "Grad/PG General",
            q6: "Govt Professional",
            q16: ["Electricity", "Fan", "TV"],
            q17: ["Online Shopping", "Online Grocery", "Food Delivery"],
          },
        },
      ],
    });

    assert.equal(rows.length, 1);
    const row = rows[0]!;

    assert.equal(row[RESPONDENT_ID_HEADER], "CI_FTV_0030");
    assert.equal(row["Respondent Name"], "Its Singh");
    assert.equal(row["Do you agree to take part?"], "Yes");
    assert.equal(row["Age Group"], "18-24");
    assert.equal(row["Household Assets - Electricity"], "Electricity");
    assert.equal(row["Household Assets - Fan"], "Fan");
    assert.equal(row["Household Assets - TV"], "TV");
    assert.equal(row["Household Assets - Car"], "");
    assert.equal(row["Digital Activities - Online Shopping"], "Online Shopping");
    assert.equal(row["Digital Activities - Gaming"], "");
    assert.equal(row.q1, undefined);
  });

  it("exports matrix answers one column per row", () => {
    const schemaQuestions = buildSurveyExportSchemaMap(sampleSchema);
    const rows = buildSurveyExportRows({
      schemaQuestions,
      responses: [
        {
          leadId: "CI_FTV_0031",
          respondentName: "Matrix User",
          mobile: "",
          gender: "",
          city: "",
          area: "",
          zipcode: "",
          surveyVersion: "v3",
          currentScreen: "",
          surveyCompletedAt: "",
          totalDuration: "",
          answers: {
            Q22: {
              "Service Rating 1": "Good",
              "Service Rating 2": "Excellent",
              "Service Rating 3": "Average",
            },
          },
        },
      ],
    });

    assert.equal(rows[0]!["Service Rating - Service Rating 1"], "Good");
    assert.equal(rows[0]!["Service Rating - Service Rating 2"], "Excellent");
    assert.equal(rows[0]!["Service Rating - Service Rating 3"], "Average");
  });

  it("exports repeater arrays in one labeled column", () => {
    const schemaQuestions = buildSurveyExportSchemaMap(sampleSchema);
    const rows = buildSurveyExportRows({
      schemaQuestions,
      responses: [
        {
          leadId: "CI_FTV_0032",
          respondentName: "Repeat User",
          mobile: "",
          gender: "",
          city: "",
          area: "",
          zipcode: "",
          surveyVersion: "v3",
          currentScreen: "",
          surveyCompletedAt: "",
          totalDuration: "",
          answers: {
            q30: [
              { Loan: "Bajaj", Status: "Completed" },
              { Loan: "HDB", Status: "Active" },
            ],
          },
        },
      ],
    });

    assert.equal(
      rows[0]!["Loans"],
      JSON.stringify([
        { Loan: "Bajaj", Status: "Completed" },
        { Loan: "HDB", Status: "Active" },
      ]),
    );
  });

  it("ignores internal diagnostic keys in answer columns", () => {
    const schemaQuestions = buildSurveyExportSchemaMap(sampleSchema);
    const rows = buildSurveyExportRows({
      schemaQuestions,
      responses: [
        {
          leadId: "CI_FTV_0033",
          respondentName: "Diag User",
          mobile: "",
          gender: "",
          city: "",
          area: "",
          zipcode: "",
          surveyVersion: "v3",
          currentScreen: "Q5",
          surveyCompletedAt: "",
          totalDuration: "",
          answers: {
            q1: "Yes",
            _screen_times: { q1: 12 },
            _last_screen: "Q5",
            _termReason: "quota",
          },
          rawDocument: {
            _last_screen: "Q5",
            _screen_times: { q1: 12 },
            _termReason: "quota",
          },
        },
      ],
      options: { includeDiagnostics: true },
    });

    assert.equal(rows[0]!["_screen_times"], undefined);
    assert.equal(rows[0]!["Last Screen"], "Q5");
    assert.equal(rows[0]!["Termination Reason"], "quota");
  });

  it("exports other-specify as Variant A with option columns + Other Specify Text", () => {
    const schema: FormExportSchema = {
      version: 1,
      fields: [
        {
          id: "fitness",
          qKey: "Q30",
          label: "Fitness activities",
          type: "multiple_select",
          options: ["Exercise/Gym", "Sports", "Other"],
          otherOption: "Other",
          otherKey: "Q31",
        },
        {
          id: "q3_party",
          qKey: "Q42",
          label: "Parties mentioned",
          type: "open_multi",
          boxes: [
            { label: "Brand 1", fieldName: "q3_party_1", qKey: "Q42" },
            { label: "Brand 2", fieldName: "q3_party_2", qKey: "Q43" },
          ],
        },
      ],
    };

    const schemaQuestions = buildSurveyExportSchemaMap(schema);
    const rows = buildSurveyExportRows({
      schemaQuestions,
      absorbedQKeys: new Set(["q31", "q43"]),
      responses: [
        {
          leadId: "CI_FTV_0100",
          respondentName: "Nested User",
          mobile: "",
          gender: "",
          city: "",
          area: "",
          zipcode: "",
          surveyVersion: "v3",
          currentScreen: "",
          surveyCompletedAt: "",
          totalDuration: "",
          answers: {
            Q30: ["Exercise/Gym", "Sports", "Others - Kickboxing"],
            Q42: ["BJP", "Congress"],
          },
        },
      ],
    });

    assert.equal(rows[0]!["Fitness activities - Exercise/Gym"], "Exercise/Gym");
    assert.equal(rows[0]!["Fitness activities - Sports"], "Sports");
    assert.equal(rows[0]!["Fitness activities - Other"], "Other");
    assert.equal(
      rows[0]!["Fitness activities - Other Specify Text"],
      "Kickboxing",
    );
    assert.equal(rows[0]!["Parties mentioned"], "BJP, Congress");
    assert.equal(rows[0]!["Question 31"], undefined);
    assert.equal(rows[0]!["Question 43"], undefined);
  });
});
