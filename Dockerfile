FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json config.mjs render.mjs server.mjs backup.mjs catalog.json ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups
USER node
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.mjs"]
