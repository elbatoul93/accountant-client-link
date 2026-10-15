// Builds the Supabase Auth email templates (supabase/templates/*) from the copy below.
// Supabase hosted projects read templates from the dashboard, so the generated files are
// pasted there by hand; keeping the source here lets them be reviewed and versioned.
// Run: node scripts/auth-emails/build.mjs         (writes the files)
//      node scripts/auth-emails/build.mjs --check (fails when the files are stale)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "templates");

const copy = {
  confirmation: {
    ar: { subject: "تأكيد بريدك الإلكتروني - Managementik", title: "مرحباً بكم في Managementik", text: "اضغطوا على الزر أدناه لتأكيد بريدكم الإلكتروني وإنهاء إنشاء حسابكم.", button: "تأكيد البريد الإلكتروني", ignore: "إذا لم تنشئوا حساباً، تجاهلوا هذه الرسالة." },
    fr: { subject: "Confirmez votre adresse e-mail - Managementik", title: "Bienvenue sur Managementik", text: "Cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail et finaliser la création de votre compte.", button: "Confirmer mon e-mail", ignore: "Si vous n'avez pas créé de compte, ignorez ce message." },
    en: { subject: "Confirm your email address - Managementik", title: "Welcome to Managementik", text: "Click the button below to confirm your email address and finish creating your account.", button: "Confirm email address", ignore: "If you did not create an account, you can ignore this message." },
  },
  recovery: {
    ar: { subject: "إعادة تعيين كلمة المرور - Managementik", title: "إعادة تعيين كلمة المرور", text: "تلقينا طلباً لإعادة تعيين كلمة مرور حسابكم. اضغطوا على الزر أدناه لاختيار كلمة مرور جديدة.", button: "إعادة تعيين كلمة المرور", ignore: "إذا لم تطلبوا ذلك، تجاهلوا هذه الرسالة؛ ستبقى كلمة مروركم دون تغيير." },
    fr: { subject: "Réinitialisez votre mot de passe - Managementik", title: "Réinitialisation du mot de passe", text: "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.", button: "Réinitialiser le mot de passe", ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé." },
    en: { subject: "Reset your password - Managementik", title: "Reset your password", text: "We received a request to reset your account password. Click the button below to choose a new one.", button: "Reset password", ignore: "If you did not request this, ignore this message; your password stays unchanged." },
  },
};

const LANGS = ["ar", "fr", "en"];
const rtl = (l) => l === "ar";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const block = (c, l) => `<div dir="${rtl(l) ? "rtl" : "ltr"}" lang="${l}" style="text-align:${rtl(l) ? "right" : "left"};">
  <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${esc(c.title)}</h2>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">${esc(c.text)}</p>
  <p style="margin:0 0 20px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 22px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold;">${esc(c.button)}</a></p>
  <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">${esc(c.ignore)}</p>
</div>`;

// The language comes from user_metadata.locale, written by the app at signup. Without it
// (accounts created before this change) the email shows Arabic and French together.
const pick = (render, bilingual) => `{{- $l := "" -}}
{{- with .Data }}{{ with .locale }}{{ $l = printf "%v" . }}{{ end }}{{ end -}}
{{ if eq $l "ar" }}${render("ar")}{{ else if eq $l "fr" }}${render("fr")}{{ else if eq $l "en" }}${render("en")}{{ else }}${bilingual}{{ end }}`;

const subjectFor = (c) =>
  `{{- $l := "" }}{{ with .Data }}{{ with .locale }}{{ $l = printf "%v" . }}{{ end }}{{ end }}{{ if eq $l "fr" }}${c.fr.subject}{{ else if eq $l "en" }}${c.en.subject}{{ else if eq $l "ar" }}${c.ar.subject}{{ else }}${c.ar.subject} / ${c.fr.subject}{{ end -}}`;

const files = {};
for (const [name, c] of Object.entries(copy)) {
  const bilingual = `${block(c.ar, "ar")}\n<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">\n${block(c.fr, "fr")}`;
  files[`${name}.html`] = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:28px;background:#ffffff;border-radius:8px;">
${pick((l) => "\n" + block(c[l], l) + "\n", "\n" + bilingual + "\n")}
    </div>
  </body>
</html>
`;
  files[`${name}.subject.txt`] = subjectFor(c) + "\n";
}

const check = process.argv.includes("--check");
let stale = false;
if (!check) mkdirSync(outDir, { recursive: true });
for (const [file, body] of Object.entries(files)) {
  const path = join(outDir, file);
  if (check) {
    let cur = "";
    try { cur = readFileSync(path, "utf8"); } catch { /* missing */ }
    if (cur !== body) { console.error(`stale: supabase/templates/${file}`); stale = true; }
  } else writeFileSync(path, body);
}
if (stale) process.exit(1);
