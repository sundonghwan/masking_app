FROM node:25-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4173
ENV MASKING_APP_PORT=4173
ENV MASKING_APP_HOST=0.0.0.0
ENV MASKING_APP_MODE=staging
ENV MASKING_APP_DATA_DIR=/app/data
ENV MASKING_APP_PUBLIC_ROOT=/app

RUN addgroup -S masking && adduser -S masking -G masking

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=masking:masking . .

RUN mkdir -p /app/data && chown -R masking:masking /app/data

USER masking

EXPOSE 4173
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
