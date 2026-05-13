export const DEFAULT_LABEL_SCHEMA = Object.freeze([
  Object.freeze({ class_id: 1, name: "target", color: "#E5484D", enabled: true }),
  Object.freeze({ class_id: 2, name: "defect", color: "#176B87", enabled: true }),
  Object.freeze({ class_id: 3, name: "ignore", color: "#B7791F", enabled: true }),
]);

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/u;

export function normalizeLabelSchema(input = []) {
  const labels = Array.isArray(input) ? input.map(normalizeLabel).filter(Boolean) : [];
  const deduped = [];
  const seen = new Set();

  for (const label of labels.sort((a, b) => a.class_id - b.class_id)) {
    if (seen.has(label.class_id)) continue;
    seen.add(label.class_id);
    deduped.push(label);
  }

  return deduped.length > 0 ? deduped : DEFAULT_LABEL_SCHEMA.map(copyLabel);
}

export function labelByClassId(labels, classId) {
  const normalizedClassId = toPositiveInt(classId);
  if (!normalizedClassId) return null;
  return normalizeLabelSchema(labels).find((label) => label.class_id === normalizedClassId) || null;
}

export function validateClassId(labels, classId) {
  const label = labelByClassId(labels, classId);
  if (!label) {
    return { valid: false, reason: "unknown_class_id" };
  }
  if (label.enabled === false) {
    return { valid: false, reason: "disabled_class_id", label };
  }
  return { valid: true, reason: "", label };
}

function normalizeLabel(input) {
  const classId = toPositiveInt(input?.class_id ?? input?.classId);
  const name = normalizeName(input?.name || input?.class_name || input?.className);
  if (!classId || !name) return null;

  return {
    class_id: classId,
    name,
    color: normalizeColor(input?.color, classId),
    enabled: input?.enabled === false ? false : true,
  };
}

function normalizeName(value) {
  return String(value || "").trim().slice(0, 80);
}

function normalizeColor(value, classId) {
  const color = String(value || "").trim().toUpperCase();
  if (HEX_COLOR_PATTERN.test(color)) return color;
  const fallback = DEFAULT_LABEL_SCHEMA.find((label) => label.class_id === classId);
  return fallback?.color || "#7C8792";
}

function toPositiveInt(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return 0;
  return number;
}

function copyLabel(label) {
  return { ...label };
}
