import fs from "node:fs";
import path from "node:path";

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

const csvPath = path.join(
  process.cwd(),
  "fixtures/survey-export/Enamor_SAMPLE_filled_responses.csv",
);
const text = fs.readFileSync(csvPath, "utf8");
const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
const headers = parseCsvLine(lines[0]);
const outDir = path.join(process.cwd(), "fixtures/survey-export");
fs.writeFileSync(
  path.join(outDir, "sample-headers.json"),
  JSON.stringify(headers, null, 2),
);

const groups = {};
for (const h of headers) {
  const m = h.match(
    /^(Q\d+[a-z]?\.|Consent|Respondent ID|Status|Survey version|Started at|Completed at|Duration \(minutes\)|Last screen reached|Q16\/Q17|Q22 tab)/,
  );
  const key = m ? m[1] : `OTHER:${h.slice(0, 40)}`;
  groups[key] = (groups[key] || 0) + 1;
}

const row1 = lines[1] ? parseCsvLine(lines[1]) : [];
const filled = [];
for (let i = 0; i < headers.length; i++) {
  if (row1[i]) filled.push({ i, h: headers[i], v: String(row1[i]).slice(0, 80) });
}

console.log(
  JSON.stringify(
    {
      headerCount: headers.length,
      dataRows: lines.length - 1,
      meta: headers.slice(0, 12),
      groups,
      filledCount: filled.length,
      filledSample: filled.slice(0, 40),
    },
    null,
    2,
  ),
);
