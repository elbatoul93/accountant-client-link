import { useApp } from "@/contexts/AppContext";
import { LegalLayout, COMPANY, CONTACT_EMAIL } from "./LegalLayout";

const PrivacyFr = () => (
  <>
    <p>
      {COMPANY} (« Managementik », « nous ») édite la plateforme Managementik, qui relie les cabinets
      comptables et leurs clients. Cette politique explique quelles données personnelles nous traitons et
      pourquoi, conformément à la loi algérienne n° 18-07 relative à la protection des personnes physiques
      dans le traitement des données à caractère personnel.
    </p>

    <h2>1. Rôles</h2>
    <p>
      Le cabinet comptable est responsable du traitement des données de ses clients (documents, déclarations,
      paie). Managementik agit comme sous-traitant pour ces données, selon les instructions du cabinet.
      Managementik est responsable du traitement des données de compte des utilisateurs (nom, e-mail, mot de passe chiffré).
    </p>

    <h2>2. Données traitées</h2>
    <ul>
      <li>Compte : nom, adresse e-mail, société, rôle (comptable ou client).</li>
      <li>Documents et échanges : fichiers téléversés, messages, signatures, déclarations (G50, CNAS, etc.).</li>
      <li>Données comptables et de paie saisies par le cabinet : identifiants fiscaux (NIF, NIS, RC), salariés, salaires, cotisations.</li>
      <li>Données techniques : journaux de connexion et erreurs, nécessaires à la sécurité et au dépannage.</li>
    </ul>

    <h2>3. Finalités et base légale</h2>
    <ul>
      <li>Fournir le service (exécution du contrat avec le cabinet et ses clients).</li>
      <li>Sécuriser les comptes et prévenir les abus (intérêt légitime).</li>
      <li>Respecter nos obligations légales.</li>
    </ul>

    <h2>4. Destinataires et sous-traitants</h2>
    <p>
      Hébergement et base de données : Supabase. Diffusion du site : Cloudflare. Ces prestataires traitent les données pour notre compte. Nous ne vendons pas vos données.
    </p>

    <h2>5. Transfert hors d'Algérie</h2>
    <p>
      Certains prestataires hébergent des données hors d'Algérie. Les formalités auprès de l'ANPDP
      (déclaration ou autorisation) seront accomplies avant l'ouverture commerciale.
    </p>

    <h2>6. Durée de conservation</h2>
    <p>
      Les données sont conservées tant que le compte est actif, puis supprimées ou anonymisées dans un délai
      de 12 mois après la clôture, sauf obligation légale de conservation (notamment comptable).
    </p>

    <h2>7. Vos droits</h2>
    <p>
      Vous pouvez demander l'accès, la rectification ou la suppression de vos données, et vous opposer à
      leur traitement, en écrivant à <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      Pour les données de clients d'un cabinet, adressez-vous d'abord à ce cabinet.
    </p>

    <h2>8. Stockage dans le navigateur</h2>
    <p>
      Le site utilise le stockage local du navigateur uniquement pour la session, la langue choisie et le
      fonctionnement de l'application. Aucun traceur publicitaire n'est utilisé.
    </p>

    <h2>9. Violation de données</h2>
    <p>En cas de violation de données à risque, nous informons sans délai les cabinets concernés et les autorités compétentes.</p>
  </>
);

const PrivacyEn = () => (
  <>
    <p>
      {COMPANY} ("Managementik", "we") publishes the Managementik platform, which connects accounting firms
      and their clients. This policy explains which personal data we process and why, in line with Algerian
      law no. 18-07 on the protection of individuals in the processing of personal data.
    </p>

    <h2>1. Roles</h2>
    <p>
      The accounting firm is the controller of its clients' data (documents, declarations, payroll).
      Managementik acts as a processor for that data, on the firm's instructions. Managementik is the
      controller of user account data (name, email, encrypted password).
    </p>

    <h2>2. Data we process</h2>
    <ul>
      <li>Account: name, email address, company, role (accountant or client).</li>
      <li>Documents and exchanges: uploaded files, messages, signatures, declarations (G50, CNAS, etc.).</li>
      <li>Accounting and payroll data entered by the firm: tax identifiers (NIF, NIS, RC), employees, salaries, contributions.</li>
      <li>Technical data: connection and error logs, needed for security and troubleshooting.</li>
    </ul>

    <h2>3. Purposes and legal basis</h2>
    <ul>
      <li>Providing the service (performance of the contract with the firm and its clients).</li>
      <li>Securing accounts and preventing abuse (legitimate interest).</li>
      <li>Meeting our legal obligations.</li>
    </ul>

    <h2>4. Recipients and processors</h2>
    <p>
      Hosting and database: Supabase. Website delivery: Cloudflare.
      These providers process data on our behalf. We do not sell your data.
    </p>

    <h2>5. Transfers outside Algeria</h2>
    <p>
      Some providers host data outside Algeria. The formalities with the ANPDP (declaration or authorisation)
      will be completed before commercial launch.
    </p>

    <h2>6. Retention</h2>
    <p>
      Data is kept while the account is active, then deleted or anonymised within 12 months after closure,
      unless the law requires it to be kept (in particular accounting records).
    </p>

    <h2>7. Your rights</h2>
    <p>
      You can ask for access to, correction or deletion of your data, and object to its processing, by writing to{" "}
      <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      For the data of an accounting firm's clients, contact that firm first.
    </p>

    <h2>8. Browser storage</h2>
    <p>
      The site uses the browser's local storage only for the session, the chosen language and the
      operation of the application. No advertising trackers are used.
    </p>

    <h2>9. Data breaches</h2>
    <p>If a data breach poses a risk, we promptly inform the firms concerned and the competent authorities.</p>
  </>
);

const PrivacyAr = () => (
  <>
    <p>
      تقوم {COMPANY} (« Managementik »، « نحن ») بنشر منصة Managementik التي تربط مكاتب المحاسبة بعملائها. توضح هذه
      السياسة المعطيات الشخصية التي نعالجها وسبب معالجتها، وفقًا للقانون الجزائري رقم 18-07 المتعلق بحماية
      الأشخاص الطبيعيين في مجال معالجة المعطيات ذات الطابع الشخصي.
    </p>

    <h2>1. الأدوار</h2>
    <p>
      مكتب المحاسبة هو المسؤول عن معالجة معطيات عملائه (الوثائق، التصريحات، الأجور). وتعمل Managementik بصفة
      معالج من الباطن لهذه المعطيات وفق تعليمات المكتب. أما معطيات حسابات المستخدمين (الاسم، البريد الإلكتروني،
      كلمة المرور المشفّرة) فـ Managementik هي المسؤولة عن معالجتها.
    </p>

    <h2>2. المعطيات المعالَجة</h2>
    <ul>
      <li>الحساب: الاسم، عنوان البريد الإلكتروني، الشركة، الدور (محاسب أو عميل).</li>
      <li>الوثائق والمراسلات: الملفات المرفوعة، الرسائل، التوقيعات، التصريحات (G50، CNAS، إلخ).</li>
      <li>المعطيات المحاسبية ومعطيات الأجور التي يدخلها المكتب: المعرّفات الجبائية (NIF، NIS، RC)، العمال، الأجور، الاشتراكات.</li>
      <li>المعطيات التقنية: سجلات الاتصال والأخطاء، اللازمة للأمن والصيانة.</li>
    </ul>

    <h2>3. الغايات والأساس القانوني</h2>
    <ul>
      <li>تقديم الخدمة (تنفيذ العقد مع المكتب وعملائه).</li>
      <li>تأمين الحسابات ومنع إساءة الاستعمال (مصلحة مشروعة).</li>
      <li>احترام التزاماتنا القانونية.</li>
    </ul>

    <h2>4. المستلمون والمعالجون من الباطن</h2>
    <p>
      الاستضافة وقاعدة البيانات: Supabase. نشر الموقع: Cloudflare. يعالج هؤلاء
      المزوّدون المعطيات لحسابنا. نحن لا نبيع معطياتكم.
    </p>

    <h2>5. النقل خارج الجزائر</h2>
    <p>
      يستضيف بعض المزوّدين المعطيات خارج الجزائر. وستُنجَز الإجراءات لدى السلطة الوطنية لحماية المعطيات ذات
      الطابع الشخصي (التصريح أو الترخيص) قبل الإطلاق التجاري.
    </p>

    <h2>6. مدة الحفظ</h2>
    <p>
      تُحفظ المعطيات ما دام الحساب نشطًا، ثم تُحذف أو تُجهَّل هويتها في أجل 12 شهرًا بعد إغلاقه، ما لم يوجب القانون
      حفظها (لا سيما لأغراض المحاسبة).
    </p>

    <h2>7. حقوقكم</h2>
    <p>
      يمكنكم طلب الاطلاع على معطياتكم أو تصحيحها أو حذفها، والاعتراض على معالجتها، بمراسلتنا على{" "}
      <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      وبالنسبة لمعطيات عملاء مكتب محاسبة، توجّهوا أولًا إلى ذلك المكتب.
    </p>

    <h2>8. التخزين في المتصفح</h2>
    <p>
      يستخدم الموقع التخزين المحلي للمتصفح فقط للجلسة واللغة المختارة وتشغيل التطبيق. ولا تُستخدم أي أدوات تتبّع إعلانية.
    </p>

    <h2>9. خرق المعطيات</h2>
    <p>في حال حدوث خرق للمعطيات ينطوي على مخاطر، نُعلم المكاتب المعنية والسلطات المختصة دون تأخير.</p>
  </>
);

const Privacy = () => {
  const { lang } = useApp();
  const ar = lang === "ar";
  const en = lang === "en";
  return (
    <LegalLayout title={ar ? "سياسة الخصوصية" : en ? "Privacy Policy" : "Politique de confidentialité"}>
      {ar ? <PrivacyAr /> : en ? <PrivacyEn /> : <PrivacyFr />}
    </LegalLayout>
  );
};

export default Privacy;
