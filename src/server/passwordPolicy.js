export function validatePasswordPolicy(value) {
  const password = String(value || "");
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumberOrSymbol = /[0-9]/.test(password) || /[^A-Za-z0-9\s]/.test(password);
  if (password.length < 8 || !hasLetter || !hasNumberOrSymbol) {
    throw passwordPolicyError(
      "weak_password",
      "Password must be at least 8 characters and include letters plus a number or symbol",
      400,
    );
  }
}

function passwordPolicyError(code, message, statusCode) {
  return Object.assign(new Error(message), { code, statusCode });
}
