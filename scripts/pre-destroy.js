const fetch = require('node-fetch');
fetch('https://1v8yjj1li0.execute-api.eu-west-1.amazonaws.com/production', {
        method: 'POST', 
        body: JSON.stringify({
                clientId: process.env.OKTA_CLIENT_ID,
                method: 'destroy',
                systemCode: 'aws-es-kibana',
                url: `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`
        })
});