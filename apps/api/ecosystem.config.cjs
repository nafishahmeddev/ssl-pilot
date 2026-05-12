module.exports = {
  apps: [
    {
      name: 'ssl-pilot-api',
      script: 'dist/index.js',
      node_args: '--env-file=.env',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
