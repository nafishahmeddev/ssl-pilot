export default {
  apps: [
    {
      name: 'ssl-pilot-api',
      script: 'dist/index.js',
      node_args: '--env-file=.env',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
