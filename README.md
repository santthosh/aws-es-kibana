# AWS ES/Kibana Proxy

AWS ElasticSearch/Kibana Proxy to access your [AWS ES](https://aws.amazon.com/elasticsearch-service/) cluster. 

This is the solution for accessing your cluster if you have [configured access policies](http://docs.aws.amazon.com/elasticsearch-service/latest/developerguide/es-createupdatedomains.html#es-createdomain-configure-access-policies) for your ES domain

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/santthosh/aws-es-kibana)

## Usage

Install the npm module 

    npm install -g aws-es-kibana
    
[![NPM Stats](https://nodei.co/npm/aws-es-kibana.png?downloads=true)](https://npmjs.org/package/aws-es-kibana)

Set AWS credentials
                          
    export AWS_ACCESS_KEY_ID=XXXXXXXXXXXXXXXXXXX
    export AWS_SECRET_ACCESS_KEY=XXXXXXXXXXXXXXXXXXX

Run the proxy

    aws-es-kibana <cluster-endpoint>

Alternativly, you can set the _AWS_PROFILE_ environment variable

    AWS_PROFILE=myprofile aws-es-kibana <cluster-endpoint>
    
Example 

![aws-es-kibana](https://raw.githubusercontent.com/santthosh/aws-es-kibana/master/aws-es-kibana.png)

## Credits

Adopted from this [gist](https://gist.github.com/nakedible-p/ad95dfb1c16e75af1ad5). Thanks [@nakedible-p](https://github.com/nakedible-p)

