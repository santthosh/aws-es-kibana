FROM node:8

WORKDIR /app

RUN useradd -ms /bin/bash aws-es-kibana
RUN chown aws-es-kibana:aws-es-kibana /app

COPY package.json /app
RUN npm install
COPY index.js /app
RUN mkdir /root/.aws && cd /root/.aws && touch credentials

EXPOSE 9200

ENTRYPOINT ["node", "index.js"]
