import {
  applyChanges,
  type Change,
  type Draft,
  type Field,
} from "./contracts.js";
export const taxonomy: [string, RegExp][] = [
  ["React Native", /\bReact Native\b/i],
  ["React", /\bReact(?! Native)\b/i],
  ["Next.js", /\bNext\.?js\b/i],
  ["Node.js", /\bNode(?:\.?js)?\b/i],
  ["TypeScript", /\bTypeScript\b/i],
  ["Java", /\bJava\b/i],
  ["Spring Boot", /\bSpring(?: Boot)?\b/i],
  ["C#", /C#/i],
  [".NET", /\.NET\b/i],
  ["Kubernetes", /\b(?:Kubernetes|K8s)\b/i],
  ["AWS", /\bAWS\b/i],
  ["Azure", /\bAzure\b/i],
  ["GCP", /\bGCP\b/i],
  ["Python", /\bPython\b/i],
  ["Kafka", /\bKafka\b/i],
  ["Docker", /\bDocker\b/i],
  ["Terraform", /\bTerraform\b/i],
  ["SAP", /\bSAP\b/i],
  ["Salesforce", /\bSalesforce\b/i],
  ["Power Platform", /\bPower Platform\b/i],
  ["M365", /\bM365\b/i],
  ["IAM", /\bIAM\b/i],
  ["SQL", /\bSQL\b/i],
  ["RAG", /\bRAG\b/i],
  ["CI/CD", /\bCI\/CD\b/i],
];
// Deliberately conservative, deterministic staging adapter. Live extraction uses the provider.
export function fixtureChanges(text: string, d: Draft): Change[] {
  const changes: Change[] = [];
  const add = (field: Field, value: string, evidence: string) =>
    changes.push({ field, value, evidence, origin: "explicit" });
  const skills = taxonomy.flatMap(([name, re]) =>
    text.match(re) ? [{ name, quote: text.match(re)![0] }] : [],
  );
  if (skills.length) {
    const field = d.kind === "mission" ? "required_skills" : "skills";
    const prev = Array.isArray(d.fields[field])
      ? (d.fields[field] as string[])
      : [];
    add(
      field,
      [...new Set([...prev, ...skills.map((s) => s.name)])].join(", "),
      skills[0].quote,
    );
  }
  const title = text.match(
    /(?:senior|junior|lead|sénior|développeur|developpeur|developer|engineer|ingénieur|consultant|architecte|architect|expert|data engineer)[^\n,.]{0,90}/i,
  );
  if (title && !d.fields[d.kind === "mission" ? "title" : "headline"])
    add(
      d.kind === "mission" ? "title" : "headline",
      title[0].replace(/\s+(?:pour|for|à|in|en|with|avec)\s.*$/i, "").trim(),
      title[0],
    );
  const seniority = text.match(/\b(senior|sénior|junior|lead|confirmé)\b/i);
  if (seniority) add("seniority", seniority[1], seniority[0]);
  const location = text.match(
    /\b(Paris|Lyon|Marseille|Bordeaux|Lille|Nantes|Toulouse|London|Berlin|France|Remote worldwide)\b/i,
  );
  if (location) add("location", location[1], location[0]);
  const mode = text.match(
    /\b(remote|hybride?|sur site|on[- ]site|télétravail)\b/i,
  );
  if (mode) {
    const normalized = /remote|télétravail/i.test(mode[0])
      ? "remote"
      : /hybrid/i.test(mode[0])
        ? "hybrid"
        : "onsite";
    add(d.kind === "mission" ? "work_mode" : "work_modes", normalized, mode[0]);
  }
  const onsite = text.match(
    /(\d)\s*(?:j(?:ours?)?|days?)\s*(?:par semaine|a week|\/semaine|\/week)?\s*(?:sur site|on[- ]site)/i,
  );
  if (onsite)
    add(
      d.kind === "mission" ? "on_site_days_per_week" : "max_on_site_days",
      onsite[1],
      onsite[0],
    );
  const rate =
    text.match(
      /(?:maximum|max|budget|tjm|day rate|cible|target)\s*(?:de|is|of|:)?\s*[€£$]?\s*(\d{2,4})/i,
    ) ?? text.match(/(\d{2,4})\s*(?:€|euros|EUR)(?:\s*max)?/i);
  if (rate)
    add(
      d.kind === "mission" ? "day_rate_max" : "target_day_rate",
      rate[1],
      rate[0],
    );
  const min = text.match(
    /(?:minimum|min)\s*(?:de|is|:)?\s*[€£$]?\s*(\d{2,4})/i,
  );
  if (min)
    add(
      d.kind === "mission" ? "day_rate_min" : "minimum_day_rate",
      min[1],
      min[0],
    );
  if (/€|\bEUR\b|euros/i.test(text))
    add("currency", "EUR", text.match(/€|\bEUR\b|euros/i)![0]);
  const duration = text.match(
    /(?:\d+|trois|six|three|six)\s*(?:mois|months?|semaines?|weeks?)/i,
  );
  if (duration && d.kind === "mission")
    add("duration", duration[0], duration[0]);
  const start = text.match(
    /(?:septembre|september|octobre|october|novembre|november|ASAP|dès que possible|\d{4}-\d{2}-\d{2})/i,
  );
  if (start)
    add(
      d.kind === "mission" ? "start_window" : "estimated_end_date",
      start[0],
      start[0],
    );
  const contract = text.match(
    /\b(freelance|CDI|CDD|contract|régie|forfait)\b/i,
  );
  if (contract)
    add(
      d.kind === "mission" ? "contract_type" : "contract_preferences",
      contract[0],
      contract[0],
    );
  const langs = [
    ...text.matchAll(/\b(français|French|anglais|English|allemand|German)\b/gi),
  ];
  if (langs.length)
    add("languages", langs.map((x) => x[0]).join(", "), langs[0][0]);
  const years = text.match(
    /(\d+)\s*(?:ans|years)\s*(?:d['’]expérience|of experience|experience)/i,
  );
  if (years && d.kind === "profile")
    add("years_experience", years[1], years[0]);
  if (d.kind === "mission") {
    const responsibilities = text.match(
      /(?:responsabilités|responsibilities|objectifs|objectives)\s*:\s*([^\n]+)/i,
    );
    if (responsibilities)
      add("responsibilities", responsibilities[1], responsibilities[0]);
    if (/budget (?:inconnu|à définir)|budget unknown/i.test(text))
      add(
        "budget_unknown",
        "true",
        text.match(/budget (?:inconnu|à définir)|budget unknown/i)![0],
      );
  } else {
    const available = text.match(
      /(?:disponible immédiatement|available now|en mission|on mission|dans (?:deux|2) semaines|in (?:two|2) weeks|indisponible|unavailable)/i,
    );
    if (available)
      add(
        "availability",
        /en mission|on mission/i.test(available[0])
          ? "on_mission_open"
          : /semaines|weeks/i.test(available[0])
            ? "2_weeks"
            : /indisponible|unavailable/i.test(available[0])
              ? "unavailable"
              : "available_now",
        available[0],
      );
    const visibility = text.match(
      /\b(confidentiel|confidential|secret|visible)\b/i,
    );
    if (visibility)
      add(
        "visibility",
        /confident/i.test(visibility[0])
          ? "confidential"
          : visibility[0].toLowerCase(),
        visibility[0],
      );
  }
  // A direct reply to the single requested field is explicit user input.
  const missing = d.missing_fields[0];
  if (
    missing &&
    !changes.some((c) => c.field === missing) &&
    text.length < 300 &&
    !/[?]/.test(text)
  ) {
    const bareNumber = /^\d{2,4}$/.test(text.trim());
    if (
      [
        "responsibilities",
        "title",
        "headline",
        "contract_type",
        "location",
        "start_window",
        "duration",
        "languages",
        "availability",
        "work_mode",
        "work_modes",
        "visibility",
      ].includes(missing) &&
      !changes.length
    )
      add(missing, text.trim(), text.trim());
    if (
      ["day_rate_max", "minimum_day_rate", "target_day_rate"].includes(
        missing,
      ) &&
      bareNumber
    )
      add(missing, text.trim(), text.trim());
  }
  return changes;
}
export function fixtureExtract(text: string, draft: Draft) {
  return applyChanges(draft, fixtureChanges(text, draft), text);
}
