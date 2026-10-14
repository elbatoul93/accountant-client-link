import { useApp } from "@/contexts/AppContext";
import { LegalLayout, COMPANY, CONTACT_EMAIL } from "./LegalLayout";

const TermsFr = () => (
  <>
    <p>
      Les présentes conditions régissent l'utilisation de la plateforme Managementik, éditée par {COMPANY}.
      En créant un compte, vous les acceptez.
    </p>

    <h2>1. Le service</h2>
    <p>
      Managementik permet à un cabinet comptable d'inviter ses clients, d'échanger des documents, de préparer
      des déclarations et de suivre les échéances fiscales. Les clients accèdent au service sur invitation de leur cabinet.
    </p>

    <h2>2. Un outil d'aide, pas un conseil</h2>
    <p>
      Les calculs, modèles et déclarations générés sont une aide à la préparation. Ils ne constituent pas un
      conseil fiscal, comptable ou juridique. Le cabinet reste seul responsable de l'exactitude des
      déclarations transmises à l'administration et de la vérification des résultats.
    </p>

    <h2>3. Comptes</h2>
    <p>
      Vous êtes responsable de la confidentialité de vos identifiants et de l'activité sur votre compte.
      Les informations fournies doivent être exactes.
    </p>

    <h2>4. Données</h2>
    <p>
      Le cabinet et ses clients conservent la propriété de leurs données. Nous les traitons selon la{" "}
      <a className="text-primary underline" href="/privacy">politique de confidentialité</a>. Vous pouvez
      exporter vos données et demander leur suppression à la fin du contrat.
    </p>

    <h2>5. Utilisation acceptable</h2>
    <p>
      Il est interdit d'utiliser le service de manière illicite, de téléverser des contenus illégaux ou
      malveillants, ou de chercher à accéder aux données d'autrui.
    </p>

    <h2>6. Disponibilité et responsabilité</h2>
    <p>
      Nous nous efforçons d'assurer un service continu sans le garantir. Dans les limites permises par la
      loi, notre responsabilité est limitée au montant payé pour le service sur les 12 derniers mois et
      exclut les dommages indirects.
    </p>

    <h2>7. Résiliation</h2>
    <p>
      Vous pouvez fermer votre compte à tout moment. Nous pouvons suspendre un compte en cas de violation
      des présentes conditions.
    </p>

    <h2>8. Droit applicable</h2>
    <p>Droit algérien. Tribunaux compétents : ceux du siège de {COMPANY}.</p>

    <h2>9. Mentions légales et contact</h2>
    <p>
      {COMPANY}. Registre du commerce, NIF et adresse : à compléter. Contact :{" "}
      <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
    </p>
  </>
);

const TermsAr = () => (
  <>
    <p>
      تحكم هذه الشروط استخدام منصة Managementik التي تنشرها {COMPANY}. بإنشائكم حسابًا فإنكم تقبلونها.
    </p>

    <h2>1. الخدمة</h2>
    <p>
      تتيح Managementik لمكتب المحاسبة دعوة عملائه وتبادل الوثائق وإعداد التصريحات ومتابعة الآجال الجبائية.
      ويصل العملاء إلى الخدمة بدعوة من مكتبهم.
    </p>

    <h2>2. أداة مساعدة وليست استشارة</h2>
    <p>
      الحسابات والنماذج والتصريحات المُنشأة هي مساعدة على الإعداد، ولا تشكّل استشارة جبائية أو محاسبية أو
      قانونية. ويبقى المكتب وحده مسؤولًا عن صحة التصريحات المرسلة إلى الإدارة وعن التحقق من النتائج.
    </p>

    <h2>3. الحسابات</h2>
    <p>
      أنتم مسؤولون عن سرية معرّفاتكم وعن النشاط الجاري على حسابكم. ويجب أن تكون المعلومات المقدَّمة صحيحة.
    </p>

    <h2>4. المعطيات</h2>
    <p>
      يحتفظ المكتب وعملاؤه بملكية معطياتهم. ونعالجها وفق{" "}
      <a className="text-primary underline" href="/privacy">سياسة الخصوصية</a>. يمكنكم تصدير معطياتكم
      وطلب حذفها عند انتهاء العقد.
    </p>

    <h2>5. الاستخدام المقبول</h2>
    <p>
      يُمنع استخدام الخدمة بشكل غير مشروع، أو رفع محتويات غير قانونية أو ضارة، أو محاولة الوصول إلى معطيات الغير.
    </p>

    <h2>6. التوفر والمسؤولية</h2>
    <p>
      نسعى إلى ضمان خدمة مستمرة دون أن نضمنها. وفي الحدود التي يسمح بها القانون، تقتصر مسؤوليتنا على المبلغ المدفوع
      مقابل الخدمة خلال الاثني عشر شهرًا الأخيرة، وتستثني الأضرار غير المباشرة.
    </p>

    <h2>7. الإنهاء</h2>
    <p>
      يمكنكم إغلاق حسابكم في أي وقت. ويجوز لنا تعليق حساب عند مخالفة هذه الشروط.
    </p>

    <h2>8. القانون المطبّق</h2>
    <p>القانون الجزائري. المحاكم المختصة: محاكم مقر {COMPANY}.</p>

    <h2>9. الإشارات القانونية والاتصال</h2>
    <p>
      {COMPANY}. السجل التجاري والرقم الجبائي والعنوان: يُستكمل لاحقًا. للاتصال:{" "}
      <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
    </p>
  </>
);

const Terms = () => {
  const { lang } = useApp();
  const ar = lang === "ar";
  return (
    <LegalLayout title={ar ? "شروط الاستخدام العامة" : "Conditions générales d'utilisation"}>
      {ar ? <TermsAr /> : <TermsFr />}
    </LegalLayout>
  );
};

export default Terms;
