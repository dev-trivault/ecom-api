// PM2 process for ecom-api on the shared VPS. Runs the live release; settings come from
// /srv/ecom/current/.env, a link to /srv/ecom/shared/ecom-api.env (the app reads it on start).
module.exports = {
  apps: [
    {
      name: 'ecom-api',
      cwd: '/srv/ecom/current',
      script: 'dist/main.js',
      exec_mode: 'fork',
      // One process only: login rate limits are counted in memory.
      instances: 1,
      // The box is shared with Wisedor, so keep this small.
      max_memory_restart: '400M',
      kill_timeout: 10000,
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
