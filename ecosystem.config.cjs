module.exports = {
  apps: [
    {
      name: 'ultrasound-ledger',
      script: 'node_modules/.bin/tsx',
      args: 'server/index.ts',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
    },
  ],
};
