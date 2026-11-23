# 🂡 Cercle Privé — ton site de poker est en train de démarrer

La première fois, l'installation prend **5 à 10 minutes** (tu vois la progression dans le terminal en bas).

Quand c'est prêt, le site s'ouvre tout seul dans un nouvel onglet.
Sinon : clique sur l'onglet **PORTS** (en bas), puis sur l'icône 🌐 à côté de **Cercle Privé — le site**.

## Inviter tes amis
1. Copie l'adresse du site (elle ressemble à `https://xxxx-3000.app.github.dev`).
2. Crée ton compte (le premier compte est administrateur), puis un salon.
3. Clique sur **Inviter** : envoie le lien à tes amis par WhatsApp ou Discord.

Si un ami voit une page GitHub de connexion au lieu du site : onglet **PORTS** → clic droit sur le port 3000 → **Visibilité du port** → **Public**.

## Bon à savoir
- Le site fonctionne tant que ce Codespace est allumé. GitHub l'éteint après **30 minutes sans activité de ta part** : pour une soirée poker, mets le délai à 4 h dans https://github.com/settings/codespaces (« Default idle timeout »).
- Pour rallumer plus tard : https://github.com/codespaces → clique sur ton Codespace. Les comptes et les parties sont conservés.
- Le site redémarre tout seul à chaque rallumage. En cas de souci, tape dans le terminal : `bash scripts/codespace-start.sh`
