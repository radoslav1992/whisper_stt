module.exports = {
    apps: [
        {
            name: 'adwhisper',
            script: 'npx',
            args: 'serve dist -l 4323',
            cwd: '/var/www/adwhisper',
            env: {
                NODE_ENV: 'production',
            },
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '200M',
        },
    ],
};
