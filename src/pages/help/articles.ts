export type HelpLang = "fr" | "ar";
export type Audience = "accountant" | "client" | "all";

export interface HelpArticle {
  id: string;
  audience: Audience;
  title: Record<HelpLang, string>;
  /** One paragraph (optional) then numbered steps. */
  intro?: Record<HelpLang, string>;
  steps: Record<HelpLang, string[]>;
}

// French is the reference text; Arabic is a translation. Keep both in step when a screen changes.
export const ARTICLES: HelpArticle[] = [
  {
    id: "accountant-start",
    audience: "accountant",
    title: { fr: "Créer votre compte comptable", ar: "إنشاء حسابك كمحاسب" },
    intro: {
      fr: "Chaque nouveau compte comptable est vérifié manuellement avant son activation.",
      ar: "يُراجَع كل حساب محاسب جديد يدويًا قبل تفعيله.",
    },
    steps: {
      fr: [
        "Cliquez sur « Commencer » puis créez votre compte avec votre nom, votre e-mail, le nom du cabinet et un mot de passe.",
        "Acceptez les conditions d'utilisation et la politique de confidentialité.",
        "Un écran « Votre compte est en attente d'activation » s'affiche tant que nous n'avons pas validé le compte. Écrivez-nous à contact@managementik.dz si l'attente se prolonge.",
        "Une fois le compte activé, connectez-vous : vous arrivez sur votre tableau de bord.",
      ],
      ar: [
        "اضغط على « ابدأ » ثم أنشئ حسابك بإدخال اسمك وبريدك الإلكتروني واسم المكتب وكلمة مرور.",
        "وافق على شروط الاستخدام وسياسة الخصوصية.",
        "تظهر شاشة « حسابك في انتظار التفعيل » إلى حين مراجعة الحساب. راسلنا على contact@managementik.dz إذا طال الانتظار.",
        "بعد تفعيل الحساب سجّل الدخول لتصل إلى لوحة التحكم.",
      ],
    },
  },
  {
    id: "accountant-invite",
    audience: "accountant",
    title: { fr: "Inviter un client", ar: "دعوة عميل" },
    intro: {
      fr: "Vos clients accèdent au service uniquement sur invitation de leur cabinet.",
      ar: "لا يصل العملاء إلى الخدمة إلا بدعوة من مكتبهم.",
    },
    steps: {
      fr: [
        "Dans la liste des clients, ouvrez « Inviter un client ».",
        "Saisissez l'e-mail du client (facultatif) puis cliquez sur « Générer le lien ». Le lien est copié automatiquement.",
        "Envoyez le lien à votre client (e-mail, WhatsApp, etc.).",
        "Le client crée son compte depuis ce lien et il est automatiquement relié à votre cabinet. L'invitation passe de « Active » à « Utilisée ».",
        "Un lien « Expirée » ne fonctionne plus : générez-en un nouveau.",
      ],
      ar: [
        "في قائمة الزبائن افتح « دعوة زبون ».",
        "أدخل البريد الإلكتروني للزبون (اختياري) ثم اضغط « إنشاء الرابط ». يُنسخ الرابط تلقائيًا.",
        "أرسل الرابط إلى زبونك (بريد إلكتروني، واتساب، إلخ).",
        "ينشئ الزبون حسابه من هذا الرابط ويرتبط تلقائيًا بمكتبك. تتحول الدعوة من « نشطة » إلى « مستعملة ».",
        "الرابط « المنتهي » لم يعد صالحًا: أنشئ رابطًا جديدًا.",
      ],
    },
  },
  {
    id: "accountant-documents",
    audience: "accountant",
    title: { fr: "Suivre les documents du mois", ar: "متابعة وثائق الشهر" },
    intro: {
      fr: "Le suivi des documents montre, client par client, ce qui est manquant, reçu ou validé.",
      ar: "تعرض متابعة الوثائق، زبونًا بزبون، ما هو ناقص وما تم استلامه وما تمت المصادقة عليه.",
    },
    steps: {
      fr: [
        "Ouvrez « Suivi documents » dans le menu.",
        "Les clients déposent leurs factures avant le 10 du mois ; elles apparaissent aussi dans « Documents reçus ».",
        "Pour chaque document, utilisez « Marquer reçu » puis « Valider » une fois contrôlé. « Réinitialiser » remet le statut à « Manquant ».",
        "Lorsque tous les documents requis sont validés, un message l'indique pour le mois.",
      ],
      ar: [
        "افتح « متابعة الوثائق » من القائمة.",
        "يودع الزبائن فواتيرهم قبل 10 من الشهر؛ وتظهر أيضًا في « الوثائق الواردة ».",
        "لكل وثيقة استعمل « تحديد كمستلمة » ثم « مصادقة » بعد المراجعة. و« إعادة التعيين » يعيد الحالة إلى « ناقصة ».",
        "عند مصادقة كل الوثائق المطلوبة تظهر رسالة تؤكد ذلك للشهر.",
      ],
    },
  },
  {
    id: "accountant-g50",
    audience: "accountant",
    title: { fr: "Générer et envoyer un G50", ar: "إنشاء وإرسال تصريح G50" },
    intro: {
      fr: "Le G50 est calculé à partir de vos écritures ; vérifiez toujours les montants avant envoi.",
      ar: "يُحسب G50 انطلاقًا من قيودك؛ تحقق دائمًا من المبالغ قبل الإرسال.",
    },
    steps: {
      fr: [
        "Ouvrez « Outils du métier » puis « Générateur G50 ».",
        "Choisissez le client et la période (mois), puis « Générer G50 ». Vous pouvez modifier les montants avec « Modifier ».",
        "Choisissez le format : « Générer PDF » ou « Générer Excel ». Si le service PDF est indisponible, le fichier Excel est téléchargé à la place.",
        "Cliquez sur « Envoyer au client » : le client reçoit une notification et peut vérifier et signer la déclaration.",
        "Rappel : l'outil aide à préparer la déclaration, il ne remplace pas votre contrôle.",
      ],
      ar: [
        "افتح « أدوات المهنة » ثم « مولّد G50 ».",
        "اختر الزبون والفترة (الشهر) ثم « إنشاء G50 ». يمكنك تعديل المبالغ بزر « تعديل ».",
        "اختر الصيغة: « إنشاء PDF » أو « إنشاء Excel ». إذا كانت خدمة PDF غير متاحة يُنزَّل ملف Excel بدلًا منه.",
        "اضغط « إرسال إلى الزبون »: يتلقى الزبون إشعارًا ويمكنه مراجعة التصريح والتوقيع عليه.",
        "تذكير: الأداة تساعد على إعداد التصريح ولا تغني عن مراجعتك.",
      ],
    },
  },
  {
    id: "accountant-payroll",
    audience: "accountant",
    title: { fr: "Gérer la paie et les fiches de paie", ar: "تسيير الأجور وكشوف الرواتب" },
    steps: {
      fr: [
        "Ouvrez « Paie », choisissez le client puis ajoutez ses salariés (salaire de base, primes, matricule CNAS, date d'embauche).",
        "Générez la fiche de paie du salarié : elle se présente en français avec le détail des gains, des retenues et le net à payer. Vous pouvez l'imprimer.",
        "Enregistrez la paie réellement versée : la Déclaration Annuelle des Salaires (DAS) est construite à partir de ces fiches.",
        "Les barèmes (IRG, CNAS) sont ceux en vigueur ; faites confirmer vos cas particuliers (indemnités exonérées, etc.) par un comptable.",
      ],
      ar: [
        "افتح « الأجور »، اختر الزبون ثم أضف عماله (الأجر الأساسي، العلاوات، رقم الضمان الاجتماعي، تاريخ التوظيف).",
        "أنشئ كشف راتب العامل: يعرض تفاصيل المستحقات والاقتطاعات والصافي المستحق، ويمكن طباعته.",
        "سجّل الأجور المدفوعة فعلًا: يُبنى التصريح السنوي بالأجور (DAS) انطلاقًا من هذه الكشوف.",
        "الجداول المعتمدة (IRG، الضمان الاجتماعي) هي السارية؛ أكّد الحالات الخاصة (التعويضات المعفاة، إلخ) مع محاسب.",
      ],
    },
  },
  {
    id: "accountant-calendar",
    audience: "accountant",
    title: { fr: "Suivre le calendrier fiscal", ar: "متابعة الروزنامة الجبائية" },
    steps: {
      fr: [
        "Ouvrez « Calendrier Fiscal » pour voir les prochaines échéances (G50, CNAS, CASNOS, DAS, IBS, etc.) selon le régime du client.",
        "Renseignez correctement le régime fiscal du client (Réel, Simplifié, IFU) dans sa fiche : le calendrier en dépend.",
        "Les clients voient leurs échéances à venir dans leur propre espace.",
      ],
      ar: [
        "افتح « الروزنامة الجبائية » لرؤية الآجال القادمة (G50، الضمان الاجتماعي، كاسنوس، DAS، IBS، إلخ) حسب نظام الزبون.",
        "أدخل النظام الجبائي للزبون (حقيقي، مبسّط، IFU) بشكل صحيح في بطاقته، فالروزنامة تتوقف عليه.",
        "يرى الزبائن آجالهم القادمة في فضائهم الخاص.",
      ],
    },
  },
  {
    id: "client-start",
    audience: "client",
    title: { fr: "Accepter l'invitation de votre comptable", ar: "قبول دعوة محاسبك" },
    steps: {
      fr: [
        "Ouvrez le lien d'invitation reçu de votre cabinet.",
        "Complétez votre inscription avec le même e-mail que celui de l'invitation et choisissez un mot de passe.",
        "Acceptez les conditions et la politique de confidentialité, puis créez le compte.",
        "Si le lien affiche « Lien d'invitation expiré », demandez à votre comptable de vous en envoyer un nouveau.",
        "Ensuite, connectez-vous depuis la page de connexion avec votre e-mail et votre mot de passe.",
      ],
      ar: [
        "افتح رابط الدعوة الذي وصلك من مكتبك.",
        "أكمل تسجيلك بنفس البريد الإلكتروني المذكور في الدعوة واختر كلمة مرور.",
        "وافق على الشروط وسياسة الخصوصية ثم أنشئ الحساب.",
        "إذا ظهرت عبارة « رابط الدعوة منتهي الصلاحية » فاطلب من محاسبك إرسال رابط جديد.",
        "بعد ذلك سجّل الدخول من صفحة الدخول ببريدك وكلمة مرورك.",
      ],
    },
  },
  {
    id: "client-upload",
    audience: "client",
    title: { fr: "Envoyer vos factures et documents", ar: "إرسال فواتيرك ووثائقك" },
    intro: {
      fr: "Envoyez vos documents à votre comptable avant le 10 de chaque mois.",
      ar: "أرسل وثائقك إلى محاسبك قبل 10 من كل شهر.",
    },
    steps: {
      fr: [
        "Dans votre espace, ouvrez le « Centre de dépôt ».",
        "Choisissez le fichier (taille et type limités ; un message vous prévient si le fichier est refusé), ajoutez un titre puis envoyez.",
        "Votre comptable est notifié immédiatement et le document apparaît dans votre coffre-fort.",
        "La liste « Suivi des documents » indique ce qui manque encore pour le mois.",
      ],
      ar: [
        "في فضائك افتح « مركز الإيداع ».",
        "اختر الملف (الحجم والنوع محدودان؛ وتظهر رسالة إن رُفض الملف)، أضف عنوانًا ثم أرسل.",
        "يُشعَر محاسبك فورًا ويظهر المستند في خزنتك.",
        "تبيّن قائمة « متابعة الوثائق » ما ينقص بعد لهذا الشهر.",
      ],
    },
  },
  {
    id: "client-sign",
    audience: "client",
    title: { fr: "Vérifier et signer une déclaration", ar: "مراجعة تصريح والتوقيع عليه" },
    steps: {
      fr: [
        "Quand votre comptable envoie une déclaration (par exemple un G50), vous recevez une notification.",
        "Ouvrez « Déclarations à approuver » puis « Vérifier & Signer ».",
        "Contrôlez le document, signez dans le cadre prévu et validez.",
        "Le document signé est conservé dans le coffre-fort avec la date de signature ; il ne peut plus être supprimé.",
      ],
      ar: [
        "عندما يرسل محاسبك تصريحًا (مثل G50) يصلك إشعار.",
        "افتح « التصريحات في انتظار الموافقة » ثم « مراجعة وتوقيع ».",
        "راجع الوثيقة ووقّع في الإطار المخصص ثم أكّد.",
        "تُحفظ الوثيقة الموقعة في الخزنة مع تاريخ التوقيع ولا يمكن حذفها بعد ذلك.",
      ],
    },
  },
  {
    id: "client-find",
    audience: "client",
    title: { fr: "Retrouver vos documents et écrire à votre comptable", ar: "العثور على وثائقك ومراسلة محاسبك" },
    steps: {
      fr: [
        "« Documents de mon comptable » regroupe les fichiers partagés par votre cabinet, à télécharger.",
        "Le « Coffre-fort documents » conserve l'historique de vos factures déposées et des déclarations signées.",
        "« Messages » permet d'écrire à votre comptable ; vous voyez les échéances à venir dans « Échéances à venir ».",
      ],
      ar: [
        "« وثائق محاسبي » تجمع الملفات التي شاركها مكتبك ويمكنك تنزيلها.",
        "« خزنة الوثائق » تحفظ سجل فواتيرك المودعة والتصريحات الموقعة.",
        "« الرسائل » تتيح لك مراسلة محاسبك، وتجد الآجال القادمة في « الآجال القادمة ».",
      ],
    },
  },
  {
    id: "all-password",
    audience: "all",
    title: { fr: "Mot de passe oublié", ar: "نسيت كلمة المرور" },
    steps: {
      fr: [
        "Sur la page de connexion, cliquez sur « Mot de passe oublié ».",
        "Saisissez votre e-mail : vous recevez un lien de réinitialisation.",
        "Ouvrez le lien et choisissez un nouveau mot de passe. Vérifiez vos courriers indésirables si rien n'arrive.",
      ],
      ar: [
        "في صفحة الدخول اضغط « نسيت كلمة المرور ».",
        "أدخل بريدك الإلكتروني: يصلك رابط لإعادة التعيين.",
        "افتح الرابط واختر كلمة مرور جديدة. تفقد البريد غير المرغوب فيه إن لم يصلك شيء.",
      ],
    },
  },
  {
    id: "all-language",
    audience: "all",
    title: { fr: "Changer la langue", ar: "تغيير اللغة" },
    steps: {
      fr: [
        "Utilisez le sélecteur de langue en haut de la page : français, arabe ou anglais.",
        "Votre choix est mémorisé sur cet appareil. En arabe, l'affichage passe de droite à gauche.",
      ],
      ar: [
        "استعمل محدد اللغة في أعلى الصفحة: الفرنسية أو العربية أو الإنجليزية.",
        "يُحفظ اختيارك على هذا الجهاز. وفي العربية يتحول العرض من اليمين إلى اليسار.",
      ],
    },
  },
  {
    id: "all-account",
    audience: "all",
    title: { fr: "Télécharger ou supprimer mes données", ar: "تنزيل بياناتي أو حذفها" },
    steps: {
      fr: [
        "Ouvrez le menu de votre profil puis « Compte ».",
        "« Télécharger mes données » fournit une copie de votre profil, de vos données et de vos messages au format JSON.",
        "« Supprimer mon compte » supprime définitivement le compte et les données ; saisissez DELETE pour confirmer.",
        "Certains documents doivent être conservés 10 ans : dans ce cas le compte ne peut pas être supprimé depuis cette page et il faut contacter le support.",
      ],
      ar: [
        "افتح قائمة ملفك الشخصي ثم « الحساب ».",
        "« تنزيل بياناتي » يمنحك نسخة من ملفك وبياناتك ورسائلك بصيغة JSON.",
        "« حذف حسابي » يحذف الحساب والبيانات نهائيًا؛ اكتب DELETE للتأكيد.",
        "يجب الاحتفاظ ببعض الوثائق 10 سنوات: في هذه الحالة لا يمكن حذف الحساب من هذه الصفحة ويجب التواصل مع الدعم.",
      ],
    },
  },
  {
    id: "accountant-subscription",
    audience: "accountant",
    title: { fr: "Essai gratuit, abonnement et lecture seule", ar: "الفترة التجريبية والاشتراك والقراءة فقط" },
    steps: {
      fr: [
        "Pendant l'essai gratuit, un bandeau indique le nombre de jours restants.",
        "À la fin de l'abonnement, vous gardez quelques jours d'accès complet, signalés par un bandeau rouge.",
        "Ensuite le compte passe en lecture seule : vous pouvez consulter et exporter vos données, mais plus les modifier.",
        "Pour vous abonner ou renouveler, écrivez à contact@managementik.dz ; un reçu numéroté vous est remis après paiement.",
      ],
      ar: [
        "خلال الفترة التجريبية المجانية يبيّن شريط عدد الأيام المتبقية.",
        "عند انتهاء الاشتراك تحتفظ ببضعة أيام من الوصول الكامل يشير إليها شريط أحمر.",
        "بعدها يصبح الحساب للقراءة فقط: يمكنك الاطلاع على بياناتك وتصديرها دون تعديلها.",
        "للاشتراك أو التجديد راسلنا على contact@managementik.dz؛ يُسلَّم لك وصل مرقّم بعد الدفع.",
      ],
    },
  },
];
