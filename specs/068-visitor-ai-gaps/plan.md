# Plan d'implémentation : IA visiteur, écarts PRD §10.1 / COMP-010 (spec 068)

**Spec** : `specs/068-visitor-ai-gaps/spec.md`
**Dépendances** : spec 034 (passerelle), 050 (D2), 063 (réponses réelles du formulaire).

## Surfaces impactées
- **Backend API** : `modules/ai/visitor-ai.service.ts` (port « offres publiées », résolution et validation des offres), `modules/ai/core/{ai-gateway.service,ai-prompts,ai-guardrails,ai-provider.port}.ts`, `runtime/assurmatch-runtime.ts` (dépendance de `visitorAi`, commentaire `// Lot 2 (spec 068)`). La route HTTP `POST /ai/visitor/:assistType` est générique : aucune nouvelle route.
- **Shared packages** : `packages/shared/contracts/ai.contracts.ts`.
- **Web Publique Client** : `components/visitor-ai-assistant.tsx` (modes `guarantees`, `compare`), pages `offers/[offerId]` et `compare` (une ligne de montage chacune), nouveau `components/visitor-field-help.tsx` (contexte + slot), `components/ui/field.tsx` (slot), `components/quote-form.tsx` (fournisseur monté autour de la grille de champs : montage minimal, fichier propriété du lot 1), `messages/{fr,en}.json` (clés `VisitorAi`).
- **Base de données / Docker / back-offices** : aucun changement.

## Architecture
```
Détail d'offre / Comparaison / Champ du formulaire
  → VisitorAiAssistant | VisitorFieldHelpSlot   (visible seulement si availability.enabled)
  → POST /ai/visitor/visitor_{guarantee_explainer|compare_explainer|form_help}
  → VisitorAiService : schéma zod, limite 20/h/IP, pays/produit publics,
      offres résolues côté serveur (selectableOffer / compare) → entrée de faits publics
  → AiGateway.run : flags (global + pays + produit) → quota → minimisation → file
  → execute : fournisseur (repli TemplateAiProvider FR/EN) → garde-fous → persistance → audit
  → GET /ai/visitor/interactions/:id (polling) → texte + mention IA, jamais appliqué
```
Décisions : flag global `ai_summary_enabled` pour les deux nouveaux types (explication, pas recommandation) ; clé `offerName` (et non `name`, que le minimiseur supprime) ; motifs interdits de recommandation appliqués à tous les types `visitor_*`.

## Risques
- Quota partagé (20/h/IP) entre toutes les assistances : l'aide par champ met en cache par champ.
- `fieldLabel` fourni par le client (voir spec, hors périmètre).
