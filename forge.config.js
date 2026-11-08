module.exports = {
    packagerConfig: {
        icon: './assets/icon'
    },

    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'input_manager',
                authors: 'nzro',
                description: 'Input Manager',
                setupExe: 'InputManagerSetup.exe',
                setupIcon: './assets/favicon.ico'
            }
        }
    ]
};