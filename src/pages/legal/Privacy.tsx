import { LegalLayout, COMPANY, CONTACT_EMAIL } from "./LegalLayout";

const Privacy = () => (
  <LegalLayout title="Politique de confidentialité">
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
      Hébergement et base de données : Supabase. Diffusion du site : Cloudflare. Conversion de documents PDF :
      CloudConvert. Ces prestataires traitent les données pour notre compte. Nous ne vendons pas vos données.
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
  </LegalLayout>
);

export default Privacy;
