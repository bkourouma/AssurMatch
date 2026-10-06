# API contract: 053

Toutes les routes exigent une authentification et une MFA. Le tenant est celui de l'acteur. Erreurs au format 050/051 : `{ code, message, correlationId }`. **W** = `brokerWriteActor` (403 `PARTNER_SUSPENDED` pour un courtier suspendu) et inscription dans `BROKER_TENANT_WRITE_GUARDED`.

## Compte courtier (`/broker/account`)
| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| GET | `/broker/account/profile` | `broker_account:read` | — | `BrokerAccountView` (profil, plan, quota, SLA, statut effectif, couverture, demandes en attente) |
| PATCH | `/broker/account/profile` | `broker_account:write`, W | `brokerProfileUpdateSchema` (strict) | 200 / 400 champ interdit / 409 `PARTNER_UPDATE_CONFLICT` |
| GET | `/broker/account/coverage` | `broker_account:read` | — | `BrokerCoverageView` |
| GET | `/broker/account/requests` | `broker_account:read` | — | `PartnerChangeRequestView[]` |
| POST | `/broker/account/requests/profile` | `broker_account:write`, W | `partnerProfileChangeRequestSchema` | 201 / 409 `PARTNER_REQUEST_PENDING` |
| POST | `/broker/account/requests/coverage` | `broker_account:write`, W | `partnerCoverageExtensionRequestSchema` | 201 / 409 déjà autorisé ou demande identique / 422 inexistant |
| POST | `/broker/account/requests/:id/cancel` | `broker_account:write`, W | `{ reason? }` | 200 / 404 / 409 déjà décidée |

## Licences (`/broker/licenses`)
| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| GET | `/broker/licenses` | `broker_account:read` | — | `BrokerLicenseView[]` (historique sans motif, documents sans clé) |
| POST | `/broker/licenses/:id/renewals` | `broker_account:write`, W | `brokerLicenseRenewalSchema` | 201 licence `draft` / 404 / 409 révoquée, remplacée ou renouvellement en cours |
| POST | `/broker/licenses/:id/documents` | `broker_account:write`, W | multipart `file`, `reason?` | 201 `{ license, document }` ; licence `pending_review` si sain / 404 / 409 statut / 422 fichier |

## Équipe (`/broker/team`)
| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| GET | `/broker/team` | `broker_team:read` | — | `BrokerTeamMemberView[]` |
| POST | `/broker/team` | `broker_team:write`, W | `{ email, displayName, role ∈ manager/agent/read_only, reason? }` | 201 `{ member, emailStatus }` (jamais de jeton) / 409 e-mail |
| POST | `/broker/team/:userId/deactivate` | `broker_team:write`, W | `{ reason }` | 200 / 403 Manager sur propriétaire / 404 / 422 `TEAM_SELF_ACTION`, `TEAM_LAST_OWNER` |
| POST | `/broker/team/:userId/reactivate` | `broker_team:write`, W | `{ reason }` | 200 / 403 / 404 / 409 non désactivé |
| PATCH | `/broker/team/:userId/role` | `broker_team:write`, W | `{ role, reason }` | 200 / 403 propriétaire / 404 / 422 `TEAM_SELF_ACTION` |

## Admin (`/admin/partner-requests`)
| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| GET | `/admin/partner-requests` | `partners:read` + périmètre | `?partnerTenantId&status&type` | `PartnerChangeRequestView[]` |
| POST | `/admin/partner-requests/:id/decision` | `partners:update` + périmètre (via `PartnerAdminService`) | `{ decision: accepted|rejected, reason }` | 200 / 403 / 409 `PARTNER_REQUEST_ALREADY_DECIDED` / 409 doublon RCCM / 422 licence requise pour le pays |

## Authentification (modifié)
Toute route protégée : 401 pour un utilisateur courtier `suspended`, `locked` ou `deleted` (R6).
