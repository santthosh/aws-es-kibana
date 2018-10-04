FROM node:10

WORKDIR /app

RUN useradd -ms /bin/bash aws-es-kibana
RUN chown aws-es-kibana:aws-es-kibana /app

USER aws-es-kibana

COPY --chown=aws-es-kibana package.json /app
RUN npm install
COPY --chown=aws-es-kibana index.js /app

EXPOSE 9200

ENTRYPOINT ["node", "index.js"]
