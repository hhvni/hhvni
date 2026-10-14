// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Le React Compiler n'est pas activé (app.json : pas d'experiments.reactCompiler).
    // - `useRef(new Animated.Value(0)).current` est le schéma documenté de l'API Animated.
    // - Les scènes de jeu gardent leur état dans une ref mutée à chaque image puis forcent
    //   un rendu (useRerender) : copier l'état dans useState 60 fois par seconde serait coûteux.
    // Ces deux règles, pensées pour le compilateur, sont donc désactivées.
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
    },
  },
]);
