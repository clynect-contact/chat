"use client";
import { useState } from "react";
import {
  Check,
  ChevronDown,
  LockKeyhole,
  Pencil,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { Progress } from "./ui/progress";
import { copy } from "./i18n";
import { options, optionLabel } from "./field-options";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
import {
  fieldDefinitions,
  missionFields,
  profileFields,
  requiredFields,
  displayValue,
  type Draft,
  type Field,
  type Locale,
} from "./contracts";
export function ReviewCard({
  draft,
  locale,
  busy,
  onEdit,
  onSave,
}: {
  draft: Draft | null;
  locale: Locale;
  busy: boolean;
  onEdit: (field: Field, value: string) => Promise<void>;
  onSave: () => void;
}) {
  const t = copy[locale];
  const [editing, setEditing] = useState<Field | null>(null),
    [value, setValue] = useState(""),
    [all, setAll] = useState(false);
  if (!draft)
    return (
      <div className="review-empty">
        <div className="empty-icon">
          <FileText size={28} />
        </div>
        <h3>{t.reviewTitle}</h3>
        <p>{t.draftHint}</p>
        <div className="draft-skeleton">
          <i />
          <i />
          <i />
        </div>
        <span>
          <LockKeyhole size={14} />
          {t.privateDraft}
        </span>
      </div>
    );
  const title =
    displayValue(
      draft.fields[draft.kind === "mission" ? "title" : "headline"],
    ) || (draft.kind === "mission" ? t.newMission : t.newProfile);
  const fields = all
    ? draft.kind === "mission"
      ? missionFields
      : profileFields
    : [
        ...new Set([
          ...requiredFields[draft.kind],
          ...(Object.keys(draft.fields) as Field[]),
        ]),
      ];
  const isSaved = draft.saved_revision === draft.revision;
  return (
    <div className="review-card">
      <div className="review-label">
        <LockKeyhole size={14} />
        {t.privateDraft}
        <span>{draft.kind === "mission" ? t.need : t.profile}</span>
      </div>
      <h2>{title}</h2>
      <div className="completion">
        <span>
          {draft.completeness_score}% {t.complete}
        </span>
        <span>
          {draft.missing_fields.length} {t.missing.toLowerCase()}
        </span>
      </div>
      <Progress value={draft.completeness_score} aria-label={t.complete} />
      {!!draft.conflicts.length && <p className="warning">{t.conflict}</p>}
      {!!draft.unsupported_fields.length && (
        <p className="warning">
          {t.unsupported}:{" "}
          {draft.unsupported_fields
            .map((f) => fieldDefinitions[f][locale === "fr" ? 0 : 1])
            .join(", ")}
        </p>
      )}
      <div className="fields">
        {fields.map((field) => (
          <div className="draft-field" key={field}>
            <div className="field-head">
              <label htmlFor={`field-${field}`}>
                {fieldDefinitions[field][locale === "fr" ? 0 : 1]}
              </label>
              <button
                disabled={busy}
                aria-label={`${t.edit} ${fieldDefinitions[field][locale === "fr" ? 0 : 1]}`}
                onClick={() => {
                  setEditing(field);
                  setValue(displayValue(draft.fields[field]));
                }}
              >
                <Pencil size={13} />
              </button>
            </div>
            {editing === field ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await onEdit(field, value);
                    setEditing(null);
                  } catch {}
                }}
              >
                {options[field] ? (
                  <Select
                    value={value}
                    onValueChange={(v) => setValue(v ?? "")}
                  >
                    <SelectTrigger id={`field-${field}`}>
                      <SelectValue>
                        {optionLabel(value, locale) || t.missing}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {options[field]!.map((v) => (
                        <SelectItem key={v} value={v}>
                          {optionLabel(v, locale)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <textarea
                    id={`field-${field}`}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                )}
                <div className="edit-actions">
                  <button type="button" onClick={() => setEditing(null)}>
                    {t.cancel}
                  </button>
                  <button
                    disabled={busy}
                    className="text-primary"
                    type="submit"
                  >
                    {t.apply}
                  </button>
                </div>
              </form>
            ) : (
              <div
                className={`field-value ${draft.missing_fields.includes(field) ? "is-missing" : ""}`}
              >
                {Array.isArray(draft.fields[field]) ? (
                  <div className="skill-tags">
                    {(draft.fields[field] as string[]).map((v, i) => (
                      <span key={`${i}-${v}`}>{optionLabel(v, locale)}</span>
                    ))}
                  </div>
                ) : (
                  (typeof draft.fields[field] === "number"
                    ? new Intl.NumberFormat(locale, {
                        maximumFractionDigits: 2,
                      }).format(draft.fields[field] as number)
                    : optionLabel(
                        displayValue(draft.fields[field]),
                        locale,
                      )) || <span>{t.missing}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="show-details" onClick={() => setAll(!all)}>
        {t.details}
        <ChevronDown
          size={16}
          style={{ transform: all ? "rotate(180deg)" : undefined }}
        />
      </button>
      <details className="evidence">
        <summary>
          {t.evidence} · {draft.evidence.length}
        </summary>
        {draft.evidence.map((e, i) => (
          <div key={i}>
            <b>{fieldDefinitions[e.field][locale === "fr" ? 0 : 1]}</b>
            <blockquote>{e.quote}</blockquote>
          </div>
        ))}
      </details>
      <div className="save-area">
        <button
          disabled={busy || isSaved}
          className="primary-button"
          onClick={onSave}
        >
          {isSaved ? <Check size={18} /> : <LockKeyhole size={17} />}{" "}
          {isSaved ? t.saved : t.save}
        </button>
        <small>
          <ShieldCheck size={13} />
          {t.savedHint}
        </small>
      </div>
    </div>
  );
}
