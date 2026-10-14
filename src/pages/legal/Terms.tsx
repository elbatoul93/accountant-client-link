import { LegalLayout, COMPANY, CONTACT_EMAIL } from "./LegalLayout";

const Terms = () => (
  <LegalLayout title="Conditions générales d'utilisation">
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
  </LegalLayout>
);

export default Terms;
