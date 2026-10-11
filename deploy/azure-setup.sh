#!/usr/bin/env bash
# One time setup of everything Smart Reading Coach needs in Azure.
#
# Run it in Azure Cloud Shell (bash) or in a terminal where you have run `az login`:
#   MONGO_URL='mongodb+srv://...' GITHUB_ORG=<your github user or org> ./deploy/azure-setup.sh
#
# It creates: a resource group, a container registry, a PostgreSQL server, a Container Apps
# environment with two apps (API and web), and a sign in for GitHub Actions that needs no
# stored password (OpenID Connect). Passwords are generated and stored as secrets in Azure.
# Nothing in this file is a secret, so it can be committed.
set -euo pipefail

# ---- Settings (change these) ---------------------------------------------------------------
# The region must be one your subscription allows. Azure for Students limits this to a few
# regions: look under Azure Policy > Assignments > "Allowed resource deployment regions".
LOCATION="${LOCATION:-swedencentral}"
# Lowercase letters and digits only. Used in the names of all resources.
APP="${APP:-smartreadingcoach}"
# Short extra text to make globally unique names (registry, database server).
SUFFIX="${SUFFIX:-$(openssl rand -hex 3)}"
# The two GitHub repositories (name only, without the organisation).
GITHUB_REPO_API="${GITHUB_REPO_API:-smart-reading-coach-api}"
GITHUB_REPO_WEB="${GITHUB_REPO_WEB:-smart-reading-coach}"

# ---- Required input ------------------------------------------------------------------------
: "${GITHUB_ORG:?Set GITHUB_ORG to your GitHub user or organisation name}"
: "${MONGO_URL:?Set MONGO_URL to the connection string of your MongoDB Atlas cluster}"

# ---- Names ---------------------------------------------------------------------------------
RG="rg-${APP}"
ACR="${APP}${SUFFIX}"
PG="psql-${APP}-${SUFFIX}"
PG_DB="smart_reading_coach"
PG_USER="coachadmin"
CAE="cae-${APP}"
API_APP="ca-${APP}-api"
WEB_APP="ca-${APP}-web"
PLACEHOLDER_IMAGE="mcr.microsoft.com/k8se/quickstart:latest"

# The "containerapp" commands live in an extension of the Azure CLI.
az extension add --name containerapp --upgrade --yes --only-show-errors

SUBSCRIPTION_ID=$(az account show --query id --output tsv)
TENANT_ID=$(az account show --query tenantId --output tsv)

# Random passwords without special characters, so they are safe inside a connection string.
random_secret() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
PG_PASSWORD="$(random_secret 24)Aa1"
JWT_SECRET="$(random_secret 48)"

echo "Subscription: $SUBSCRIPTION_ID, region: $LOCATION, resource group: $RG"

# ---- 1. Resource providers (a new subscription often has them switched off) -----------------
for provider in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL; do
    az provider register --namespace "$provider" --wait
done

# ---- 2. Resource group and container registry ----------------------------------------------
az group create --name "$RG" --location "$LOCATION" --output none
az acr create --resource-group "$RG" --name "$ACR" --sku Basic --output none
ACR_ID=$(az acr show --name "$ACR" --query id --output tsv)

# ---- 3. PostgreSQL --------------------------------------------------------------------------
# --public-access 0.0.0.0 allows connections from Azure services (the container apps). The
# server still needs the password and uses TLS. A private network would be safer but costs more.
az postgres flexible-server create \
    --resource-group "$RG" --name "$PG" --location "$LOCATION" \
    --admin-user "$PG_USER" --admin-password "$PG_PASSWORD" \
    --sku-name Standard_B1ms --tier Burstable --version 16 --storage-size 32 \
    --public-access 0.0.0.0 --yes --output none
az postgres flexible-server db create \
    --resource-group "$RG" --server-name "$PG" --database-name "$PG_DB" --output none
POSTGRES_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG}.postgres.database.azure.com:5432/${PG_DB}?sslmode=require"

# ---- 4. Container Apps environment and the two apps -----------------------------------------
az containerapp env create --resource-group "$RG" --name "$CAE" --location "$LOCATION" --output none

# Both apps start with a placeholder image. The pipeline deploys the real images.
create_app() { # $1 = name of the app
    az containerapp create \
        --resource-group "$RG" --environment "$CAE" --name "$1" \
        --image "$PLACEHOLDER_IMAGE" --target-port 80 --ingress external \
        --cpu 0.25 --memory 0.5Gi --min-replicas 0 --max-replicas 2 \
        --system-assigned --output none
}
create_app "$WEB_APP"
create_app "$API_APP"

# Let both apps pull images from the registry with their own identity (no registry password).
for app in "$WEB_APP" "$API_APP"; do
    PRINCIPAL=$(az containerapp show --resource-group "$RG" --name "$app" \
        --query identity.principalId --output tsv)
    az role assignment create --assignee-object-id "$PRINCIPAL" --assignee-principal-type ServicePrincipal \
        --role AcrPull --scope "$ACR_ID" --output none
done
# A new role assignment takes a while to apply, so try a few times.
for app in "$WEB_APP" "$API_APP"; do
    for attempt in 1 2 3 4 5 6; do
        if az containerapp registry set --resource-group "$RG" --name "$app" \
            --server "${ACR}.azurecr.io" --identity system --output none; then
            break
        fi
        echo "Role not active yet (attempt $attempt), waiting 20 seconds..."
        sleep 20
    done
done

# The real images listen on these ports.
az containerapp ingress update --resource-group "$RG" --name "$WEB_APP" --target-port 8080 --output none
az containerapp ingress update --resource-group "$RG" --name "$API_APP" --target-port 3000 --output none

WEB_FQDN=$(az containerapp show --resource-group "$RG" --name "$WEB_APP" \
    --query properties.configuration.ingress.fqdn --output tsv)
API_FQDN=$(az containerapp show --resource-group "$RG" --name "$API_APP" \
    --query properties.configuration.ingress.fqdn --output tsv)

# ---- 5. Secrets and settings of the API -----------------------------------------------------
# The values live in Azure (as secrets), never in the repository or in the pipeline.
az containerapp secret set --resource-group "$RG" --name "$API_APP" --output none \
    --secrets "jwt-secret=$JWT_SECRET" "postgres-url=$POSTGRES_URL" "mongo-url=$MONGO_URL"
az containerapp update --resource-group "$RG" --name "$API_APP" --output none \
    --set-env-vars \
    NODE_ENV=production \
    "CORS_ORIGIN=https://${WEB_FQDN}" \
    JWT_SECRET=secretref:jwt-secret \
    POSTGRES_URL=secretref:postgres-url \
    MONGO_URL=secretref:mongo-url \
    MONGO_DB=smart_reading_coach_files

# ---- 6. Sign in for GitHub Actions (OpenID Connect, no password to store) --------------------
APP_ID=$(az ad app create --display-name "github-${APP}-deploy" --query appId --output tsv)
SP_ID=$(az ad sp create --id "$APP_ID" --query id --output tsv)
RG_ID=$(az group show --name "$RG" --query id --output tsv)
# Contributor on the resource group to deploy, AcrPush on the registry to push images.
for role_scope in "Contributor|$RG_ID" "AcrPush|$ACR_ID"; do
    az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
        --role "${role_scope%%|*}" --scope "${role_scope#*|}" --output none
done

# Only the "production" environment of these two repositories may sign in.
for repo in "$GITHUB_REPO_API" "$GITHUB_REPO_WEB"; do
    az ad app federated-credential create --id "$APP_ID" --output none --parameters "{
        \"name\": \"${repo}-production\",
        \"issuer\": \"https://token.actions.githubusercontent.com\",
        \"subject\": \"repo:${GITHUB_ORG}/${repo}:environment:production\",
        \"audiences\": [\"api://AzureADTokenExchange\"]
    }"
done

# ---- Done -----------------------------------------------------------------------------------
cat <<SUMMARY

Azure is ready.

Website:  https://${WEB_FQDN}
API:      https://${API_FQDN}/api/health   (works after the first deploy)

Next steps
1. In BOTH GitHub repositories, create an environment called "production"
   (Settings > Environments) and add these variables to it:

     AZURE_CLIENT_ID        ${APP_ID}
     AZURE_TENANT_ID        ${TENANT_ID}
     AZURE_SUBSCRIPTION_ID  ${SUBSCRIPTION_ID}
     AZURE_RESOURCE_GROUP   ${RG}
     ACR_NAME               ${ACR}
     API_APP_NAME           ${API_APP}
     WEB_APP_NAME           ${WEB_APP}      (only needed in the frontend repository)

2. Deploy the API first, then the frontend (push to the main branch, or run the workflow by hand).
3. Load the catalogue once:
     az containerapp exec --resource-group ${RG} --name ${API_APP} \\
         --command "node dist/scripts/importCatalog.js"
4. Delete everything when you are done, to stop the costs:
     az group delete --name ${RG} --yes --no-wait
SUMMARY
