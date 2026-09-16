module.exports = {
  apps: [
    {
      name: 'meal-hub-server',
      script: 'meal-hub-server.js',
      cwd: '/Volumes/X10 Pro/Olof Ekman Portfolio Website 2026',
      watch: false,
      restart_delay: 4000,
      max_memory_restart: '500M'
    },
    {
      name: 'cloudflare-tunnel',
      script: '/opt/homebrew/bin/cloudflared',
      args: 'tunnel run meal-planner',
      cwd: '/Users/Olof_1/.cloudflared',
      watch: false,
      restart_delay: 4000
    }
  ]
};
