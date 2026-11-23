# Calcule l'adresse publique du site dans GitHub Codespaces.
if [ -n "$CODESPACE_NAME" ] && [ -n "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" ]; then
  export PUBLIC_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  export PUBLIC_URL="${PUBLIC_URL:-http://localhost:3000}"
fi
export PORT=3000
