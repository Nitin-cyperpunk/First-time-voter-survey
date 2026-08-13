import fs from "node:fs";

const headers = JSON.parse(
  fs.readFileSync("fixtures/survey-export/sample-headers.json", "utf8"),
);

function stripBom(s) {
  return s.replace(/^\ufeff/, "");
}

const EM = "—";
const byQ = {};
for (const raw of headers) {
  const h = stripBom(raw);
  const m = h.match(/^(Q\d+[a-z]?)\.\s/);
  if (!m) {
    byQ.__meta = byQ.__meta || [];
    byQ.__meta.push(h);
    continue;
  }
  const q = m[1];
  byQ[q] = byQ[q] || [];
  byQ[q].push(h);
}

function parts(h) {
  const idx = h.indexOf(". ");
  const rest = idx >= 0 ? h.slice(idx + 2) : h;
  return rest.split(` ${EM} `);
}

const summary = {};
for (const [q, cols] of Object.entries(byQ)) {
  if (q === "__meta") {
    summary[q] = cols;
    continue;
  }
  const first = parts(cols[0]);
  const questionText = first[0];
  const suffixes = cols.map((c) => {
    const p = parts(c);
    return p.slice(1).join(` ${EM} `);
  });
  summary[q] = {
    count: cols.length,
    questionText,
    suffixes: suffixes.slice(0, q === "Q10" || q === "Q12" ? 30 : 50),
    suffixesTail:
      q === "Q10" || q === "Q12" ? suffixes.slice(-5) : undefined,
    allSuffixes: q === "Q10" || q === "Q12" ? undefined : suffixes,
  };
}

// Unique brands from Q2
const q2 = byQ.Q2.map((c) => parts(c).slice(1).join(` ${EM} `));
const q8 = byQ.Q8.map((c) => parts(c).slice(1).join(` ${EM} `));
const q10rows = [...new Set(byQ.Q10.map((c) => parts(c)[1]))];
const q10opts = [...new Set(byQ.Q10.map((c) => parts(c)[2]))];
const q12opts = [...new Set(byQ.Q12.map((c) => parts(c)[2]))];
const q18 = byQ.Q18.map((c) => parts(c).slice(1).join(` ${EM} `));

fs.writeFileSync(
  "fixtures/survey-export/sample-structure.json",
  JSON.stringify(
    {
      meta: byQ.__meta,
      q2Brands: q2,
      q8Rows: q8,
      q10Rows: q10rows,
      q10Opts: q10opts,
      q12Opts: q12opts,
      q18: q18,
      q19: byQ.Q19.map((c) => parts(c).slice(1).join(` ${EM} `)),
      q20: byQ.Q20.map((c) => parts(c).slice(1).join(` ${EM} `)),
      q15a: byQ.Q15a.map((c) => parts(c).slice(1).join(` ${EM} `)),
      q15b: byQ.Q15b.map((c) => parts(c).slice(1).join(` ${EM} `)),
      q16: byQ.Q16.map((c) => parts(c).slice(1).join(` ${EM} `)),
      q21: byQ.Q21.map((c) => parts(c).slice(1).join(` ${EM} `)),
      q22: byQ.Q22.map((c) => parts(c).slice(1).join(` ${EM} `)),
      q24: byQ.Q24.map((c) => parts(c).slice(1).join(` ${EM} `)),
      q25: byQ.Q25.map((c) => parts(c).slice(1).join(` ${EM} `)),
      q28: byQ.Q28.map((c) => parts(c).slice(1).join(` ${EM} `)),
      q13a: byQ.Q13a.map((c) => parts(c).slice(1).join(` ${EM} `)),
      q14: byQ.Q14.map((c) => parts(c).slice(1).join(` ${EM} `)),
      questionTexts: Object.fromEntries(
        Object.entries(byQ)
          .filter(([k]) => k !== "__meta")
          .map(([k, cols]) => [k, parts(cols[0])[0]]),
      ),
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      meta: byQ.__meta,
      q2Count: q2.length,
      q2: q2,
      q8: q8,
      q10Rows: q10rows.length,
      q10Opts: q10opts,
      q12Opts: q12opts,
      q18First10: q18.slice(0, 10),
      q28: byQ.Q28,
      q14: byQ.Q14,
      q1: byQ.Q1,
    },
    null,
    2,
  ),
);
