module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@ui': './components/ui',
            '@db': './db',
            '@utils': './utils'
          }
        }
      ],
      ['inline-import', { extensions: ['.sql'] }],
      "react-native-reanimated/plugin",
    ]
  };
};
