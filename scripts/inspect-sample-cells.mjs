import fs from "node:fs";

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
      } else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const lines = fs
  .readFileSync("fixtures/survey-export/Enamor_SAMPLE_filled_responses.csv", "utf8")
  .split(/\r?\n/)
  .filter(Boolean);
const h = parseCsvLine(lines[0]).map((s) => s.replace(/^\ufeff/, ""));
const r = parseCsvLine(lines[1]);
const picks = [];
for (let i = 0; i < h.length; i++) {
  if (
    r[i] &&
    /^(Q8\.|Q8a\.|Q10\.|Q12\.|Q15a\.|Q16\.|Q18\.|Q28)/.test(h[i])
  ) {
    picks.push({ h: h[i].slice(0, 100), v: r[i] });
  }
}
console.log(JSON.stringify(picks.slice(0, 50), null, 2));
