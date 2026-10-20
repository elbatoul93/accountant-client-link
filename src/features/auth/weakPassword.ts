/** Translation key for a Supabase `weak_password` error, naming the rule that failed when it says which. */
export const weakPasswordKey = (err: { reasons?: unknown }) => {
  const reasons = Array.isArray(err.reasons) ? err.reasons : [];
  if (reasons.includes("pwned")) return "auth_password_pwned";
  if (reasons.includes("characters")) return "auth_password_characters";
  return "auth_reset_weak";
};
