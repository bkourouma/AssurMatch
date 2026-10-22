import { readContentCapabilities } from "../../lib/admin-api";
import { contentReadErrorMessage } from "../../lib/content-messages";
import { Button, PageHeader, PageStack, StateMessage } from "../../lib/ui/admin-ui";
import { CreateContentEntryForm } from "../content-forms";

export default async function NewContentPage() {
  const capabilities = await readContentCapabilities();
  const canEdit = capabilities.status === "success" && capabilities.data.canEdit;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Contenu", href: "/content" }, { label: "Nouveau contenu" }]}
        kicker="Contenu éditorial"
        title="Nouveau contenu"
        description="Rédigez un brouillon (FAQ, guide, terme de glossaire ou surcharge légale d'un pays) dans une langue."
        actions={<Button href="/content" variant="secondary">Retour à la liste</Button>}
      />
      {capabilities.status !== "success" ? <StateMessage tone="danger">{contentReadErrorMessage(capabilities.forbidden ? "access_denied" : capabilities.error)}</StateMessage> : null}
      {capabilities.status === "success" && !canEdit ? (
        <StateMessage tone="warning">Votre rôle peut consulter et valider le contenu, mais pas en créer.</StateMessage>
      ) : null}
      {canEdit ? <CreateContentEntryForm /> : null}
    </PageStack>
  );
}
